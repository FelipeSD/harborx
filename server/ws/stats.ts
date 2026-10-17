import type { FastifyPluginAsync } from "fastify";
import type { Readable } from "node:stream";
import type { WebSocket } from "ws";
import { SESSION_COOKIE_NAME } from "../auth/middleware.js";
import { validateSession } from "../auth/session.js";
import { docker } from "../docker.js";

export interface ContainerStatsPayload {
  id: string;
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
  memPercent: number;
  rxBytes: number;
  txBytes: number;
  ioReadBytes: number;
  ioWriteBytes: number;
  pids: number;
  readAt: string;
}

export function parseDockerStats(raw: Record<string, unknown>, id: string): ContainerStatsPayload {
  const cpuStats = raw["cpu_stats"] as
    | {
        cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
        system_cpu_usage?: number;
        online_cpus?: number;
      }
    | undefined;
  const preCpuStats = raw["precpu_stats"] as
    | {
        cpu_usage?: { total_usage?: number };
        system_cpu_usage?: number;
      }
    | undefined;

  const cpuDelta =
    (cpuStats?.cpu_usage?.total_usage || 0) - (preCpuStats?.cpu_usage?.total_usage || 0);
  const systemDelta = (cpuStats?.system_cpu_usage || 0) - (preCpuStats?.system_cpu_usage || 0);
  const onlineCpus = cpuStats?.online_cpus || cpuStats?.cpu_usage?.percpu_usage?.length || 1;

  let cpuPercent = 0;
  if (systemDelta > 0 && cpuDelta > 0) {
    cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
  }
  cpuPercent = Math.round(Math.max(0, cpuPercent) * 100) / 100;

  const memStats = (raw["memory_stats"] || {}) as {
    usage?: number;
    limit?: number;
    stats?: { inactive_file?: number; cache?: number };
  };
  const cache = memStats.stats?.inactive_file || memStats.stats?.cache || 0;
  const memUsedBytes = Math.max(0, (memStats.usage || 0) - cache);
  const memLimitBytes = memStats.limit || 0;
  const memPercent =
    memLimitBytes > 0 ? Math.round((memUsedBytes / memLimitBytes) * 10000) / 100 : 0;

  let rxBytes = 0;
  let txBytes = 0;
  const networks = raw["networks"] as
    Record<string, { rx_bytes?: number; tx_bytes?: number }> | undefined;
  if (networks) {
    for (const net of Object.values(networks)) {
      rxBytes += net.rx_bytes || 0;
      txBytes += net.tx_bytes || 0;
    }
  }

  let ioReadBytes = 0;
  let ioWriteBytes = 0;
  const blkioStats = raw["blkio_stats"] as
    { io_service_bytes_recursive?: Array<{ op?: string; value?: number }> } | undefined;
  if (Array.isArray(blkioStats?.io_service_bytes_recursive)) {
    for (const entry of blkioStats.io_service_bytes_recursive) {
      const op = String(entry.op).toLowerCase();
      if (op === "read") ioReadBytes += entry.value || 0;
      if (op === "write") ioWriteBytes += entry.value || 0;
    }
  }

  const pidsStats = raw["pids_stats"] as { current?: number } | undefined;
  const pids = pidsStats?.current || 0;

  return {
    id,
    cpuPercent,
    memUsedBytes,
    memLimitBytes,
    memPercent,
    rxBytes,
    txBytes,
    ioReadBytes,
    ioWriteBytes,
    pids,
    readAt: (raw["read"] as string) || new Date().toISOString(),
  };
}

export const statsWsRoute: FastifyPluginAsync = async (fastify) => {
  // 1. GET /api/containers/:id/stats (HTTP Snapshot)
  fastify.get<{ Params: { id: string } }>("/api/containers/:id/stats", async (request, reply) => {
    const { id } = request.params;
    try {
      const container = docker.getContainer(id);
      const raw = await container.stats({ stream: false });
      return parseDockerStats(raw as unknown as Record<string, unknown>, id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao obter métricas: ${msg}` });
    }
  });

  // 2. WebSocket GET /ws/containers/:id/stats (Per-container stream)
  fastify.get(
    "/ws/containers/:id/stats",
    { websocket: true },
    async (socket: WebSocket, request) => {
      const origin = request.headers.origin;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          const requestHost = request.headers.host;
          if (originHost !== requestHost) {
            socket.close(4403, "Forbidden Origin");
            return;
          }
        } catch {
          socket.close(4403, "Invalid Origin");
          return;
        }
      }

      const cookies = request.cookies;
      const sessionToken = cookies[SESSION_COOKIE_NAME];
      if (!sessionToken || !validateSession(sessionToken)) {
        socket.close(4401, "Unauthorized");
        return;
      }

      const { id } = request.params as { id: string };
      let isClosed = false;
      let rawStream: Readable | null = null;
      let buffer = "";

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (rawStream) {
          try {
            rawStream.destroy();
          } catch {
            // Ignore
          }
          rawStream = null;
        }
      };

      socket.on("close", cleanup);
      socket.on("error", cleanup);

      try {
        const container = docker.getContainer(id);
        const stream = (await container.stats({ stream: true })) as unknown as Readable;

        if (isClosed) {
          stream.destroy();
          return;
        }

        rawStream = stream;

        rawStream.on("data", (chunk: Buffer | string) => {
          if (isClosed || socket.readyState !== socket.OPEN) return;

          buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
          let newlineIdx: number;

          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            const rawLine = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (!rawLine) continue;

            try {
              const raw = JSON.parse(rawLine);
              const stats = parseDockerStats(raw, id);
              socket.send(JSON.stringify(stats));
            } catch {
              // Ignore partial JSON
            }
          }
        });

        rawStream.on("error", () => {
          cleanup();
        });

        rawStream.on("end", () => {
          cleanup();
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isClosed && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ error: msg }));
        }
        cleanup();
      }
    },
  );
};
