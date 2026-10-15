import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { buildApp } from "../index.js";

describe("Phase 9 - Users, RBAC, Audit Log & System Backup Tests", () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let operatorCookie: string;
  let viewerCookie: string;
  let adminId = "";
  let createdUserId = "";

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const adminHash = await hashPassword("adminPass123!@#");
    const adminUser = createUser(`test_admin_${Date.now()}`, adminHash, "admin");
    adminId = adminUser.id;
    const adminToken = createSession(adminUser.id, "127.0.0.1", "vitest-admin");
    adminCookie = `harborx_session=${adminToken}`;

    const operatorHash = await hashPassword("operatorPass123!");
    const operatorUser = createUser(`test_op_${Date.now()}`, operatorHash, "operator");
    const operatorToken = createSession(operatorUser.id, "127.0.0.1", "vitest-op");
    operatorCookie = `harborx_session=${operatorToken}`;

    const viewerHash = await hashPassword("viewerPass123!");
    const viewerUser = createUser(`test_view_${Date.now()}`, viewerHash, "viewer");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-view");
    viewerCookie = `harborx_session=${viewerToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare("DELETE FROM users WHERE username LIKE 'test_%'").run();
  });

  it("blocks non-admin users from accessing /api/users", async () => {
    const resOp = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: operatorCookie },
    });
    expect(resOp.statusCode).toBe(403);

    const resView = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: viewerCookie },
    });
    expect(resView.statusCode).toBe(403);
  });

  it("allows admin to list users", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const users = res.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(3);
  });

  it("creates a new user with RBAC role", async () => {
    const username = `test_new_${Date.now()}`;
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: adminCookie },
      payload: {
        username,
        password: "SecretPassword123!",
        role: "viewer",
      },
    });

    expect(res.statusCode).toBe(201);
    const user = res.json();
    expect(user.id).toBeDefined();
    expect(user.username).toBe(username);
    expect(user.role).toBe("viewer");
    expect(user.passwordHash).toBeUndefined();

    createdUserId = user.id;
  });

  it("updates user role and status", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/users/${createdUserId}`,
      headers: { cookie: adminCookie },
      payload: {
        role: "operator",
        disabled: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const user = res.json();
    expect(user.role).toBe("operator");
    expect(user.disabled).toBe(true);
  });

  it("prevents admin from disabling their own account", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/users/${adminId}`,
      headers: { cookie: adminCookie },
      payload: {
        disabled: true,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("deletes user", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/users/${createdUserId}`,
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
  });

  it("allows operator to retrieve audit logs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/audit-logs?limit=10",
      headers: { cookie: operatorCookie },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("allows admin to download SQLite database backup", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/system/backup",
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment; filename=");
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });
});
