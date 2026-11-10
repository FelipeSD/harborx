import { describe, expect, it } from "vitest";
import type { StackFolder, StackSummary } from "../../../shared/types";
import {
  buildFolderMap,
  buildStackFolderTree,
  flattenFolderTree,
  getDescendantFolderIds,
  getFolderFullPath,
} from "./folder-utils";

function makeFolder(overrides: Partial<StackFolder> & Pick<StackFolder, "id" | "name">): StackFolder {
  return {
    parentId: null,
    color: "default",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeStack(overrides: Partial<StackSummary> & Pick<StackSummary, "id" | "name">): StackSummary {
  return {
    type: "compose",
    status: "stopped",
    folderId: null,
    composeYaml: "services: {}",
    env: [],
    webhookToken: "tok",
    autoDeploy: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    containersCount: 1,
    runningContainersCount: 0,
    containers: [
      {
        id: "c1",
        name: `${overrides.name}-web-1`,
        state: "exited",
        status: "Exited (0)",
        image: "nginx:alpine",
        ports: [],
      },
    ],
    ...overrides,
  };
}

describe("stack folder-utils", () => {
  const folders: StackFolder[] = [
    makeFolder({ id: "f-clientes", name: "Clientes", color: "sky" }),
    makeFolder({ id: "f-acme", name: "Acme", parentId: "f-clientes", color: "amber" }),
    makeFolder({ id: "f-prod", name: "Produção", parentId: "f-acme", color: "emerald" }),
    makeFolder({ id: "f-infra", name: "Infraestrutura", color: "violet" }),
  ];

  const stacks: StackSummary[] = [
    makeStack({
      id: "s1",
      name: "acme-api",
      folderId: "f-prod",
      status: "deployed",
      runningContainersCount: 2,
      containersCount: 2,
      containers: [
        { id: "c1", name: "acme-api-1", state: "running", status: "Up 2h", image: "node:22", ports: [] },
        { id: "c2", name: "acme-api-db", state: "running", status: "Up 2h", image: "postgres:16", ports: [] },
      ],
    }),
    makeStack({
      id: "s2",
      name: "acme-worker",
      folderId: "f-acme",
      status: "failed",
      runningContainersCount: 0,
      containersCount: 1,
      containers: [
        { id: "c3", name: "acme-worker-1", state: "dead", status: "Dead", image: "node:22", ports: [] },
      ],
    }),
    makeStack({
      id: "s3",
      name: "traefik-proxy",
      folderId: null,
      status: "deployed",
      runningContainersCount: 1,
      containersCount: 1,
      containers: [
        { id: "c4", name: "traefik", state: "running", status: "Up 1d", image: "traefik:v3", ports: [] },
      ],
    }),
  ];

  it("computes full folder paths and descendant IDs", () => {
    const map = buildFolderMap(folders);
    expect(getFolderFullPath("f-prod", map)).toBe("Clientes / Acme / Produção");
    expect(getFolderFullPath("missing", map)).toBe("");

    const descendants = getDescendantFolderIds("f-clientes", folders);
    expect([...descendants].sort()).toEqual(["f-acme", "f-clientes", "f-prod"]);
  });

  it("flattens folder tree in depth-first order and excludes subtree to avoid cycles", () => {
    const allOpts = flattenFolderTree(folders);
    expect(allOpts.map((o) => `${o.depth}:${o.folder.name}`)).toEqual([
      "0:Clientes",
      "1:Acme",
      "2:Produção",
      "0:Infraestrutura",
    ]);

    const filteredOpts = flattenFolderTree(folders, "f-acme");
    expect(filteredOpts.map((o) => o.folder.id)).toEqual(["f-clientes", "f-infra"]);
  });

  it("aggregates nested subtree health counts and keeps unassigned stacks separate", () => {
    const result = buildStackFolderTree({
      folders,
      stacks,
      statusFilter: "all",
      search: "",
    });

    expect(result.unassignedStacks.map((s) => s.id)).toEqual(["s3"]);
    expect(result.unassignedTotalCount).toBe(1);

    const clientesNode = result.nodeMap.get("f-clientes");
    expect(clientesNode).toBeDefined();
    expect(clientesNode?.totalStacksCount).toBe(2);
    expect(clientesNode?.runningStacksCount).toBe(1);
    expect(clientesNode?.stoppedStacksCount).toBe(1);
    expect(clientesNode?.failedStacksCount).toBe(1);
    expect(clientesNode?.fullyRunningStacksCount).toBe(1);
    expect(clientesNode?.totalSubfoldersCount).toBe(2);

    const infraNode = result.nodeMap.get("f-infra");
    expect(infraNode?.totalStacksCount).toBe(0);
    expect(result.allUnfilteredCounts.get("f-clientes")).toBe(2);
  });

  it("prunes empty branches on status filter and matches folder names in search", () => {
    const runningTree = buildStackFolderTree({
      folders,
      stacks,
      statusFilter: "running",
      search: "",
    });
    expect(runningTree.nodeMap.get("f-clientes")?.totalStacksCount).toBe(1);
    expect(runningTree.nodeMap.get("f-infra")).toBeUndefined();

    // Search by empty folder name reveals that folder when statusFilter === 'all'
    const searchInfraTree = buildStackFolderTree({
      folders,
      stacks,
      statusFilter: "all",
      search: "infraestrutura",
    });
    expect(searchInfraTree.rootNodes.map((n) => n.folder.id)).toEqual(["f-infra"]);
    expect(searchInfraTree.allUnfilteredCounts.get("f-clientes")).toBe(2);
  });
});
