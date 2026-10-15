import type { FastifyPluginAsync } from "fastify";
import type { Duplex } from "node:stream";
import type { WebSocket } from "ws";
import { SESSION_COOKIE_NAME } from "../auth/middleware.js";
import { validateSession } from "../auth/session.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";

const SHELL_REGEX = /^(\/(bin|usr\/bin|usr\/local\/bin)\/)?[a-zA-Z0-9_-]+$/;
const USER_REGEX = /^[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)?$/;
const WORKDIR_REGEX = /^\/([a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)*)?$/;

interface ExecResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

export const execWsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/ws/containers/:id/exec",
    { websocket: true },
    async (socket: WebSocket, request) => {
      // 1. Origin verification
      const origin = request.headers.origin;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          const requestHost = request.headers.host;
          if (originHost !== requestHost) {
            socket.send(JSON.stringify({ error: "Origem não permitida (CSRF detectado)" }));
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
        socket.send(JSON.stringify({ error: "Sessão não autenticada. Faça login." }));
        socket.close(4401, "Unauthorized");
        return;
      }

      const sessionResult = validateSession(sessionToken);
      if (!sessionResult) {
        socket.send(JSON.stringify({ error: "Sessão inválida ou expirada." }));
        socket.close(4401, "Session Expired");
        return;
      }

      const user = sessionResult.user;
      if (user.role !== "admin" && user.role !== "operator") {
        socket.send(
          JSON.stringify({
            error: `Acesso negado: seu papel (${user.role}) não tem permissão para abrir terminal interativo.`,
          }),
        );
        socket.close(4403, "Forbidden Role");
        return;
      }

      const { id } = request.params as { id: string };
      const query = (request.query || {}) as {
        shell?: string;
        user?: string;
        workdir?: string;
        cols?: string;
        rows?: string;
      };

      // 3. Shell & params validation
      let requestedShell = query.shell || "sh";
      if (requestedShell === "auto") {
        requestedShell = "/bin/sh";
      }

      if (!SHELL_REGEX.test(requestedShell)) {
        socket.send(JSON.stringify({ error: "Comando de shell inválido ou não permitido." }));
        socket.close(4400, "Invalid Shell Parameter");
        return;
      }

      const execUser = query.user && USER_REGEX.test(query.user) ? query.user : undefined;
      const execWorkdir =
        query.workdir && WORKDIR_REGEX.test(query.workdir) ? query.workdir : undefined;

      const initialCols = Math.min(Math.max(parseInt(query.cols || "80", 10) || 80, 10), 500);
      const initialRows = Math.min(Math.max(parseInt(query.rows || "24", 10) || 24, 5), 200);

      // 4. Verify container is running
      let isClosed = false;
      let stream: Duplex | null = null;
      let idleTimer: NodeJS.Timeout | null = null;

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        // 30 minutes idle timeout
        idleTimer = setTimeout(
          () => {
            if (!isClosed && socket.readyState === socket.OPEN) {
              socket.send(
                "\r\n\x1b[33m[HarborX] Sessão de terminal encerrada por inatividade (30 minutos).\x1b[0m\r\n",
              );
              socket.close(4408, "Idle Timeout");
            }
            cleanup();
          },
          30 * 60 * 1000,
        );
      };

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;

        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }

        if (stream) {
          try {
            stream.end();
          } catch {
            // Ignore stream termination error
          }
          stream = null;
        }

        logAudit({
          action: "exec.close",
          userId: user.id,
          target: id,
          details: { shell: requestedShell },
          ip: request.ip,
        });
      };

      socket.on("close", cleanup);
      socket.on("error", cleanup);

      try {
        const container = docker.getContainer(id);
        const inspect = await container.inspect();

        if (inspect.State?.Status !== "running" && !inspect.State?.Running) {
          socket.send(
            JSON.stringify({
              error: `Container não está em execução (estado atual: ${inspect.State?.Status}). Inicie o container primeiro.`,
            }),
          );
          socket.close(4400, "Container Not Running");
          return;
        }

        // 5. Create exec instance
        const execOptions = {
          Cmd: [requestedShell],
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: ["TERM=xterm-256color", "COLORTERM=truecolor"],
          ...(execUser ? { User: execUser } : {}),
          ...(execWorkdir ? { WorkingDir: execWorkdir } : {}),
        };

        const execInstance = await container.exec(execOptions);
        const execStream = (await execInstance.start({
          hijack: true,
          stdin: true,
          Tty: true,
        })) as unknown as Duplex;

        if (isClosed) {
          execStream.end();
          return;
        }

        stream = execStream;

        // Set initial dimensions
        try {
          await execInstance.resize({ w: initialCols, h: initialRows });
        } catch {
          // Ignore resize race condition
        }

        logAudit({
          action: "exec.open",
          userId: user.id,
          target: id,
          details: {
            containerName: (inspect.Name || "").replace(/^\//, ""),
            shell: requestedShell,
            user: execUser,
            workdir: execWorkdir,
          },
          ip: request.ip,
        });

        resetIdleTimer();

        // 6. Pipe stream output to WebSocket
        stream.on("data", (chunk: Buffer) => {
          if (!isClosed && socket.readyState === socket.OPEN) {
            socket.send(chunk.toString("utf8"));
          }
        });

        stream.on("end", () => {
          if (!isClosed && socket.readyState === socket.OPEN) {
            socket.send("\r\n\x1b[32m[HarborX] Processo de terminal finalizado.\x1b[0m\r\n");
            socket.close(1000, "Process Exited");
          }
          cleanup();
        });

        stream.on("error", (err: Error) => {
          if (!isClosed && socket.readyState === socket.OPEN) {
            socket.send(`\r\n\x1b[31m[HarborX] Erro no terminal: ${err.message}\x1b[0m\r\n`);
          }
          cleanup();
        });

        // 7. Receive incoming input from WebSocket
        socket.on("message", (data) => {
          resetIdleTimer();
          if (!stream || isClosed) return;

          const strData = typeof data === "string" ? data : data.toString("utf8");

          // Check if it's a JSON control message
          if (strData.startsWith('{"type":"resize"') || strData.startsWith('{"type": "resize"')) {
            try {
              const msg = JSON.parse(strData) as ExecResizeMessage;
              if (
                msg.type === "resize" &&
                typeof msg.cols === "number" &&
                typeof msg.rows === "number"
              ) {
                execInstance.resize({ w: msg.cols, h: msg.rows }).catch(() => {});
                return;
              }
            } catch {
              // Not valid JSON, treat as raw input
            }
          }

          // Raw keystrokes or input
          stream.write(strData);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isClosed && socket.readyState === socket.OPEN) {
          socket.send(`\r\n\x1b[31m[HarborX] Falha ao iniciar terminal: ${msg}\x1b[0m\r\n`);
          socket.close(4500, "Exec Start Failed");
        }
        cleanup();
      }
    },
  );
};
