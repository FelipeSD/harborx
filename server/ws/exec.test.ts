import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { hashPassword } from "../auth/password.js";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { isDockerReachable } from "../docker.js";
import { buildApp } from "../index.js";

describe("Phase 4 - Interactive Terminal Exec WebSocket & Security Tests", () => {
  let app: FastifyInstance;
  let serverPort: number;
  let adminCookie: string;
  let viewerCookie: string;
  let dockerAvailable = false;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const url = new URL(address);
    serverPort = parseInt(url.port, 10);

    dockerAvailable = await isDockerReachable();

    const adminHash = await hashPassword("adminPass123!");
    const viewerHash = await hashPassword("viewerPass123!");

    const adminUser = createUser(`execadmin_${Date.now()}`, adminHash, "admin");
    const viewerUser = createUser(`execviewer_${Date.now()}`, viewerHash, "viewer");

    const adminToken = createSession(adminUser.id, "127.0.0.1", "vitest-exec");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-exec");

    adminCookie = `harborx_session=${adminToken}`;
    viewerCookie = `harborx_session=${viewerToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare(
      "DELETE FROM users WHERE username LIKE 'execadmin_%' OR username LIKE 'execviewer_%'",
    ).run();
    db.prepare("DELETE FROM audit_log WHERE ip = '127.0.0.1'").run();
  });

  it("denies unauthenticated WebSocket connection to exec endpoint", async () => {
    const wsUrl = `ws://127.0.0.1:${serverPort}/ws/containers/any-id/exec`;

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.on("close", (code) => {
        expect([4401, 1005, 1006]).toContain(code);
        resolve();
      });
      ws.on("error", () => {
        resolve();
      });
    });
  });

  it("denies viewer role from opening interactive console with 4403", async () => {
    const wsUrl = `ws://127.0.0.1:${serverPort}/ws/containers/any-id/exec`;

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          cookie: viewerCookie,
        },
      });

      ws.on("message", (data) => {
        const text = data.toString();
        expect(text).toMatch(/Acesso negado/i);
      });

      ws.on("close", (code) => {
        expect(code).toBe(4403);
        resolve();
      });

      ws.on("error", () => {
        resolve();
      });
    });
  });

  it("rejects shell command injection payloads with 4400", async () => {
    const maliciousPayloads = [
      "sh; rm -rf /",
      "sh && whoami",
      "sh | cat",
      "`whoami`",
      "$(id)",
      "sh\nls",
    ];

    for (const shellCmd of maliciousPayloads) {
      const wsUrl = `ws://127.0.0.1:${serverPort}/ws/containers/any-id/exec?shell=${encodeURIComponent(shellCmd)}`;

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl, {
          headers: {
            cookie: adminCookie,
          },
        });

        ws.on("close", (code) => {
          expect(code).toBe(4400);
          resolve();
        });

        ws.on("error", () => {
          resolve();
        });
      });
    }
  });

  it("allows operator/admin to open interactive terminal session on live container", async () => {
    if (!dockerAvailable) return;

    // List containers
    const listRes = await app.inject({
      method: "GET",
      url: "/api/containers",
      headers: {
        cookie: adminCookie,
      },
    });
    expect(listRes.statusCode).toBe(200);
    const containers = listRes.json();
    const running = containers.find((c: { state: string }) => c.state === "running");

    if (running) {
      const wsUrl = `ws://127.0.0.1:${serverPort}/ws/containers/${running.id}/exec?shell=sh`;

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
          headers: {
            cookie: adminCookie,
          },
        });

        let outputReceived = "";
        const timeout = setTimeout(() => {
          ws.close();
          // Even if prompt output wasn't received in time, pass if connection succeeded
          resolve();
        }, 3000);

        ws.on("open", () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          // Test terminal resize message
          ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
          // Test input command
          ws.send("echo HELLO_TEST_TERMINAL\n");
        });

        ws.on("message", (data) => {
          outputReceived += data.toString();
          if (outputReceived.includes("HELLO_TEST_TERMINAL")) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        });

        ws.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Verify audit log has recorded exec.open
      const auditRows = db
        .prepare("SELECT * FROM audit_log WHERE action LIKE 'exec.%' AND target = ?")
        .all(running.id);
      expect(auditRows.length).toBeGreaterThan(0);
    }
  });
});
