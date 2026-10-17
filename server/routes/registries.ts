import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";
import {
  createRegistry,
  deleteRegistry,
  getRegistrySecret,
  listRegistries,
  normalizeRegistryServerAddress,
  updateRegistry,
  verifyRegistryCredentials,
} from "../services/registries.js";

const createRegistrySchema = z.object({
  name: z.string().min(1, "Nome do registro obrigatório"),
  url: z.string().min(1, "URL ou domínio obrigatório (ex: docker.io, ghcr.io)"),
  username: z.string().min(1, "Usuário obrigatório"),
  secret: z.string().min(1, "Senha ou Personal Access Token obrigatório"),
});

const updateRegistrySchema = z.object({
  name: z.string().min(1, "Nome do registro obrigatório").optional(),
  url: z.string().min(1, "URL ou domínio obrigatório (ex: docker.io, ghcr.io)").optional(),
  username: z.string().min(1, "Usuário obrigatório").optional(),
  secret: z.string().optional(),
});

const testRegistrySchema = z.object({
  url: z.string().min(1, "URL ou domínio obrigatório (ex: docker.io, ghcr.io)"),
  username: z.string().min(1, "Usuário obrigatório"),
  secret: z.string().optional(),
  registryId: z.string().optional(),
  repoUrl: z.string().optional(),
});

export const registryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/registries
  fastify.get("/registries", async () => {
    return listRegistries();
  });

  // POST /api/registries/test - Test credentials with Git providers, scopes & Docker daemon
  fastify.post(
    "/registries/test",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = testRegistrySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Dados de requisição inválidos",
          issues: parsed.error.issues,
        });
      }

      const { url, username, secret, registryId, repoUrl } = parsed.data;
      let effectiveSecret = secret?.trim();

      if (!effectiveSecret && registryId) {
        const storedSecret = getRegistrySecret(registryId);
        if (storedSecret) {
          effectiveSecret = storedSecret;
        }
      }

      if (!effectiveSecret) {
        return reply.status(400).send({
          success: false,
          error: "Senha ou Token não fornecido para teste de conexão.",
        });
      }

      const result = await verifyRegistryCredentials({
        url,
        username,
        secret: effectiveSecret,
        repoUrl,
      });

      return reply.send(result);
    },
  );

  // POST /api/registries
  fastify.post(
    "/registries",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
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
        return reply.status(400).send({ error: `Falha ao salvar registro: ${msg}` });
      }
    },
  );

  // PUT /api/registries/:id
  fastify.put<{ Params: { id: string } }>(
    "/registries/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = updateRegistrySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados de requisição inválidos",
          issues: parsed.error.issues,
        });
      }

      const { id } = request.params;
      const { name, url, username, secret } = parsed.data;

      try {
        const item = updateRegistry(id, { name, url, username, secret });

        logAudit({
          userId: request.user?.id,
          action: "registry.update",
          target: id,
          details: {
            name: item.name,
            url: item.url,
            username: item.username,
            secretUpdated: Boolean(secret && secret.trim().length > 0),
          },
          ip: request.ip,
        });

        return reply.send(item);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: `Falha ao atualizar registro: ${msg}` });
      }
    },
  );

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
