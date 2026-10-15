import type { FastifyPluginAsync } from "fastify";
import { PassThrough, type Readable } from "node:stream";
import type { WebSocket } from "ws";
import type { LogLine, LogWsMessage } from "../../shared/types.js";
import { SESSION_COOKIE_NAME } from "../auth/middleware.js";
import { validateSession } from "../auth/session.js";
import { docker } from "../docker.js";

const MAX_LINE_LEN = 64 * 1024;
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s(.*)$/;

function parseLogLine(raw: string, defaultStream: "out" | "err"): LogLine {
  const match = TIMESTAMP_REGEX.exec(raw);
  if (match && match[1] && match[2] !== undefined) {
    return {
      s: defaultStream,
      ts: match[1],
      m: match[2],
    };
  }
  return {
    s: defaultStream,
    ts: new Date().toISOString(),
    m: raw,
  };
}

class LineChunkParser {
  private buffer = "";

  constructor(
    private readonly streamType: "out" | "err",
    private readonly onLine: (line: LogLine) => void,
  ) {}

  push(chunk: Buffer | string): void {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let newlineIdx: number;

    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      let rawLine = this.buffer.slice(0, newlineIdx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (rawLine.length > MAX_LINE_LEN) {
        rawLine = `${rawLine.slice(0, MAX_LINE_LEN)} [LINHA TRUNCADA - EXCEDEU 64KB]`;
      }

      this.onLine(parseLogLine(rawLine, this.streamType));
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      let rawLine = this.buffer.replace(/\r$/, "");
      if (rawLine.length > MAX_LINE_LEN) {
        rawLine = `${rawLine.slice(0, MAX_LINE_LEN)} [LINHA TRUNCADA - EXCEDEU 64KB]`;
      }
      this.onLine(parseLogLine(rawLine, this.streamType));
      this.buffer = "";
    }
  }
}

export const logsWsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/ws/containers/:id/logs",
    { websocket: true },
    async (socket: WebSocket, request) => {
      // 1. Origin verification
      const origin = request.headers.origin;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          const requestHost = request.headers.host;
          if (originHost !== requestHost) {
            socket.send(
              JSON.stringify({
                t: "error",
                m: "Origem não permitida (CSRF detectado)",
              } satisfies LogWsMessage),
            );
            socket.close(4403, "Forbidden Origin");
            return;
          }
        } catch {
          socket.close(4403, "Invalid Origin Header");
          return;
        }
      }

      // 2. Auth via session cookie
      const cookies = request.cookies;
      const sessionToken = cookies[SESSION_COOKIE_NAME];
      if (!sessionToken) {
        socket.send(
          JSON.stringify({
            t: "error",
            m: "Sessão não autenticada. Faça login.",
          } satisfies LogWsMessage),
        );
        socket.close(4401, "Unauthorized");
        return;
      }

      const sessionResult = validateSession(sessionToken);
      if (!sessionResult) {
        socket.send(
          JSON.stringify({
            t: "error",
            m: "Sessão inválida ou expirada.",
          } satisfies LogWsMessage),
        );
        socket.close(4401, "Session Expired");
        return;
      }

      const { id } = request.params as { id: string };
      const query = (request.query || {}) as {
        tail?: string;
        since?: string;
        stdout?: string;
        stderr?: string;
        timestamps?: string;
      };

      const tailCount = Math.min(Math.max(parseInt(query.tail || "200", 10) || 200, 1), 5000);
      const sinceSec = query.since ? parseInt(query.since, 10) || 0 : 0;
      const wantStdout = query.stdout !== "0" && query.stdout !== "false";
      const wantStderr = query.stderr !== "0" && query.stderr !== "false";

      let rawStream: Readable | null = null;
      let batchTimer: NodeJS.Timeout | null = null;
      let pendingBatch: LogLine[] = [];
      let isClosed = false;

      const flushBatch = () => {
        batchTimer = null;
        if (isClosed || pendingBatch.length === 0) return;
        if (socket.readyState !== socket.OPEN) return;

        const msg: LogWsMessage = {
          t: "batch",
          lines: pendingBatch,
        };
        pendingBatch = [];
        socket.send(JSON.stringify(msg));
      };

      const queueLine = (line: LogLine) => {
        if (isClosed) return;

        // Backpressure check
        if (socket.bufferedAmount > 1024 * 1024) {
          if (!rawStream?.isPaused()) {
            rawStream?.pause();
            setTimeout(() => {
              if (!isClosed && rawStream?.isPaused()) {
                rawStream.resume();
              }
            }, 100);
          }
        }

        pendingBatch.push(line);
        if (pendingBatch.length >= 100) {
          if (batchTimer) {
            clearTimeout(batchTimer);
            batchTimer = null;
          }
          flushBatch();
        } else if (!batchTimer) {
          batchTimer = setTimeout(flushBatch, 50);
        }
      };

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;

        if (batchTimer) {
          clearTimeout(batchTimer);
          batchTimer = null;
        }

        if (rawStream) {
          try {
            rawStream.destroy();
          } catch {
            // Ignore stream destruction errors
          }
          rawStream = null;
        }
      };

      socket.on("close", cleanup);
      socket.on("error", cleanup);

      try {
        const container = docker.getContainer(id);
        const inspect = await container.inspect();
        const isTty = !!inspect.Config?.Tty;

        const outParser = new LineChunkParser("out", queueLine);
        const errParser = new LineChunkParser("err", queueLine);

        // Fetch logs stream
        const logOpts = {
          follow: true as const,
          stdout: wantStdout,
          stderr: wantStderr,
          tail: tailCount,
          timestamps: true,
          ...(sinceSec > 0 ? { since: sinceSec } : {}),
        };

        const streamResult = (await container.logs(logOpts)) as unknown as Readable;
        if (isClosed) {
          streamResult.destroy();
          return;
        }

        rawStream = streamResult;

        if (isTty) {
          rawStream.on("data", (chunk: Buffer | string) => {
            outParser.push(chunk);
          });
        } else {
          const outPassthrough = new PassThrough();
          const errPassthrough = new PassThrough();

          outPassthrough.on("data", (chunk: Buffer | string) => {
            if (wantStdout) outParser.push(chunk);
          });

          errPassthrough.on("data", (chunk: Buffer | string) => {
            if (wantStderr) errParser.push(chunk);
          });

          docker.modem.demuxStream(rawStream, outPassthrough, errPassthrough);
        }

        rawStream.on("end", () => {
          outParser.flush();
          errParser.flush();
          flushBatch();

          if (!isClosed && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({ t: "end" } satisfies LogWsMessage));
            socket.close(1000, "Log stream finished");
          }
          cleanup();
        });

        rawStream.on("error", (err: Error) => {
          if (!isClosed && socket.readyState === socket.OPEN) {
            socket.send(
              JSON.stringify({
                t: "error",
                m: `Erro no stream de logs: ${err.message}`,
              } satisfies LogWsMessage),
            );
          }
          cleanup();
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isClosed && socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              t: "error",
              m: `Container não encontrado ou inacessível: ${msg}`,
            } satisfies LogWsMessage),
          );
          socket.close(4404, "Container Not Found");
        }
        cleanup();
      }
    },
  );
};
