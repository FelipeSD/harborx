import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { buildApp } from "../index.js";

describe("Stack Folders API & Hierarchy Tests", () => {
  let app!: FastifyInstance;
  let viewerCookie: string;
  let operatorCookie: string;

  const createdFolderIds: string[] = [];
  const createdStackIds: string[] = [];
  const uniqueSuffix = Date.now();

  let clientesId = "";
  let acmeId = "";
  let prodId = "";
  let otherRootId = "";
  let stackAId = "";
  let stackDirectId = "";

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    const viewerUser = createUser(`folders_viewer_${uniqueSuffix}`, "vitest-hash", "viewer");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-folders-viewer");
    viewerCookie = `harborx_session=${viewerToken}`;

    const operatorUser = createUser(`folders_op_${uniqueSuffix}`, "vitest-hash", "operator");
    const operatorToken = createSession(operatorUser.id, "127.0.0.1", "vitest-folders-op");
    operatorCookie = `harborx_session=${operatorToken}`;
  }, 90_000);

  afterAll(async () => {
    for (const id of createdStackIds) {
      db.prepare("DELETE FROM stack_deployments WHERE stack_id = ?").run(id);
      db.prepare("DELETE FROM stacks WHERE id = ?").run(id);
    }
    for (const id of createdFolderIds) {
      db.prepare("DELETE FROM stack_folders WHERE id = ?").run(id);
    }
    db.prepare("DELETE FROM sessions WHERE user_agent LIKE 'vitest-folders-%'").run();
    db.prepare("DELETE FROM users WHERE username LIKE 'folders_%'").run();
    if (app) {
      await app.close();
    }
  });

  it("creates a nested 3-level folder tree and blocks viewers from mutating", async () => {
    const viewerAttempt = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: viewerCookie },
      payload: { name: `Blocked-${uniqueSuffix}`, color: "amber" },
    });
    expect(viewerAttempt.statusCode).toBe(403);

    const resRoot = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: operatorCookie },
      payload: { name: `Clientes-${uniqueSuffix}`, color: "sky" },
    });
    expect(resRoot.statusCode).toBe(201);
    const root = resRoot.json();
    expect(root.parentId).toBeNull();
    expect(root.color).toBe("sky");
    clientesId = root.id;
    createdFolderIds.push(clientesId);

    const resChild = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: operatorCookie },
      payload: { name: `Acme-${uniqueSuffix}`, parentId: clientesId, color: "amber" },
    });
    expect(resChild.statusCode).toBe(201);
    acmeId = resChild.json().id;
    createdFolderIds.push(acmeId);

    const resLeaf = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: operatorCookie },
      payload: { name: `Prod-${uniqueSuffix}`, parentId: acmeId, color: "emerald" },
    });
    expect(resLeaf.statusCode).toBe(201);
    prodId = resLeaf.json().id;
    createdFolderIds.push(prodId);

    // Sibling duplicate check (case-insensitive)
    const dupRes = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: operatorCookie },
      payload: { name: `acme-${uniqueSuffix}`, parentId: clientesId },
    });
    expect(dupRes.statusCode).toBe(400);

    // Same name is allowed under a different parent
    const otherRootRes = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: operatorCookie },
      payload: { name: `Prod-${uniqueSuffix}`, color: "violet" },
    });
    expect(otherRootRes.statusCode).toBe(201);
    otherRootId = otherRootRes.json().id;
    createdFolderIds.push(otherRootId);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/stack-folders",
      headers: { cookie: viewerCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json() as Array<{ id: string; parentId: string | null }>;
    expect(list.some((f) => f.id === prodId && f.parentId === acmeId)).toBe(true);
  });

  it("prevents self-parent and multi-level ancestor cycles", async () => {
    const selfRes = await app.inject({
      method: "PATCH",
      url: `/api/stack-folders/${clientesId}`,
      headers: { cookie: operatorCookie },
      payload: { parentId: clientesId },
    });
    expect(selfRes.statusCode).toBe(400);

    // Cycle: Clientes -> Acme -> Prod -> Clientes
    const cycleRes = await app.inject({
      method: "PATCH",
      url: `/api/stack-folders/${clientesId}`,
      headers: { cookie: operatorCookie },
      payload: { parentId: prodId },
    });
    expect(cycleRes.statusCode).toBe(400);
    expect(cycleRes.json().error).toMatch(/ciclo/i);

    const viewerPatch = await app.inject({
      method: "PATCH",
      url: `/api/stack-folders/${clientesId}`,
      headers: { cookie: viewerCookie },
      payload: { name: "Nope" },
    });
    expect(viewerPatch.statusCode).toBe(403);
  });

  it("assigns stacks to folders on create, edit, and PATCH /stacks/:id/folder without redeploy", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/stacks",
      headers: { cookie: operatorCookie },
      payload: {
        name: `test-fstack-a-${uniqueSuffix}`,
        type: "compose",
        folderId: prodId,
        composeYaml: "services:\n  web:\n    image: nginx:alpine\n",
        deployNow: false,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const stackA = createRes.json();
    stackAId = stackA.id;
    createdStackIds.push(stackAId);
    expect(stackA.folderId).toBe(prodId);

    // Invalid folderId rejected cleanly
    const badFolderRes = await app.inject({
      method: "PATCH",
      url: `/api/stacks/${stackAId}/folder`,
      headers: { cookie: operatorCookie },
      payload: { folderId: "non-existent-folder-id" },
    });
    expect(badFolderRes.statusCode).toBe(400);

    // Viewer blocked
    const viewerMoveRes = await app.inject({
      method: "PATCH",
      url: `/api/stacks/${stackAId}/folder`,
      headers: { cookie: viewerCookie },
      payload: { folderId: null },
    });
    expect(viewerMoveRes.statusCode).toBe(403);

    // Move to null (Sem pasta)
    const moveNullRes = await app.inject({
      method: "PATCH",
      url: `/api/stacks/${stackAId}/folder`,
      headers: { cookie: operatorCookie },
      payload: { folderId: null },
    });
    expect(moveNullRes.statusCode).toBe(200);
    expect(moveNullRes.json().folderId).toBeNull();

    // Update back via PUT /api/stacks/:id without redeploy
    const putMoveRes = await app.inject({
      method: "PUT",
      url: `/api/stacks/${stackAId}`,
      headers: { cookie: operatorCookie },
      payload: {
        folderId: acmeId,
        redeploy: false,
      },
    });
    expect(putMoveRes.statusCode).toBe(200);
    expect(putMoveRes.json().folderId).toBe(acmeId);

    // Webhooks endpoint includes folderId
    const webhooksRes = await app.inject({
      method: "GET",
      url: "/api/webhooks",
      headers: { cookie: viewerCookie },
    });
    expect(webhooksRes.statusCode).toBe(200);
    const webhookEntry = (webhooksRes.json() as Array<{ id: string; folderId: string | null }>).find(
      (w) => w.id === stackAId,
    );
    expect(webhookEntry?.folderId).toBe(acmeId);
  });

  it("handles batch folder action validation and safe empty/undeployed targets", async () => {
    const viewerActionRes = await app.inject({
      method: "POST",
      url: `/api/stack-folders/${clientesId}/action`,
      headers: { cookie: viewerCookie },
      payload: { action: "stop" },
    });
    expect(viewerActionRes.statusCode).toBe(403);

    const missingFolderRes = await app.inject({
      method: "POST",
      url: "/api/stack-folders/missing-id/action",
      headers: { cookie: operatorCookie },
      payload: { action: "start" },
    });
    expect(missingFolderRes.statusCode).toBe(404);

    const badActionRes = await app.inject({
      method: "POST",
      url: `/api/stack-folders/${clientesId}/action`,
      headers: { cookie: operatorCookie },
      payload: { action: "destroy" },
    });
    expect(badActionRes.statusCode).toBe(400);

    // Stopping a subtree where stacks are already stopped targets 0 stacks cleanly
    const stopRes = await app.inject({
      method: "POST",
      url: `/api/stack-folders/${clientesId}/action`,
      headers: { cookie: operatorCookie },
      payload: { action: "stop", includeSubfolders: true },
    });
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json()).toEqual({
      folderId: clientesId,
      action: "stop",
      totalTargeted: 0,
      results: [],
    });
  });

  it("promotes child folders and stacks safely when deleting a parent folder, resolving collisions", async () => {
    // Create a stack directly inside Clientes
    const createDirectRes = await app.inject({
      method: "POST",
      url: "/api/stacks",
      headers: { cookie: operatorCookie },
      payload: {
        name: `test-fstack-direct-${uniqueSuffix}`,
        type: "compose",
        folderId: clientesId,
        composeYaml: "services:\n  app:\n    image: alpine:latest\n",
        deployNow: false,
      },
    });
    expect(createDirectRes.statusCode).toBe(201);
    stackDirectId = createDirectRes.json().id;
    createdStackIds.push(stackDirectId);

    // Create a direct child of Clientes named same as root folder `Prod-${uniqueSuffix}` to test collision promotion
    const collidingChildRes = await app.inject({
      method: "POST",
      url: "/api/stack-folders",
      headers: { cookie: operatorCookie },
      payload: { name: `Prod-${uniqueSuffix}`, parentId: clientesId },
    });
    expect(collidingChildRes.statusCode).toBe(201);
    const collidingChildId = collidingChildRes.json().id;
    createdFolderIds.push(collidingChildId);

    // Viewer cannot delete folder
    const viewerDel = await app.inject({
      method: "DELETE",
      url: `/api/stack-folders/${clientesId}`,
      headers: { cookie: viewerCookie },
    });
    expect(viewerDel.statusCode).toBe(403);

    // Operator deletes Clientes
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/stack-folders/${clientesId}`,
      headers: { cookie: operatorCookie },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({
      success: true,
      movedStacksCount: 1,
      movedFoldersCount: 2,
      promotedToParentId: null,
    });

    // Stack was NOT deleted and promoted to null
    const getStackRes = await app.inject({
      method: "GET",
      url: `/api/stacks/${stackDirectId}`,
      headers: { cookie: viewerCookie },
    });
    expect(getStackRes.statusCode).toBe(200);
    expect(getStackRes.json().folderId).toBeNull();

    // Acme was promoted to root, colliding child was renamed with (2) and promoted to root
    const foldersRes = await app.inject({
      method: "GET",
      url: "/api/stack-folders",
      headers: { cookie: viewerCookie },
    });
    const allFolders = foldersRes.json() as Array<{ id: string; name: string; parentId: string | null }>;
    const promotedAcme = allFolders.find((f) => f.id === acmeId);
    const promotedColliding = allFolders.find((f) => f.id === collidingChildId);

    expect(promotedAcme?.parentId).toBeNull();
    expect(promotedColliding?.parentId).toBeNull();
    expect(promotedColliding?.name).toBe(`Prod-${uniqueSuffix} (2)`);
  });
});
