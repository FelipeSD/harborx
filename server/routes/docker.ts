import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import type {
  ImageSummary,
  NetworkSummary,
  SystemInfo,
  VolumeSummary,
} from "../../shared/types.js";
import { requireRole } from "../auth/middleware.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { docker } from "../docker.js";
import { logAudit, queryAuditLogs } from "../services/audit.js";
import { getHostMetricsHistory } from "../services/metrics.js";

const DF_CACHE_TTL_MS = 30_000;
let dfCache: { data: Record<string, unknown>; expiresAt: number } | null = null;
let dfInFlight: Promise<Record<string, unknown>> | null = null;

export function invalidateSystemDfCache(): void {
  dfCache = null;
}

export const dockerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/system/info
  fastify.get("/system/info", async (_request, reply) => {
    try {
      const [info, version] = await Promise.all([docker.info(), docker.version()]);

      const systemInfo: SystemInfo = {
        containers: info.Containers || 0,
        containersRunning: info.ContainersRunning || 0,
        containersPaused: info.ContainersPaused || 0,
        containersStopped: info.ContainersStopped || 0,
        images: info.Images || 0,
        serverVersion: version.Version || info.ServerVersion || "desconhecida",
        operatingSystem: info.OperatingSystem || "desconhecido",
        architecture: info.Architecture || version.Arch || "desconhecida",
        cpus: info.NCPU || 0,
        memTotal: info.MemTotal || 0,
        name: info.Name || "Docker Host",
        dockerRootDir: info.DockerRootDir || "",
      };

      return systemInfo;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply
        .status(502)
        .send({ error: `Falha ao obter informações do sistema Docker: ${msg}` });
    }
  });

  // GET /api/system/df (Disk usage breakdown — cached for 30s to avoid heavy disk scans)
  fastify.get("/system/df", async (_request, reply) => {
    const now = Date.now();
    if (dfCache && dfCache.expiresAt > now) {
      return dfCache.data;
    }

    try {
      if (!dfInFlight) {
        dfInFlight = (async () => {
          const df = await docker.df();
          const result = {
            layersSize: df.LayersSize || 0,
            images: (df.Images || []).length,
            containers: (df.Containers || []).length,
            volumes: (df.Volumes || []).length,
            buildCache: (df.BuildCache || []).length,
            raw: df,
          };
          dfCache = { data: result, expiresAt: Date.now() + DF_CACHE_TTL_MS };
          return result;
        })().finally(() => {
          dfInFlight = null;
        });
      }

      return await dfInFlight;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao obter uso de disco: ${msg}` });
    }
  });

  // GET /api/system/host-metrics (24h history for dashboard charts)
  fastify.get<{ Querystring: { hours?: string } }>("/system/host-metrics", async (request) => {
    const hours = parseInt(request.query.hours || "24", 10) || 24;
    return { points: getHostMetricsHistory(hours) };
  });

  // GET /api/system/host (Host hardware and OS metrics)
  fastify.get("/system/host", async () => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptime: os.uptime(),
      cpusCount: cpus.length,
      cpuModel: cpus[0]?.model || "CPU",
      totalMem,
      freeMem,
      usedMem: totalMem - freeMem,
    };
  });
  // GET /api/audit-logs (Audit log viewer)
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/audit-logs",
    { preHandler: [requireRole("operator", "admin")] },
    async (request) => {
      const limit = parseInt(request.query.limit || "50", 10) || 50;
      const offset = parseInt(request.query.offset || "0", 10) || 0;
      return queryAuditLogs(limit, offset);
    },
  );

  // GET /api/system/backup (Download database backup snapshot)
  fastify.get("/system/backup", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    const backupDir = path.join(config.dataDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `harborx-backup-${dateStr}.db`;
    const backupPath = path.join(backupDir, filename);

    try {
      await db.backup(backupPath);

      logAudit({
        userId: request.user?.id,
        action: "system.backup",
        target: filename,
        ip: request.ip,
      });

      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      reply.type("application/octet-stream");
      return reply.send(fs.createReadStream(backupPath));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Falha ao gerar backup: ${msg}` });
    }
  });

  // POST /api/system/prune (Unified Docker prune)
  fastify.post("/system/prune", { preHandler: [requireRole("admin")] }, async (request, reply) => {
    try {
      const [containersRes, imagesRes, networksRes, volumesRes] = await Promise.all([
        docker.pruneContainers().catch(() => ({ ContainersDeleted: [] })),
        docker.pruneImages().catch(() => ({ ImagesDeleted: [], SpaceReclaimed: 0 })),
        docker.pruneNetworks().catch(() => ({ NetworksDeleted: [] })),
        docker.pruneVolumes().catch(() => ({ VolumesDeleted: [], SpaceReclaimed: 0 })),
      ]);

      const totalReclaimed = (imagesRes.SpaceReclaimed || 0) + (volumesRes.SpaceReclaimed || 0);
      invalidateSystemDfCache();

      logAudit({
        userId: request.user?.id,
        action: "system.prune",
        target: "docker",
        details: { totalReclaimed },
        ip: request.ip,
      });

      return {
        success: true,
        containersDeleted: containersRes.ContainersDeleted?.length || 0,
        imagesDeleted: imagesRes.ImagesDeleted?.length || 0,
        networksDeleted: networksRes.NetworksDeleted?.length || 0,
        volumesDeleted: volumesRes.VolumesDeleted?.length || 0,
        spaceReclaimed: totalReclaimed,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao limpar sistema: ${msg}` });
    }
  });
};
