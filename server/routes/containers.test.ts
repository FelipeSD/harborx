import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password";
import { createSession, createUser } from "../auth/session";
import { db } from "../db/index";
import { isDockerReachable } from "../docker";
import { buildApp } from "../index";

describe("Phase 2 - Container Lifecycle, RBAC & Protection", () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let viewerCookie: string;
  let dockerAvailable = false;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    dockerAvailable = await isDockerReachable();

    const adminHash = await hashPassword("adminSecret123!");
    const viewerHash = await hashPassword("viewerSecret123!");

    const adminUser = createUser(`testadmin_${Date.now()}`, adminHash, "admin");
    const viewerUser = createUser(`testviewer_${Date.now()}`, viewerHash, "viewer");

    const adminToken = createSession(adminUser.id, "127.0.0.1", "vitest-agent");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-agent");

    adminCookie = `harborx_session=${adminToken}`;
    viewerCookie = `harborx_session=${viewerToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare(
      "DELETE FROM users WHERE username LIKE 'testadmin_%' OR username LIKE 'testviewer_%'",
    ).run();
    db.prepare("DELETE FROM audit_log WHERE ip = '127.0.0.1'").run();
  });

  describe("RBAC Enforcement", () => {
    it("denies unauthenticated requests with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers/test-id/start",
      });
      expect(res.statusCode).toBe(401);
    });

    it("denies viewer role from starting a container with 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers/test-id/start",
        headers: {
          cookie: viewerCookie,
        },
      });
      expect(res.statusCode).toBe(403);
      const json = res.json();
      expect(json.error).toMatch(/Acesso negado/i);
    });

    it("denies viewer role from creating a container with 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers",
        headers: {
          cookie: viewerCookie,
          "content-type": "application/json",
        },
        payload: {
          name: "test-box",
          image: "alpine:latest",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("denies viewer role from deleting a container with 403", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/containers/test-id",
        headers: {
          cookie: viewerCookie,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("denies viewer role from running batch operations with 403", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers/batch",
        headers: {
          cookie: viewerCookie,
          "content-type": "application/json",
        },
        payload: {
          action: "stop",
          ids: ["c1", "c2"],
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Validation & Safety", () => {
    it("validates container creation schema payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        payload: {
          // missing image and invalid name format
          name: "invalid name with spaces!",
        },
      });
      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error).toBeDefined();
    });

    it("validates batch action payload schema", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers/batch",
        headers: {
          cookie: adminCookie,
          "content-type": "application/json",
        },
        payload: {
          action: "invalid_action",
          ids: [],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects unknown lifecycle action on /:id/:action with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/containers/test-id/explode",
        headers: {
          cookie: adminCookie,
        },
      });
      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error).toMatch(/Ação inválida/i);
    });
  });

  describe("Self-Protection Logic", () => {
    it("prevents stopping harborx container by self-protection name rule", async () => {
      // Even if the container is not in Docker engine, the route inspects or checks self-protection
      const res = await app.inject({
        method: "POST",
        url: "/api/containers/harborx/stop",
        headers: {
          cookie: adminCookie,
        },
      });
      // Should be 404 if not found or 409 if self-protected
      expect([404, 409]).toContain(res.statusCode);
    });

    it("prevents removing harborx container by self-protection name rule", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/containers/harborx",
        headers: {
          cookie: adminCookie,
        },
      });
      expect([404, 409]).toContain(res.statusCode);
    });
  });

  describe("Live Docker Reads & Inspect", () => {
    it("allows both admin and viewer to list containers", async () => {
      if (!dockerAvailable) return;

      const viewerRes = await app.inject({
        method: "GET",
        url: "/api/containers",
        headers: {
          cookie: viewerCookie,
        },
      });
      expect(viewerRes.statusCode).toBe(200);
      const containers = viewerRes.json();
      expect(Array.isArray(containers)).toBe(true);

      const adminRes = await app.inject({
        method: "GET",
        url: "/api/containers",
        headers: {
          cookie: adminCookie,
        },
      });
      expect(adminRes.statusCode).toBe(200);
      const adminContainers = adminRes.json();
      expect(adminContainers.length).toBe(containers.length);
      expect(adminContainers.map((c: { id: string }) => c.id).sort()).toEqual(
        containers.map((c: { id: string }) => c.id).sort(),
      );

      // If at least one container exists, test inspect endpoint
      if (containers.length > 0) {
        const testContainer = containers[0];

        // Viewer inspect test (masks sensitive keys)
        const inspectViewerRes = await app.inject({
          method: "GET",
          url: `/api/containers/${testContainer.id}/inspect`,
          headers: {
            cookie: viewerCookie,
          },
        });
        expect(inspectViewerRes.statusCode).toBe(200);
        const inspectDataViewer = inspectViewerRes.json();
        expect(inspectDataViewer.Id).toBe(testContainer.id);

        if (inspectDataViewer.Config?.Env) {
          for (const envItem of inspectDataViewer.Config.Env as string[]) {
            if (/(SECRET|PASSWORD|TOKEN|KEY)/i.test(envItem.split("=")[0] || "")) {
              expect(envItem).toMatch(/\*{8}/);
            }
          }
        }

        // Admin inspect test (returns raw data)
        const inspectAdminRes = await app.inject({
          method: "GET",
          url: `/api/containers/${testContainer.id}/inspect`,
          headers: {
            cookie: adminCookie,
          },
        });
        expect(inspectAdminRes.statusCode).toBe(200);
        const inspectDataAdmin = inspectAdminRes.json();
        expect(inspectDataAdmin.Id).toBe(testContainer.id);
      }
    });
  });
});
