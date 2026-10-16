import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import { createRegistry, deleteRegistry, listRegistries } from "../services/registries.js";

const createRegistrySchema = z.object({
  name: z.string().min(1, "Nome do registro obrigatório"),
  url: z.string().min(1, "URL ou domínio obrigatório (ex: docker.io, ghcr.io)"),
  username: z.string().min(1, "Usuário obrigatório"),
  secret: z.string().min(1, "Senha ou Personal Access Token obrigatório"),
});

export const registryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/registries
  fastify.get("/registries", async () => {
    return listRegistries();
  });

  // POST /api/registries
  fastify.post("/registries", { preHandler: [requireRole("operator", "admin")] }, async (request, reply) => {
    const parsed = createRegistrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Dados de requisição inválidos",
        issues: parsed.error.issues,
      });
    }

    const { name, url, username, secret } = parsed.data;

    try {
      const item = createRegistry(name, url, username, secret);

      logAudit({
        userId: request.user?.id,
        action: "registry.create",
        target: name,
        details: { url, username },
        ip: request.ip,
      });

      return reply.status(201).send(item);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao salvar registro: ${msg}` });
    }
  });

  // DELETE /api/registries/:id
  fastify.delete<{ Params: { id: string } }>(
    "/registries/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id } = request.params;
      const success = deleteRegistry(id);
      if (!success) {
        return reply.status(404).send({ error: "Registro não encontrado" });
      }

      logAudit({
        userId: request.user?.id,
        action: "registry.remove",
        target: id,
        ip: request.ip,
      });

      return { success: true };
    },
  );
};
