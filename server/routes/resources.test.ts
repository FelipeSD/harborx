import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { isDockerReachable } from "../docker.js";
import { buildApp } from "../index.js";
import {
  createRegistry,
  deleteRegistry,
  getRegistryAuthForImage,
  listRegistries,
} from "../services/registries.js";

describe("Phase 6 - Images, Networks, Volumes & Registries Tests", () => {
  let app: FastifyInstance;
  let viewerCookie: string;
  let operatorCookie: string;
  let dockerAvailable = false;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    dockerAvailable = await isDockerReachable();

    const viewerHash = await hashPassword("viewerPass123!");
    const viewerUser = createUser(`res_viewer_${Date.now()}`, viewerHash, "viewer");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-res-viewer");
    viewerCookie = `harborx_session=${viewerToken}`;

    const operatorHash = await hashPassword("operatorPass123!");
    const operatorUser = createUser(`res_operator_${Date.now()}`, operatorHash, "operator");
    const operatorToken = createSession(operatorUser.id, "127.0.0.1", "vitest-res-operator");
    operatorCookie = `harborx_session=${operatorToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare("DELETE FROM users WHERE username LIKE 'res_%'").run();
    db.prepare("DELETE FROM registries WHERE name LIKE 'test_%'").run();
  });

  describe("Registries & Credential Vault", () => {
    let registryId = "";

    it("creates registry with encrypted token and returns public info", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/registries",
        headers: { cookie: operatorCookie },
        payload: {
          name: "test_ghcr",
          url: "ghcr.io",
          username: "testuser",
          secret: "ghp_superSecretToken12345",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.id).toBeDefined();
      expect(json.name).toBe("test_ghcr");
      expect(json.url).toBe("ghcr.io");
      expect(json.username).toBe("testuser");
      // Secret must NEVER be returned in response!
      expect(json.secret).toBeUndefined();
      expect(json.encrypted_secret).toBeUndefined();

      registryId = json.id;
    });

    it("lists registries without exposing passwords", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/registries",
        headers: { cookie: viewerCookie },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(Array.isArray(json)).toBe(true);
      const found = json.find((r: { id: string }) => r.id === registryId);
      expect(found).toBeDefined();
      expect(found.username).toBe("testuser");
      expect(found.secret).toBeUndefined();
    });

    it("decrypts registry credentials when matching image domain", () => {
      const auth = getRegistryAuthForImage("ghcr.io/myorg/myapp:v1");
      expect(auth).toBeDefined();
      expect(auth?.username).toBe("testuser");
      expect(auth?.password).toBe("ghp_superSecretToken12345");
    });

    it("deletes registry", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/registries/${registryId}`,
        headers: { cookie: operatorCookie },
      });

      expect(res.statusCode).toBe(200);
      const auth = getRegistryAuthForImage("ghcr.io/myorg/myapp:v1");
      expect(auth).toBeUndefined();
    });
  });

  describe("Docker Images", () => {
    it("lists images via GET /api/images", async () => {
      if (!dockerAvailable) return;

      const res = await app.inject({
        method: "GET",
        url: "/api/images",
        headers: { cookie: viewerCookie },
      });

      expect(res.statusCode).toBe(200);
      const images = res.json();
      expect(Array.isArray(images)).toBe(true);

      if (images.length > 0) {
        const first = images[0];
        expect(first.id).toBeDefined();
        expect(Array.isArray(first.repoTags)).toBe(true);
      }
    });

    it("blocks viewer from pruning images", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/images/prune",
        headers: { cookie: viewerCookie },
        payload: { danglingOnly: true },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("Docker Networks", () => {
    let createdNetId = "";
    const testNetName = `test_net_${Date.now()}`;

    it("lists networks via GET /api/networks", async () => {
      if (!dockerAvailable) return;

      const res = await app.inject({
        method: "GET",
        url: "/api/networks",
        headers: { cookie: viewerCookie },
      });

      expect(res.statusCode).toBe(200);
      const networks = res.json();
      expect(Array.isArray(networks)).toBe(true);
      const bridge = networks.find((n: { name: string }) => n.name === "bridge");
      expect(bridge).toBeDefined();
    });

    it("blocks removing default bridge network", async () => {
      if (!dockerAvailable) return;

      const listRes = await app.inject({
        method: "GET",
        url: "/api/networks",
        headers: { cookie: operatorCookie },
      });
      const bridge = listRes.json().find((n: { name: string }) => n.name === "bridge");

      if (bridge) {
        const delRes = await app.inject({
          method: "DELETE",
          url: `/api/networks/${bridge.id}`,
          headers: { cookie: operatorCookie },
        });

        expect(delRes.statusCode).toBe(400);
      }
    });

    it("creates custom network and inspects it", async () => {
      if (!dockerAvailable) return;

      const createRes = await app.inject({
        method: "POST",
        url: "/api/networks",
        headers: { cookie: operatorCookie },
        payload: {
          name: testNetName,
          driver: "bridge",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const json = createRes.json();
      expect(json.id).toBeDefined();
      createdNetId = json.id;

      const inspectRes = await app.inject({
        method: "GET",
        url: `/api/networks/${createdNetId}/inspect`,
        headers: { cookie: viewerCookie },
      });

      expect(inspectRes.statusCode).toBe(200);
      expect(inspectRes.json().Name).toBe(testNetName);
    });

    it("removes custom network", async () => {
      if (!dockerAvailable || !createdNetId) return;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/networks/${createdNetId}`,
        headers: { cookie: operatorCookie },
      });

      expect(delRes.statusCode).toBe(200);
    });
  });

  describe("Docker Volumes", () => {
    let createdVolName = "";
    const testVolName = `test_vol_${Date.now()}`;

    it("lists volumes via GET /api/volumes with inUseBy detection", async () => {
      if (!dockerAvailable) return;

      const res = await app.inject({
        method: "GET",
        url: "/api/volumes",
        headers: { cookie: viewerCookie },
      });

      expect(res.statusCode).toBe(200);
      const volumes = res.json();
      expect(Array.isArray(volumes)).toBe(true);
      if (volumes.length > 0) {
        expect(Array.isArray(volumes[0].inUseBy)).toBe(true);
      }
    });

    it("creates volume and inspects it", async () => {
      if (!dockerAvailable) return;

      const createRes = await app.inject({
        method: "POST",
        url: "/api/volumes",
        headers: { cookie: operatorCookie },
        payload: {
          name: testVolName,
          driver: "local",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const json = createRes.json();
      expect(json.name || json.Name).toBe(testVolName);
      createdVolName = testVolName;

      const inspectRes = await app.inject({
        method: "GET",
        url: `/api/volumes/${testVolName}/inspect`,
        headers: { cookie: viewerCookie },
      });

      expect(inspectRes.statusCode).toBe(200);
      expect(inspectRes.json().Name).toBe(testVolName);
    });

    it("removes volume", async () => {
      if (!dockerAvailable || !createdVolName) return;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/volumes/${createdVolName}`,
        headers: { cookie: operatorCookie },
      });

      expect(delRes.statusCode).toBe(200);
    });
  });
});
