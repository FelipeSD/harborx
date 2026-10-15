import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { hashPassword } from "../auth/password.js";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { isDockerReachable } from "../docker.js";
import { buildApp } from "../index.js";
import { collectHostMetric, getHostMetricsHistory } from "./metrics.js";

describe("Phase 5 - Host Metrics, Stats & Docker Events Tests", () => {
  let app: FastifyInstance;
  let serverPort: number;
  let viewerCookie: string;
  let dockerAvailable = false;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const url = new URL(address);
    serverPort = parseInt(url.port, 10);

    dockerAvailable = await isDockerReachable();

    const viewerHash = await hashPassword("viewerPass123!");
    const viewerUser = createUser(`metricsviewer_${Date.now()}`, viewerHash, "viewer");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-metrics");

    viewerCookie = `harborx_session=${viewerToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare("DELETE FROM users WHERE username LIKE 'metricsviewer_%'").run();
  });

  describe("Host Metrics Service", () => {
    it("collects host metrics and retrieves historical points", async () => {
      await collectHostMetric();

      const points = getHostMetricsHistory(1);
      expect(Array.isArray(points)).toBe(true);
      expect(points.length).toBeGreaterThan(0);

      const latest = points[points.length - 1];
      expect(latest?.ts).toBeDefined();
      expect(typeof latest?.cpuPercent).toBe("number");
      expect(typeof latest?.memUsedMb).toBe("number");
      expect(typeof latest?.memTotalMb).toBe("number");
      expect(latest?.memTotalMb).toBeGreaterThan(0);
    }, 20000);

    it("serves GET /api/system/host-metrics via HTTP", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/system/host-metrics?hours=1",
        headers: {
          cookie: viewerCookie,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json.points)).toBe(true);
    });

    it("serves GET /api/system/host with machine specifications", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/system/host",
        headers: {
          cookie: viewerCookie,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.hostname).toBeDefined();
      expect(json.platform).toBeDefined();
      expect(json.cpusCount).toBeGreaterThan(0);
      expect(json.totalMem).toBeGreaterThan(0);
    });
  });

  describe("Docker Engine Events & Stats", () => {
    it("serves GET /api/system/df if Docker is reachable", async () => {
      if (!dockerAvailable) return;

      const res = await app.inject({
        method: "GET",
        url: "/api/system/df",
        headers: {
          cookie: viewerCookie,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(typeof json.layersSize).toBe("number");
      expect(typeof json.containers).toBe("number");
      expect(typeof json.images).toBe("number");
      expect(typeof json.volumes).toBe("number");
    }, 45000);

    it("connects to /ws/events and receives live connection", async () => {
      if (!dockerAvailable) return;

      const wsUrl = `ws://127.0.0.1:${serverPort}/ws/events`;
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
          headers: {
            cookie: viewerCookie,
          },
        });

        const timeout = setTimeout(() => {
          ws.close();
          resolve(); // Connection established without error
        }, 2000);

        ws.on("open", () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
        });

        ws.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    });

    it("retrieves single snapshot stats for a running container", async () => {
      if (!dockerAvailable) return;

      const listRes = await app.inject({
        method: "GET",
        url: "/api/containers",
        headers: {
          cookie: viewerCookie,
        },
      });
      const containers = listRes.json();
      const running = containers.find((c: { state: string }) => c.state === "running");

      if (running) {
        const statsRes = await app.inject({
          method: "GET",
          url: `/api/containers/${running.id}/stats`,
          headers: {
            cookie: viewerCookie,
          },
        });

        expect(statsRes.statusCode).toBe(200);
        const stats = statsRes.json();
        expect(stats.id).toBe(running.id);
        expect(typeof stats.cpuPercent).toBe("number");
        expect(typeof stats.memUsedBytes).toBe("number");
        expect(typeof stats.memPercent).toBe("number");
      }
    });
  });
});
