import type { StackFolder, StackFolderColor, StackSummary } from "../../../shared/types";

export const FOLDER_COLOR_STYLES: Record<
  StackFolderColor,
  {
    label: string;
    dot: string;
    swatch: string;
    iconBox: string;
    pillActive: string;
  }
> = {
  default: {
    label: "Padrão",
    dot: "bg-muted-foreground/70",
    swatch: "bg-zinc-400",
    iconBox: "bg-muted/50 border-border text-muted-foreground",
    pillActive: "border-foreground/30 bg-accent text-foreground",
  },
  amber: {
    label: "Âmbar",
    dot: "bg-primary",
    swatch: "bg-amber-400",
    iconBox: "bg-primary/10 border-primary/25 text-primary",
    pillActive: "border-primary/40 bg-primary/15 text-primary",
  },
  emerald: {
    label: "Esmeralda",
    dot: "bg-emerald-500",
    swatch: "bg-emerald-500",
    iconBox: "bg-emerald-500/10 border-emerald-500/25 text-emerald-500",
    pillActive: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
  },
  sky: {
    label: "Ciano",
    dot: "bg-sky-400",
    swatch: "bg-sky-400",
    iconBox: "bg-sky-500/10 border-sky-500/25 text-sky-400",
    pillActive: "border-sky-500/40 bg-sky-500/15 text-sky-400",
  },
  violet: {
    label: "Violeta",
    dot: "bg-violet-400",
    swatch: "bg-violet-400",
    iconBox: "bg-violet-500/10 border-violet-500/25 text-violet-400",
    pillActive: "border-violet-500/40 bg-violet-500/15 text-violet-300",
  },
  rose: {
    label: "Carmim",
    dot: "bg-rose-500",
    swatch: "bg-rose-500",
    iconBox: "bg-rose-500/10 border-rose-500/25 text-rose-500",
    pillActive: "border-rose-500/40 bg-rose-500/15 text-rose-400",
  },
  orange: {
    label: "Laranja",
    dot: "bg-orange-400",
    swatch: "bg-orange-400",
    iconBox: "bg-orange-500/10 border-orange-500/25 text-orange-400",
    pillActive: "border-orange-500/40 bg-orange-500/15 text-orange-400",
  },
};

export interface FolderTreeNode {
  folder: StackFolder;
  depth: number;
  pathNames: string[];
  fullPath: string;
  directStacks: StackSummary[];
  children: FolderTreeNode[];
  totalStacksCount: number;
  totalSubfoldersCount: number;
  runningStacksCount: number;
  stoppedStacksCount: number;
  failedStacksCount: number;
  deployingStacksCount: number;
  fullyRunningStacksCount: number;
  allSubtreeStacks: StackSummary[];
}

export interface FlattenedFolderOption {
  folder: StackFolder;
  depth: number;
  fullPath: string;
}

export function isStackRunning(s: StackSummary): boolean {
  return s.status === "deployed" || s.runningContainersCount > 0;
}

export function isStackFailed(s: StackSummary): boolean {
  return (
    s.status === "failed" ||
    s.containers.some(
      (c) => c.state === "dead" || c.status?.toLowerCase().includes("unhealthy"),
    )
  );
}

export function isStackFullyRunning(s: StackSummary): boolean {
  return s.status === "deployed" && s.containersCount > 0 && s.runningContainersCount === s.containersCount;
}

export function buildFolderMap(folders: StackFolder[]): Map<string, StackFolder> {
  const map = new Map<string, StackFolder>();
  for (const f of folders) {
    map.set(f.id, f);
  }
  return map;
}

export function getFolderPathItems(
  folderId: string | null | undefined,
  folderMap: Map<string, StackFolder>,
): StackFolder[] {
  if (!folderId) return [];
  const chain: StackFolder[] = [];
  const visited = new Set<string>();
  let cursor: string | null = folderId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const f = folderMap.get(cursor);
    if (!f) break;
    chain.unshift(f);
    cursor = f.parentId;
  }

  return chain;
}

export function getFolderFullPath(
  folderId: string | null | undefined,
  folderMap: Map<string, StackFolder>,
): string {
  return getFolderPathItems(folderId, folderMap)
    .map((f) => f.name)
    .join(" / ");
}

export function getDescendantFolderIds(
  rootFolderId: string,
  folders: StackFolder[],
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = childrenByParent.get(f.parentId) ?? [];
    list.push(f.id);
    childrenByParent.set(f.parentId, list);
  }

  const result = new Set<string>();
  const queue: string[] = [rootFolderId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (result.has(cur)) continue;
    result.add(cur);
    const kids = childrenByParent.get(cur);
    if (kids) {
      for (const kid of kids) {
        if (!result.has(kid)) queue.push(kid);
      }
    }
  }
  return result;
}

function sortFolders(folders: StackFolder[]): StackFolder[] {
  return [...folders].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}

export function flattenFolderTree(
  folders: StackFolder[],
  excludeSubtreeOfId?: string | null,
): FlattenedFolderOption[] {
  const excluded = excludeSubtreeOfId
    ? getDescendantFolderIds(excludeSubtreeOfId, folders)
    : new Set<string>();

  const folderMap = buildFolderMap(folders);
  const byParent = new Map<string | null, StackFolder[]>();

  for (const f of sortFolders(folders)) {
    if (excluded.has(f.id)) continue;
    const parentKey = f.parentId && folderMap.has(f.parentId) && !excluded.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(parentKey) ?? [];
    list.push(f);
    byParent.set(parentKey, list);
  }

  const out: FlattenedFolderOption[] = [];
  const visited = new Set<string>();

  const walk = (parentId: string | null, depth: number, prefix: string[]) => {
    const items = byParent.get(parentId) ?? [];
    for (const f of items) {
      if (visited.has(f.id)) continue;
      visited.add(f.id);
      const nextPath = [...prefix, f.name];
      out.push({
        folder: f,
        depth,
        fullPath: nextPath.join(" / "),
      });
      walk(f.id, depth + 1, nextPath);
    }
  };

  walk(null, 0, []);
  return out;
}

export type StackStatusFilter = "all" | "running" | "stopped" | "failed";

export function matchesStatusFilter(s: StackSummary, filter: StackStatusFilter): boolean {
  const running = isStackRunning(s);
  const failed = isStackFailed(s);
  if (filter === "running") return running && !failed;
  if (filter === "stopped") return !running;
  if (filter === "failed") return failed;
  return true;
}

export function matchesStackTerm(
  s: StackSummary,
  term: string,
  folderPath?: string,
): boolean {
  if (!term) return true;
  return (
    s.name.toLowerCase().includes(term) ||
    Boolean(s.gitRepo && s.gitRepo.toLowerCase().includes(term)) ||
    Boolean(folderPath && folderPath.toLowerCase().includes(term)) ||
    s.containers.some(
      (c) => c.name.toLowerCase().includes(term) || c.image.toLowerCase().includes(term),
    )
  );
}

export function buildStackFolderTree(params: {
  folders: StackFolder[];
  stacks: StackSummary[];
  statusFilter: StackStatusFilter;
  search: string;
}): {
  rootNodes: FolderTreeNode[];
  nodeMap: Map<string, FolderTreeNode>;
  unassignedStacks: StackSummary[];
  allUnfilteredCounts: Map<string, number>;
  unassignedTotalCount: number;
} {
  const { folders, stacks, statusFilter, search } = params;
  const term = search.trim().toLowerCase();
  const hasActiveFilter = statusFilter !== "all" || term.length > 0;
  const folderMap = buildFolderMap(folders);

  const byParent = new Map<string | null, StackFolder[]>();
  for (const f of sortFolders(folders)) {
    const validParent = f.parentId && folderMap.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(validParent) ?? [];
    list.push(f);
    byParent.set(validParent, list);
  }

  const stacksByFolder = new Map<string | null, StackSummary[]>();
  const allDirectCounts = new Map<string, number>();
  let unassignedTotalCount = 0;

  for (const s of stacks) {
    const validFolderId = s.folderId && folderMap.has(s.folderId) ? s.folderId : null;
    if (validFolderId) {
      allDirectCounts.set(validFolderId, (allDirectCounts.get(validFolderId) ?? 0) + 1);
    } else {
      unassignedTotalCount += 1;
    }

    if (!matchesStatusFilter(s, statusFilter)) continue;
    const pathStr = validFolderId ? getFolderFullPath(validFolderId, folderMap) : "";
    if (!matchesStackTerm(s, term, pathStr)) continue;

    const list = stacksByFolder.get(validFolderId) ?? [];
    list.push(s);
    stacksByFolder.set(validFolderId, list);
  }

  const nodeMap = new Map<string, FolderTreeNode>();
  const visited = new Set<string>();

  const buildNode = (folder: StackFolder, depth: number, prefix: string[]): FolderTreeNode | null => {
    if (visited.has(folder.id)) return null;
    visited.add(folder.id);

    const pathNames = [...prefix, folder.name];
    const fullPath = pathNames.join(" / ");
    const folderMatchesSearch = term.length > 0 && fullPath.toLowerCase().includes(term);

    const directStacks = stacksByFolder.get(folder.id) ?? [];
    const childFolders = byParent.get(folder.id) ?? [];
    const children: FolderTreeNode[] = [];

    for (const child of childFolders) {
      const childNode = buildNode(child, depth + 1, pathNames);
      if (childNode) {
        children.push(childNode);
      }
    }

    const allSubtreeStacks: StackSummary[] = [...directStacks];
    let totalSubfoldersCount = children.length;
    for (const c of children) {
      allSubtreeStacks.push(...c.allSubtreeStacks);
      totalSubfoldersCount += c.totalSubfoldersCount;
    }

    // Hide empty branches when an active filter/search is applied (unless folder name itself matched search & statusFilter is all)
    if (hasActiveFilter && allSubtreeStacks.length === 0) {
      if (!(statusFilter === "all" && folderMatchesSearch)) {
        return null;
      }
    }

    let runningStacksCount = 0;
    let stoppedStacksCount = 0;
    let failedStacksCount = 0;
    let deployingStacksCount = 0;
    let fullyRunningStacksCount = 0;

    for (const s of allSubtreeStacks) {
      const failed = isStackFailed(s);
      const running = isStackRunning(s);
      if (s.status === "deploying") deployingStacksCount += 1;
      if (failed) failedStacksCount += 1;
      if (running) runningStacksCount += 1;
      else stoppedStacksCount += 1;
      if (isStackFullyRunning(s)) fullyRunningStacksCount += 1;
    }

    const node: FolderTreeNode = {
      folder,
      depth,
      pathNames,
      fullPath,
      directStacks,
      children,
      totalStacksCount: allSubtreeStacks.length,
      totalSubfoldersCount,
      runningStacksCount,
      stoppedStacksCount,
      failedStacksCount,
      deployingStacksCount,
      fullyRunningStacksCount,
      allSubtreeStacks,
    };

    nodeMap.set(folder.id, node);
    return node;
  };

  const rootNodes: FolderTreeNode[] = [];
  for (const rootFolder of byParent.get(null) ?? []) {
    const node = buildNode(rootFolder, 0, []);
    if (node) rootNodes.push(node);
  }

  // Compute total unfiltered counts per folder (including subfolders) for quick filter pills
  const allUnfilteredCounts = new Map<string, number>();
  const calcUnfiltered = (folderId: string): number => {
    let total = allDirectCounts.get(folderId) ?? 0;
    for (const child of byParent.get(folderId) ?? []) {
      total += calcUnfiltered(child.id);
    }
    allUnfilteredCounts.set(folderId, total);
    return total;
  };
  for (const rootFolder of byParent.get(null) ?? []) {
    calcUnfiltered(rootFolder.id);
  }

  const unassignedStacks = stacksByFolder.get(null) ?? [];

  return {
    rootNodes,
    nodeMap,
    unassignedStacks,
    allUnfilteredCounts,
    unassignedTotalCount,
  };
}
