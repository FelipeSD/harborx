import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { buildApp } from "../index.js";

describe("Phase 7 & 8 - Stacks & GitOps Webhooks Tests", () => {
  let app: FastifyInstance;
  let viewerCookie: string;
  let operatorCookie: string;
  let createdStackId = "";
  let webhookToken = "";

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const viewerHash = await hashPassword("viewerPass123!");
    const viewerUser = createUser(`stacks_viewer_${Date.now()}`, viewerHash, "viewer");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-stacks-viewer");
    viewerCookie = `harborx_session=${viewerToken}`;

    const operatorHash = await hashPassword("operatorPass123!");
    const operatorUser = createUser(`stacks_op_${Date.now()}`, operatorHash, "operator");
    const operatorToken = createSession(operatorUser.id, "127.0.0.1", "vitest-stacks-op");
    operatorCookie = `harborx_session=${operatorToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare("DELETE FROM users WHERE username LIKE 'stacks_%'").run();
    db.prepare("DELETE FROM stacks WHERE name LIKE 'test-stack%'").run();
  });

  it("blocks viewer from creating a stack", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/stacks",
      headers: { cookie: viewerCookie },
      payload: {
        name: "test-stack-fail",
        type: "compose",
        composeYaml: "services:\n  web:\n    image: nginx:alpine\n",
        deployNow: false,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("creates a new Docker Compose stack without immediate deploy", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/stacks",
      headers: { cookie: operatorCookie },
      payload: {
        name: `test-stack-${Date.now()}`,
        type: "compose",
        composeYaml: "services:\n  web:\n    image: nginx:alpine\n",
        env: [{ key: "PORT", value: "8080", secret: false }],
        deployNow: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const stack = res.json();
    expect(stack.id).toBeDefined();
    expect(stack.webhookToken).toBeDefined();
    expect(stack.composeYaml).toContain("nginx:alpine");
    expect(stack.env).toHaveLength(1);

    createdStackId = stack.id;
    webhookToken = stack.webhookToken;
  });

  it("retrieves the stack by ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/stacks/${createdStackId}`,
      headers: { cookie: viewerCookie },
    });

    expect(res.statusCode).toBe(200);
    const stack = res.json();
    expect(stack.id).toBe(createdStackId);
    expect(stack.containersCount).toBeDefined();
  });

  it("updates stack compose yaml and environment variables", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/stacks/${createdStackId}`,
      headers: { cookie: operatorCookie },
      payload: {
        composeYaml: "services:\n  web:\n    image: nginx:1.25-alpine\n",
        env: [
          { key: "PORT", value: "9000", secret: false },
          { key: "DB_PASS", value: "secret123", secret: true },
        ],
        redeploy: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const stack = res.json();
    expect(stack.composeYaml).toContain("nginx:1.25-alpine");
    expect(stack.env).toHaveLength(2);
  });

  it("lists webhooks via GET /api/webhooks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/webhooks",
      headers: { cookie: viewerCookie },
    });

    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((w: { id: string }) => w.id === createdStackId);
    expect(found).toBeDefined();
    expect(found.webhookUrl).toContain(`/api/public/hooks/${webhookToken}`);
  });

  it("rejects invalid webhook tokens on public hook endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/public/hooks/invalid-token-12345",
    });

    expect(res.statusCode).toBe(404);
  });

  it("removes stack via DELETE /api/stacks/:id", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/stacks/${createdStackId}`,
      headers: { cookie: operatorCookie },
    });

    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/stacks/${createdStackId}`,
      headers: { cookie: viewerCookie },
    });

    expect(getRes.statusCode).toBe(404);
  }, 15000);

  it("resolves compose files intelligently (.yaml <-> .yml and candidates)", async () => {
    const { resolveComposeFilePath } = await import("../services/stacks.js");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harborx-compose-test-"));
    try {
      // 1. If docker-compose.yml exists, requesting docker-compose.yaml should resolve to docker-compose.yml
      fs.writeFileSync(path.join(tempDir, "docker-compose.yml"), "services:\n");
      expect(resolveComposeFilePath(tempDir, "docker-compose.yaml")).toBe("docker-compose.yml");
      expect(resolveComposeFilePath(tempDir, "compose.yaml")).toBe("docker-compose.yml");
      expect(resolveComposeFilePath(tempDir, null)).toBe("docker-compose.yml");

      // 2. If deploy/docker-compose.yaml exists
      fs.unlinkSync(path.join(tempDir, "docker-compose.yml"));
      fs.mkdirSync(path.join(tempDir, "deploy"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "deploy", "docker-compose.yaml"), "services:\n");
      expect(resolveComposeFilePath(tempDir, "deploy/docker-compose.yml")).toBe(
        "deploy/docker-compose.yaml",
      );
      expect(resolveComposeFilePath(tempDir, null)).toBe("deploy/docker-compose.yaml");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
