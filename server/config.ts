import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const isProd = process.env["NODE_ENV"] === "production";
const isWindows = process.platform === "win32";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Directory where SQLite and stacks live. Must be the SAME path inside and outside the container (see README). */
  HARBORX_DATA_DIR: z.string().default(isProd ? "/data" : "./.data"),
  /** Unix socket / named pipe path of the Docker Engine. Ignored when DOCKER_HOST is set. */
  DOCKER_SOCKET: z.string().default(isWindows ? "//./pipe/docker_engine" : "/var/run/docker.sock"),
  /** Optional, same format as the Docker CLI: unix:///path, npipe:////./pipe/x, tcp://host:2375 */
  DOCKER_HOST: z.string().optional(),
  /** Used to derive encryption keys for stored secrets. Required (min 32 chars) in production. */
  HARBORX_SECRET: z.string().optional(),
  COOKIE_SECURE: bool.default("false"),
  /** Directory with the compiled front-end (SPA). */
  STATIC_DIR: z.string().default("dist/client"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

if (isProd && (!env.HARBORX_SECRET || env.HARBORX_SECRET.length < 32)) {
  throw new Error(
    "HARBORX_SECRET is required in production and must have at least 32 characters (e.g. `openssl rand -hex 32`).",
  );
}

export type DockerConnection =
  | { socketPath: string }
  | { host: string; port: number; protocol: "http" | "https" };

function resolveDockerConnection(): DockerConnection {
  const raw = env.DOCKER_HOST;
  if (!raw) return { socketPath: env.DOCKER_SOCKET };

  if (raw.startsWith("unix://")) return { socketPath: raw.slice("unix://".length) };
  if (raw.startsWith("npipe://")) return { socketPath: raw.slice("npipe://".length).replace(/^\/\//, "//") };

  if (raw.startsWith("tcp://") || raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = new URL(raw.replace(/^tcp:/, "http:"));
    return {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 2376 : 2375)),
      protocol: url.protocol === "https:" ? "https" : "http",
    };
  }
  throw new Error(`Unsupported DOCKER_HOST value: ${raw}`);
}

function resolveStaticDir(configured?: string): string {
  if (configured && configured !== "dist/client" && configured !== ".output/public") {
    return path.resolve(configured);
  }
  if (fs.existsSync(path.resolve(".output/public/_shell.html"))) {
    return path.resolve(".output/public");
  }
  if (fs.existsSync(path.resolve("dist/client/_shell.html"))) {
    return path.resolve("dist/client");
  }
  return path.resolve(configured || ".output/public");
}

export const config = {
  isProd,
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  dataDir: path.resolve(env.HARBORX_DATA_DIR),
  secret: env.HARBORX_SECRET ?? "dev-only-insecure-secret-do-not-use-in-production",
  cookieSecure: env.COOKIE_SECURE,
  staticDir: resolveStaticDir(env.STATIC_DIR),
  docker: resolveDockerConnection(),
} as const;

