import type { FastifyPluginAsync } from "fastify";
import type { Readable } from "node:stream";
import type { WebSocket } from "ws";
import { SESSION_COOKIE_NAME } from "../auth/middleware.js";
import { validateSession } from "../auth/session.js";
import { docker } from "../docker.js";

export interface NormalizedDockerEvent {
  type: string;
  action: string;
  id: string;
  name: string;
  time: number;
  attributes: Record<string, string>;
}

export const eventsWsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/ws/events", { websocket: true }, async (socket: WebSocket, request) => {
    // 1. Origin verification
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
        socket.close(4403, "Invalid Origin Header");
        return;
      }
    }

    // 2. Auth via session cookie (viewer+ allowed)
    const cookies = request.cookies;
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (!sessionToken) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const sessionResult = validateSession(sessionToken);
    if (!sessionResult) {
      socket.close(4401, "Session Expired");
      return;
    }

    let isClosed = false;
    let eventStream: Readable | null = null;
    let buffer = "";

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;

      if (eventStream) {
        try {
          eventStream.destroy();
        } catch {
          // Ignore
        }
        eventStream = null;
      }
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);

    try {
      const stream = (await docker.getEvents({
        filters: {
          type: ["container", "image", "network", "volume"],
        },
      })) as unknown as Readable;

      if (isClosed) {
        stream.destroy();
        return;
      }

      eventStream = stream;

      eventStream.on("data", (chunk: Buffer | string) => {
        if (isClosed || socket.readyState !== socket.OPEN) return;

        buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        let newlineIdx: number;

        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const rawLine = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);

          if (!rawLine) continue;

          try {
            const raw = JSON.parse(rawLine);
            const event: NormalizedDockerEvent = {
              type: raw.Type || "container",
              action: raw.Action || raw.status || "update",
              id: raw.id || raw.Actor?.ID || "",
              name: raw.Actor?.Attributes?.name || raw.from || (raw.id ? raw.id.slice(0, 12) : ""),
              time: raw.time || Math.floor(Date.now() / 1000),
              attributes: raw.Actor?.Attributes || {},
            };

            socket.send(JSON.stringify(event));
          } catch {
            // Ignore partial JSON parse errors
          }
        }
      });

      eventStream.on("error", (err: Error) => {
        if (!isClosed && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ error: err.message }));
        }
        cleanup();
      });

      eventStream.on("end", () => {
        cleanup();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isClosed && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ error: `Falha ao conectar eventos: ${msg}` }));
      }
      cleanup();
    }
  });
};
