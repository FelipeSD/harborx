import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { db } from "../db/index.js";
import { logAudit } from "../services/audit.js";
import { findGitAuthForRepo } from "../services/registries.js";
import {
  createStackRecord,
  deployStack,
  getStack,
  listStacks,
  removeStack,
  startStack,
  stopStack,
  updateStackCompose,
  updateStackRecord,
} from "../services/stacks.js";

const execFileAsync = promisify(execFile);

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
  gitRegistryId: z.string().nullable().optional(),
  autoDeploy: z.boolean().default(false),
  deployNow: z.boolean().default(true),
});

const updateStackSchema = z.object({
  name: z.string().min(2, "Nome da stack deve ter no mínimo 2 caracteres").optional(),
  type: z.enum(["compose", "git"]).optional(),
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
  gitRegistryId: z.string().nullable().optional(),
  autoDeploy: z.boolean().optional(),
  redeploy: z.boolean().default(true),
  pull: z.boolean().default(false).optional(),
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

      const {
        name,
        type,
        composeYaml,
        env,
        gitRepo,
        gitBranch,
        gitPath,
        gitRegistryId,
        autoDeploy,
        deployNow,
      } = parsed.data;

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
          gitRegistryId,
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
          // Immediately mark stack as deploying in DB and launch deployment in background
          db.prepare("UPDATE stacks SET status = 'deploying', updated_at = ? WHERE id = ?").run(
            new Date().toISOString(),
            stack.id,
          );
          void deployStack(stack.id, request.user?.username || "user").catch(
            (deployErr: unknown) => {
              const msg = deployErr instanceof Error ? deployErr.message : String(deployErr);
              request.log.warn(`Deploy inicial da stack ${name} falhou: ${msg}`);
            },
          );
        }

        const fresh = await getStack(stack.id);
        const responseData = fresh || stack;
        if (deployNow && responseData.status !== "deploying") {
          responseData.status = "deploying";
        }
        return reply.status(201).send(responseData);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: `Falha ao criar stack: ${msg}` });
      }
    },
  );

  // PUT /api/stacks/:id - Update stack configuration & optional redeploy
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

      const {
        name,
        type,
        composeYaml,
        env,
        gitRepo,
        gitBranch,
        gitPath,
        gitRegistryId,
        autoDeploy,
        redeploy,
        pull,
      } = parsed.data;

      try {
        await updateStackRecord(request.params.id, {
          name,
          type,
          composeYaml,
          env,
          gitRepo,
          gitBranch,
          gitPath,
          gitRegistryId,
          autoDeploy,
        });

        logAudit({
          userId: request.user?.id,
          action: "stack.update",
          target: request.params.id,
          details: { name, type, redeploy, pull },
          ip: request.ip,
        });

        if (redeploy) {
          db.prepare("UPDATE stacks SET status = 'deploying', updated_at = ? WHERE id = ?").run(
            new Date().toISOString(),
            request.params.id,
          );
          void deployStack(request.params.id, request.user?.username || "user", {
            pull: Boolean(pull),
          }).catch((deployErr: unknown) => {
            const msg = deployErr instanceof Error ? deployErr.message : String(deployErr);
            request.log.warn(`Redeploy da stack ${name} falhou: ${msg}`);
          });
        }

        const fresh = await getStack(request.params.id);
        const responseData = fresh;
        if (responseData && redeploy && responseData.status !== "deploying") {
          responseData.status = "deploying";
        }
        return responseData;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: `Falha ao atualizar stack: ${msg}` });
      }
    },
  );

  // POST /api/stacks/:id/deploy
  fastify.post<{ Params: { id: string }; Body?: { pull?: boolean } }>(
    "/stacks/:id/deploy",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      try {
        const pull = Boolean(request.body?.pull);
        const result = await deployStack(request.params.id, request.user?.username || "user", {
          pull,
        });

        logAudit({
          userId: request.user?.id,
          action: "stack.deploy",
          target: request.params.id,
          details: { pull },
          ip: request.ip,
        });

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: `Falha no deploy da stack: ${msg}` });
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
        return reply.status(400).send({ error: `Falha ao parar stack: ${msg}` });
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
        return reply.status(400).send({ error: `Falha ao iniciar stack: ${msg}` });
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
        return reply.status(400).send({ error: `Falha ao remover stack: ${msg}` });
      }
    },
  );

  // GET /api/stacks/:id/logs - Get recent deployment logs
  fastify.get<{ Params: { id: string } }>("/stacks/:id/logs", async (request, reply) => {
    const stack = await getStack(request.params.id);
    if (!stack) {
      return reply.status(404).send({ error: "Stack não encontrada" });
    }

    const deployments = db
      .prepare(
        "SELECT id, stack_id, triggered_by, status, output_log, created_at FROM stack_deployments WHERE stack_id = ? ORDER BY created_at DESC LIMIT 10",
      )
      .all(stack.id) as Array<{
      id: string;
      stack_id: string;
      triggered_by: string;
      status: string;
      output_log: string;
      created_at: string;
    }>;

    return deployments.map((d) => ({
      id: d.id,
      stackId: d.stack_id,
      triggeredBy: d.triggered_by,
      status: d.status,
      outputLog: d.output_log,
      createdAt: d.created_at,
    }));
  });

  // POST /api/stacks/test-git - Test git access & branch with credentials
  fastify.post(
    "/stacks/test-git",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const testGitSchema = z.object({
        gitRepo: z.string().min(1, "URL do repositório Git é obrigatória"),
        gitBranch: z.string().optional().default("main"),
        gitRegistryId: z.string().nullable().optional(),
      });

      const parsed = testGitSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: "Dados inválidos para teste de repositório",
        });
      }

      const { gitRepo, gitBranch, gitRegistryId } = parsed.data;

      // Normalize git@ SSH URLs to https://
      let cleanRepo = gitRepo.trim();
      if (cleanRepo.startsWith("git@")) {
        cleanRepo = cleanRepo.replace(/^git@([^:]+):/, "https://$1/");
      }

      const gitAuth = findGitAuthForRepo(cleanRepo, gitRegistryId);
      const isGitHub = cleanRepo.includes("github.com");
      const authUsername = isGitHub
        ? "x-access-token"
        : gitAuth?.username.replace(/^@+/, "").trim() || "oauth2";

      const gitExtraArgs: string[] = ["-c", "credential.helper=", "-c", "core.askPass="];

      if (gitAuth && !cleanRepo.includes("@")) {
        const basicToken = Buffer.from(`${authUsername}:${gitAuth.secret}`).toString("base64");
        gitExtraArgs.push("-c", `http.extraheader=Authorization: Basic ${basicToken}`);
      }

      const gitEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
      };

      try {
        const targetBranch = (gitBranch || "main").trim();
        let stdout = "";

        try {
          const res = await execFileAsync(
            "git",
            [...gitExtraArgs, "ls-remote", "--heads", cleanRepo, targetBranch],
            { timeout: 15000, env: gitEnv },
          );
          stdout = res.stdout;
        } catch (firstErr) {
          // If extraheader failed and we have gitAuth, try direct authenticated URL
          if (gitAuth) {
            try {
              const u = new URL(cleanRepo.startsWith("http") ? cleanRepo : `https://${cleanRepo}`);
              u.username = authUsername;
              u.password = gitAuth.secret;
              const directAuthUrl = u.toString();

              const fallbackRes = await execFileAsync(
                "git",
                [
                  "-c",
                  "credential.helper=",
                  "-c",
                  "core.askPass=",
                  "ls-remote",
                  "--heads",
                  directAuthUrl,
                  targetBranch,
                ],
                { timeout: 15000, env: gitEnv },
              );
              stdout = fallbackRes.stdout;
            } catch {
              throw firstErr;
            }
          } else {
            throw firstErr;
          }
        }

        if (!stdout.trim()) {
          // Check if repo has any branches
          try {
            const anyRefs = await execFileAsync(
              "git",
              [...gitExtraArgs, "ls-remote", "--heads", cleanRepo],
              { timeout: 15000, env: gitEnv },
            );
            if (anyRefs.stdout.trim()) {
              return reply.send({
                success: true,
                warning: `Repositório acessado com sucesso! Porém a branch '${targetBranch}' não foi encontrada na lista de branches remotos.`,
              });
            }
          } catch {
            // ignore ref check
          }
        }

        const credInfo = gitAuth ? ` via credencial '${gitAuth.registryName}'` : "";
        return reply.send({
          success: true,
          status: `Conexão bem-sucedida! Repositório acessível e branch '${targetBranch}' verificada${credInfo}. HarborX possui permissão para clonar.`,
        });
      } catch (err: unknown) {
        let msg = err instanceof Error ? err.message : String(err);
        if (gitAuth?.secret) {
          msg = msg.replaceAll(gitAuth.secret, "******");
        }

        let friendly = msg;
        if (
          msg.includes("401") ||
          msg.includes("Authentication failed") ||
          msg.includes("could not read Username")
        ) {
          friendly =
            "Falha de autenticação: credencial ausente, token expirado ou inválido para este repositório.";
        } else if (
          msg.includes("403") ||
          msg.includes("Repository not found") ||
          msg.includes("access denied") ||
          msg.includes("not found")
        ) {
          friendly = isGitHub
            ? "Acesso negado (403 ou Repositório não encontrado). Se estiver usando um Token Fine-Grained do GitHub (github_pat_...), certifique-se no GitHub (Settings > Developer Settings > Fine-grained tokens) de que o repositório específico foi incluído em 'Repository access' (caso esteja configurado 'Only select repositories') e conceda a permissão 'Contents: Read-only'. Se o repositório pertence a uma Organização, confirme também se a organização aprovou o token."
            : "Acesso negado (403 ou Repositório não encontrado): o token configurado não possui permissão para ler este repositório.";
        }

        return reply.send({
          success: false,
          error: friendly,
        });
      }
    },
  );
};
