import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { config } from "./config";
import { isDockerReachable } from "./docker";
import { db } from "./db/index";
import { registerAuthHooks } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import { containerRoutes } from "./routes/containers";
import { dockerRoutes } from "./routes/docker";
import { imageRoutes } from "./routes/images";
import { networkRoutes } from "./routes/networks";
import { registryRoutes } from "./routes/registries";
import { settingsRoutes } from "./routes/settings";
import { stackRoutes } from "./routes/stacks";
import { userRoutes } from "./routes/users";
import { volumeRoutes } from "./routes/volumes";
import { webhookRoutes } from "./routes/webhooks";
import { logsWsRoute } from "./ws/logs";
import { execWsRoute } from "./ws/exec";
import { eventsWsRoute } from "./ws/events";
import { statsWsRoute } from "./ws/stats";
import { startMetricsCollector, stopMetricsCollector } from "./services/metrics";
import { syncDockerAuthConfig } from "./services/registries";
import { reconcileOrphanedDeployments } from "./services/stacks";

export async function buildApp(opts?: { logger?: boolean }) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  syncDockerAuthConfig();
  reconcileOrphanedDeployments();

  const app = Fastify({
    logger:
      opts?.logger ??
      (config.logLevel !== "silent"
        ? {
            level: config.logLevel,
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers['set-cookie']",
            ],
          }
        : false),
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  // CSP is intentionally disabled for now: the SPA shell ships inline bootstrap scripts.
  // A strict policy is part of Phase 11 (hardening).
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: config.secret });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(websocket);

  // Authentication & RBAC hooks
  registerAuthHooks(app);

  // Health endpoint
  app.get("/api/health", async () => ({
    status: "ok",
    docker: await isDockerReachable(),
  }));

  // Auth routes
  await app.register(authRoutes, { prefix: "/api/auth" });

  // Container routes
  await app.register(containerRoutes, { prefix: "/api/containers" });

  // Image, Network, Volume, Registry, Stack, Webhook and System routes
  await app.register(imageRoutes, { prefix: "/api" });
  await app.register(networkRoutes, { prefix: "/api" });
  await app.register(volumeRoutes, { prefix: "/api" });
  await app.register(registryRoutes, { prefix: "/api" });
  await app.register(settingsRoutes, { prefix: "/api" });
  await app.register(stackRoutes, { prefix: "/api" });
  await app.register(webhookRoutes, { prefix: "/api" });
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(dockerRoutes, { prefix: "/api" });

  // WebSocket routes
  await app.register(logsWsRoute);
  await app.register(execWsRoute);
  await app.register(eventsWsRoute);
  await app.register(statsWsRoute);

  const shellPath = path.join(config.staticDir, "_shell.html");
  const hasFrontend = fs.existsSync(shellPath);

  if (hasFrontend) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      index: ["_shell.html", "index.html"],
      wildcard: false,
    });
  } else {
    app.log.warn(`Front-end not found at ${config.staticDir} (run "bun run build" first).`);
  }

  // SPA fallback: any non-API / non-WS GET serves the client shell.
  app.setNotFoundHandler((request, reply) => {
    const url = request.url.split("?")[0] ?? "/";
    const isBackendPath = url.startsWith("/api/") || url === "/api" || url.startsWith("/ws/");
    if (request.method === "GET" && !isBackendPath && hasFrontend) {
      return reply.type("text/html; charset=utf-8").send(fs.createReadStream(shellPath));
    }
    return reply.code(404).send({ error: "Not found" });
  });

  return app;
}

async function main() {
  const app = await buildApp();

  // Start background host metrics collector (every 60s)
  startMetricsCollector(60000);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    try {
      stopMetricsCollector();
      db.close();
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const shellPath = path.join(config.staticDir, "_shell.html");
  const hasFrontend = fs.existsSync(shellPath);

  console.log(`[HarborX] Booting server on ${config.host}:${config.port}...`);
  console.log(`[HarborX] Static directory: ${config.staticDir} (shell exists: ${hasFrontend})`);

  const address = await app.listen({ port: config.port, host: config.host });
  console.log(`[HarborX] Server listening at ${address}`);
}

if (process.env["NODE_ENV"] !== "test") {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
