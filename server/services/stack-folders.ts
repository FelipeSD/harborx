import crypto from "node:crypto";
import type {
  BatchStackFolderActionResult,
  StackFolder,
  StackFolderColor,
} from "../../shared/types.js";
import { db } from "../db/index.js";
import { isHarborXSelfStack, listStacks, startStack, stopStack } from "./stacks.js";

const VALID_COLORS = new Set<StackFolderColor>([
  "default",
  "amber",
  "emerald",
  "sky",
  "violet",
  "rose",
  "orange",
]);

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function normalizeColor(color?: string | null): StackFolderColor {
  if (color && VALID_COLORS.has(color as StackFolderColor)) {
    return color as StackFolderColor;
  }
  return "default";
}

function mapFolderRow(row: FolderRow): StackFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id || null,
    color: normalizeColor(row.color),
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findSiblingByName(
  name: string,
  parentId: string | null,
  excludeId?: string,
): { id: string; name: string } | undefined {
  if (parentId) {
    if (excludeId) {
      return db
        .prepare(
          "SELECT id, name FROM stack_folders WHERE parent_id = ? AND LOWER(name) = LOWER(?) AND id != ?",
        )
        .get(parentId, name, excludeId) as { id: string; name: string } | undefined;
    }
    return db
      .prepare("SELECT id, name FROM stack_folders WHERE parent_id = ? AND LOWER(name) = LOWER(?)")
      .get(parentId, name) as { id: string; name: string } | undefined;
  }

  if (excludeId) {
    return db
      .prepare(
        "SELECT id, name FROM stack_folders WHERE parent_id IS NULL AND LOWER(name) = LOWER(?) AND id != ?",
      )
      .get(name, excludeId) as { id: string; name: string } | undefined;
  }
  return db
    .prepare("SELECT id, name FROM stack_folders WHERE parent_id IS NULL AND LOWER(name) = LOWER(?)")
    .get(name) as { id: string; name: string } | undefined;
}

export function listStackFolders(): StackFolder[] {
  const rows = db
    .prepare(
      "SELECT id, name, parent_id, color, sort_order, created_at, updated_at FROM stack_folders ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
    )
    .all() as FolderRow[];

  return rows.map(mapFolderRow);
}

export function getStackFolder(id: string): StackFolder | null {
  const row = db
    .prepare(
      "SELECT id, name, parent_id, color, sort_order, created_at, updated_at FROM stack_folders WHERE id = ?",
    )
    .get(id) as FolderRow | undefined;

  return row ? mapFolderRow(row) : null;
}

export function createStackFolder(data: {
  name: string;
  parentId?: string | null | undefined;
  color?: StackFolderColor | undefined;
  sortOrder?: number | undefined;
}): StackFolder {
  const trimmedName = data.name.trim();
  if (!trimmedName) {
    throw new Error("O nome da pasta é obrigatório");
  }
  if (trimmedName.length > 64) {
    throw new Error("O nome da pasta deve ter no máximo 64 caracteres");
  }

  const parentId = data.parentId ? data.parentId.trim() || null : null;
  if (parentId) {
    const parent = getStackFolder(parentId);
    if (!parent) {
      throw new Error("Pasta pai não encontrada");
    }
  }

  const duplicate = findSiblingByName(trimmedName, parentId);
  if (duplicate) {
    throw new Error(`Já existe uma pasta chamada '${trimmedName}' neste nível`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const color = normalizeColor(data.color);
  const sortOrder = typeof data.sortOrder === "number" ? data.sortOrder : 0;

  db.prepare(
    `INSERT INTO stack_folders (id, name, parent_id, color, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, trimmedName, parentId, color, sortOrder, now, now);

  return {
    id,
    name: trimmedName,
    parentId,
    color,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateStackFolder(
  id: string,
  data: {
    name?: string | undefined;
    parentId?: string | null | undefined;
    color?: StackFolderColor | undefined;
    sortOrder?: number | undefined;
  },
): StackFolder {
  const existing = getStackFolder(id);
  if (!existing) {
    throw new Error("Pasta não encontrada");
  }

  const nextName = data.name !== undefined ? data.name.trim() : existing.name;
  if (!nextName) {
    throw new Error("O nome da pasta é obrigatório");
  }
  if (nextName.length > 64) {
    throw new Error("O nome da pasta deve ter no máximo 64 caracteres");
  }

  const nextParentId =
    data.parentId !== undefined ? (data.parentId ? data.parentId.trim() || null : null) : existing.parentId;

  if (nextParentId === id) {
    throw new Error("Uma pasta não pode ser subpasta dela mesma");
  }

  if (nextParentId) {
    const parent = getStackFolder(nextParentId);
    if (!parent) {
      throw new Error("Pasta pai não encontrada");
    }

    // Cycle check: walk ancestors from nextParentId up to root
    const visited = new Set<string>([id]);
    let cursor: string | null = nextParentId;
    while (cursor) {
      if (visited.has(cursor)) {
        throw new Error("Operação inválida: criaria um ciclo na hierarquia de pastas");
      }
      visited.add(cursor);
      const ancestor = getStackFolder(cursor);
      cursor = ancestor ? ancestor.parentId : null;
    }
  }

  const duplicate = findSiblingByName(nextName, nextParentId, id);
  if (duplicate) {
    throw new Error(`Já existe uma pasta chamada '${nextName}' neste nível`);
  }

  const nextColor = data.color !== undefined ? normalizeColor(data.color) : existing.color;
  const nextSortOrder = data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE stack_folders
     SET name = ?, parent_id = ?, color = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
  ).run(nextName, nextParentId, nextColor, nextSortOrder, now, id);

  return {
    id,
    name: nextName,
    parentId: nextParentId,
    color: nextColor,
    sortOrder: nextSortOrder,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

export function deleteStackFolder(id: string): {
  movedStacksCount: number;
  movedFoldersCount: number;
  promotedToParentId: string | null;
} {
  const existing = getStackFolder(id);
  if (!existing) {
    throw new Error("Pasta não encontrada");
  }

  const targetParentId = existing.parentId;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const childFolders = db
      .prepare("SELECT id, name FROM stack_folders WHERE parent_id = ?")
      .all(id) as Array<{ id: string; name: string }>;

    for (const child of childFolders) {
      let resolvedName = child.name;
      let suffix = 2;
      while (findSiblingByName(resolvedName, targetParentId, child.id)) {
        resolvedName = `${child.name} (${suffix})`;
        suffix += 1;
      }

      db.prepare(
        "UPDATE stack_folders SET parent_id = ?, name = ?, updated_at = ? WHERE id = ?",
      ).run(targetParentId, resolvedName, now, child.id);
    }

    const stacksRes = db
      .prepare("UPDATE stacks SET folder_id = ?, updated_at = ? WHERE folder_id = ?")
      .run(targetParentId, now, id);

    db.prepare("DELETE FROM stack_folders WHERE id = ?").run(id);

    return {
      movedStacksCount: stacksRes.changes,
      movedFoldersCount: childFolders.length,
      promotedToParentId: targetParentId,
    };
  });

  return tx();
}

export function getSubtreeFolderIds(rootFolderId: string): string[] {
  const rows = db.prepare("SELECT id, parent_id FROM stack_folders").all() as Array<{
    id: string;
    parent_id: string | null;
  }>;

  const childrenMap = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = childrenMap.get(row.parent_id) ?? [];
    list.push(row.id);
    childrenMap.set(row.parent_id, list);
  }

  const result: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [rootFolderId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.push(current);

    const children = childrenMap.get(current);
    if (children) {
      for (const childId of children) {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    }
  }

  return result;
}

export async function batchFolderStackAction(
  folderId: string,
  action: "start" | "stop",
  includeSubfolders = true,
): Promise<BatchStackFolderActionResult> {
  const folder = getStackFolder(folderId);
  if (!folder) {
    throw new Error("Pasta não encontrada");
  }

  const folderIds = new Set(includeSubfolders ? getSubtreeFolderIds(folderId) : [folderId]);
  const allStacks = await listStacks();
  const folderStacks = allStacks.filter((s) => s.folderId !== null && folderIds.has(s.folderId));

  const targetedStacks = folderStacks.filter((s) => {
    if (action === "start") {
      const fullyRunning =
        s.status === "deployed" && s.containersCount > 0 && s.runningContainersCount === s.containersCount;
      return !fullyRunning;
    }
    return s.status === "deployed" || s.runningContainersCount > 0;
  });

  const results: BatchStackFolderActionResult["results"] = [];

  for (const stack of targetedStacks) {
    if (stack.status === "deploying") {
      results.push({
        stackId: stack.id,
        stackName: stack.name,
        success: false,
        error: "Deploy em andamento no momento",
      });
      continue;
    }

    if (action === "stop" && isHarborXSelfStack(stack.containers)) {
      results.push({
        stackId: stack.id,
        stackName: stack.name,
        success: false,
        error: "Proteção HarborX: não é possível parar a própria stack do HarborX em lote",
      });
      continue;
    }

    try {
      if (action === "start") {
        await startStack(stack.id);
      } else {
        await stopStack(stack.id);
      }
      results.push({
        stackId: stack.id,
        stackName: stack.name,
        success: true,
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const friendlyMsg =
        action === "start" &&
        (rawMsg.includes("no configuration file provided") ||
          rawMsg.includes("no such service") ||
          rawMsg.includes("ENOENT"))
          ? "Stack ainda não possui containers implantados (execute Deploy primeiro)"
          : rawMsg;

      results.push({
        stackId: stack.id,
        stackName: stack.name,
        success: false,
        error: friendlyMsg,
      });
    }
  }

  return {
    folderId,
    action,
    totalTargeted: targetedStacks.length,
    results,
  };
}
