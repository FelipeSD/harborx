import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import {
  createStackRecord,
  deployStack,
  getStack,
  listStacks,
  removeStack,
  startStack,
  stopStack,
  updateStackCompose,
} from "../services/stacks.js";

const createStackSchema = z.object({
  name: z.string().min(2, "Nome da stack deve ter no mínimo 2 caracteres"),
  type: z.enum(["compose", "git"]).default("compose"),
  composeYaml: z.string().optional(),
  env: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        secret: z.boolean().default(false),
      }),
    )
    .optional(),
  gitRepo: z.string().optional(),
  gitBranch: z.string().optional(),
  gitPath: z.string().optional(),
  autoDeploy: z.boolean().default(false),
  deployNow: z.boolean().default(true),
});

const updateStackSchema = z.object({
  composeYaml: z.string().min(1, "Compose YAML obrigatório"),
  env: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        secret: z.boolean().default(false),
      }),
    )
    .optional(),
  redeploy: z.boolean().default(true),
});

export const stackRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/stacks - List all stacks
  fastify.get("/stacks", async () => {
    return listStacks();
  });

  // GET /api/stacks/:id - Get single stack
  fastify.get<{ Params: { id: string } }>("/stacks/:id", async (request, reply) => {
    const stack = await getStack(request.params.id);
    if (!stack) {
      return reply.status(404).send({ error: "Stack não encontrada" });
    }
    return stack;
  });

  // POST /api/stacks - Create stack
  fastify.post(
    "/stacks",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = createStackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados inválidos",
          issues: parsed.error.issues,
        });
      }

      const { name, type, composeYaml, env, gitRepo, gitBranch, gitPath, autoDeploy, deployNow } =
        parsed.data;

      // Ensure composeYaml or gitRepo is provided
      if (type === "compose" && (!composeYaml || composeYaml.trim().length === 0)) {
        return reply.status(400).send({ error: "Conteúdo do docker-compose.yml é obrigatório" });
      }
      if (type === "git" && (!gitRepo || gitRepo.trim().length === 0)) {
        return reply.status(400).send({ error: "URL do repositório Git é obrigatória" });
      }

      try {
        const stack = createStackRecord({
          name,
          type,
          composeYaml,
          env,
          gitRepo,
          gitBranch,
          gitPath,
          autoDeploy,
        });

        logAudit({
          userId: request.user?.id,
          action: "stack.create",
          target: stack.name,
          details: { id: stack.id, type },
          ip: request.ip,
        });

        if (deployNow) {
          // Trigger deploy
          try {
            await deployStack(stack.id, request.user?.username || "user");
          } catch (deployErr: unknown) {
            const msg = deployErr instanceof Error ? deployErr.message : String(deployErr);
            request.log.warn(`Deploy inicial da stack ${name} falhou: ${msg}`);
          }
        }

        const fresh = await getStack(stack.id);
        return reply.status(201).send(fresh || stack);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao criar stack: ${msg}` });
      }
    },
  );

  // PUT /api/stacks/:id - Update compose & redeploy
  fastify.put<{ Params: { id: string } }>(
    "/stacks/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = updateStackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados inválidos",
          issues: parsed.error.issues,
        });
      }

      const { composeYaml, env, redeploy } = parsed.data;

      try {
        await updateStackCompose(request.params.id, composeYaml, env);

        logAudit({
          userId: request.user?.id,
          action: "stack.update",
          target: request.params.id,
          details: { redeploy },
          ip: request.ip,
        });

        if (redeploy) {
          await deployStack(request.params.id, request.user?.username || "user");
        }

        const fresh = await getStack(request.params.id);
        return fresh;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao atualizar stack: ${msg}` });
      }
    },
  );

  // POST /api/stacks/:id/deploy
  fastify.post<{ Params: { id: string } }>(
    "/stacks/:id/deploy",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      try {
        const result = await deployStack(request.params.id, request.user?.username || "user");

        logAudit({
          userId: request.user?.id,
          action: "stack.deploy",
          target: request.params.id,
          ip: request.ip,
        });

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha no deploy da stack: ${msg}` });
      }
    },
  );

  // POST /api/stacks/:id/stop
  fastify.post<{ Params: { id: string } }>(
    "/stacks/:id/stop",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      try {
        await stopStack(request.params.id);

        logAudit({
          userId: request.user?.id,
          action: "stack.stop",
          target: request.params.id,
          ip: request.ip,
        });

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao parar stack: ${msg}` });
      }
    },
  );

  // POST /api/stacks/:id/start
  fastify.post<{ Params: { id: string } }>(
    "/stacks/:id/start",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      try {
        await startStack(request.params.id);

        logAudit({
          userId: request.user?.id,
          action: "stack.start",
          target: request.params.id,
          ip: request.ip,
        });

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao iniciar stack: ${msg}` });
      }
    },
  );

  // DELETE /api/stacks/:id
  fastify.delete<{ Params: { id: string }; Querystring: { volumes?: string } }>(
    "/stacks/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const removeVolumes = request.query.volumes === "true";

      try {
        await removeStack(request.params.id, removeVolumes);

        logAudit({
          userId: request.user?.id,
          action: "stack.remove",
          target: request.params.id,
          details: { removeVolumes },
          ip: request.ip,
        });

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao remover stack: ${msg}` });
      }
    },
  );
};
