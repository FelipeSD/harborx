import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";
import { createRegistry, deleteRegistry, listRegistries } from "../services/registries.js";

function normalizeRegistryServerAddress(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();
  const clean = lower.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (
    clean === "docker.io" ||
    clean === "registry-1.docker.io" ||
    clean.startsWith("index.docker.io")
  ) {
    return "https://index.docker.io/v1/";
  }
  if (trimmed.startsWith("http://")) {
    return `http://${clean}`;
  }
  return `https://${clean}`;
}

const createRegistrySchema = z.object({
  name: z.string().min(1, "Nome do registro obrigatório"),
  url: z.string().min(1, "URL ou domínio obrigatório (ex: docker.io, ghcr.io)"),
  username: z.string().min(1, "Usuário obrigatório"),
  secret: z.string().min(1, "Senha ou Personal Access Token obrigatório"),
});

const testRegistrySchema = z.object({
  url: z.string().min(1, "URL ou domínio obrigatório (ex: docker.io, ghcr.io)"),
  username: z.string().min(1, "Usuário obrigatório"),
  secret: z.string().min(1, "Senha ou Personal Access Token obrigatório"),
});

export const registryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/registries
  fastify.get("/registries", async () => {
    return listRegistries();
  });

  // POST /api/registries/test - Test credentials with Docker daemon
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

      const { url, username, secret } = parsed.data;
      const serveraddress = normalizeRegistryServerAddress(url);

      try {
        const res = await docker.checkAuth({
          username: username.trim(),
          password: secret.trim(),
          serveraddress,
        });

        const statusMsg =
          (res as { Status?: string })?.Status || "Autenticação realizada com sucesso!";

        return reply.send({
          success: true,
          status: statusMsg,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        let friendlyError = msg;
        if (
          msg.includes("401") ||
          msg.toLowerCase().includes("unauthorized") ||
          msg.toLowerCase().includes("incorrect") ||
          msg.toLowerCase().includes("bad credentials")
        ) {
          friendlyError =
            "Credenciais inválidas: usuário ou senha/token incorretos para este registro.";
        } else if (
          msg.includes("ENOTFOUND") ||
          msg.toLowerCase().includes("no such host") ||
          msg.includes("EAI_AGAIN")
        ) {
          friendlyError = `Não foi possível alcançar o servidor do registro (${serveraddress}). Verifique o domínio digitado.`;
        } else if (msg.includes("connect ECONNREFUSED")) {
          friendlyError = `Conexão recusada ao tentar conectar em ${serveraddress}.`;
        }

        return reply.send({
          success: false,
          error: friendlyError,
        });
      }
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
