import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import {
  batchFolderStackAction,
  createStackFolder,
  deleteStackFolder,
  getStackFolder,
  listStackFolders,
  updateStackFolder,
} from "../services/stack-folders.js";

const folderColorEnum = z.enum([
  "default",
  "amber",
  "emerald",
  "sky",
  "violet",
  "rose",
  "orange",
]);

const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "O nome da pasta é obrigatório")
    .max(64, "O nome da pasta deve ter no máximo 64 caracteres"),
  parentId: z.string().nullable().optional(),
  color: folderColorEnum.optional().default("default"),
  sortOrder: z.number().int().optional(),
});

const updateFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "O nome da pasta é obrigatório")
    .max(64, "O nome da pasta deve ter no máximo 64 caracteres")
    .optional(),
  parentId: z.string().nullable().optional(),
  color: folderColorEnum.optional(),
  sortOrder: z.number().int().optional(),
});

const batchActionSchema = z.object({
  action: z.enum(["start", "stop"]),
  includeSubfolders: z.boolean().optional().default(true),
});

export const stackFolderRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/stack-folders - List all folders
  fastify.get("/stack-folders", async () => {
    return listStackFolders();
  });

  // POST /api/stack-folders - Create folder
  fastify.post(
    "/stack-folders",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = createFolderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues[0]?.message || "Dados inválidos",
          issues: parsed.error.issues,
        });
      }

      try {
        const folder = createStackFolder(parsed.data);

        logAudit({
          userId: request.user?.id,
          action: "stack_folder.create",
          target: folder.name,
          details: { id: folder.id, parentId: folder.parentId, color: folder.color },
          ip: request.ip,
        });

        return reply.status(201).send(folder);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // PATCH /api/stack-folders/:id - Update folder (rename, move parent, color, order)
  fastify.patch<{ Params: { id: string } }>(
    "/stack-folders/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = updateFolderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues[0]?.message || "Dados inválidos",
          issues: parsed.error.issues,
        });
      }

      const existing = getStackFolder(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: "Pasta não encontrada" });
      }

      try {
        const updated = updateStackFolder(request.params.id, parsed.data);

        logAudit({
          userId: request.user?.id,
          action: "stack_folder.update",
          target: updated.name,
          details: { id: updated.id, parentId: updated.parentId, color: updated.color },
          ip: request.ip,
        });

        return updated;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // DELETE /api/stack-folders/:id - Delete folder safely (promotes child folders & stacks up)
  fastify.delete<{ Params: { id: string } }>(
    "/stack-folders/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const existing = getStackFolder(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: "Pasta não encontrada" });
      }

      try {
        const result = deleteStackFolder(request.params.id);

        logAudit({
          userId: request.user?.id,
          action: "stack_folder.delete",
          target: existing.name,
          details: { id: existing.id, ...result },
          ip: request.ip,
        });

        return { success: true, ...result };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  // POST /api/stack-folders/:id/action - Batch start/stop all stacks in folder subtree
  fastify.post<{ Params: { id: string } }>(
    "/stack-folders/:id/action",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = batchActionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Ação em lote inválida",
          issues: parsed.error.issues,
        });
      }

      const existing = getStackFolder(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: "Pasta não encontrada" });
      }

      try {
        const result = await batchFolderStackAction(
          request.params.id,
          parsed.data.action,
          parsed.data.includeSubfolders,
        );

        const succeeded = result.results.filter((r) => r.success).length;
        const failed = result.results.filter((r) => !r.success).length;

        logAudit({
          userId: request.user?.id,
          action: `stack_folder.${parsed.data.action}`,
          target: existing.name,
          details: {
            folderId: existing.id,
            includeSubfolders: parsed.data.includeSubfolders,
            totalTargeted: result.totalTargeted,
            succeeded,
            failed,
          },
          ip: request.ip,
        });

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );
};
