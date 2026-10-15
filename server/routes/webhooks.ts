import type { FastifyPluginAsync } from "fastify";
import { logAudit } from "../services/audit.js";
import { deployStack, getStackByWebhookToken, listStacks } from "../services/stacks.js";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/webhooks - List all configured webhooks for user
  fastify.get("/webhooks", async (request) => {
    const stacks = await listStacks();
    const host = request.headers.host || "localhost:8080";
    const protocol = request.protocol || "http";

    return stacks.map((s) => ({
      id: s.id,
      stackName: s.name,
      stackType: s.type,
      status: s.status,
      autoDeploy: s.autoDeploy,
      webhookToken: s.webhookToken,
      webhookUrl: `${protocol}://${host}/api/public/hooks/${s.webhookToken}`,
      recentDeployment: s.recentDeployment,
    }));
  });

  // POST /api/public/hooks/:token - Public endpoint called by GitHub Actions, GitLab CI or curl
  fastify.post<{ Params: { token: string } }>("/public/hooks/:token", async (request, reply) => {
    const token = request.params.token || (request.headers["x-harborx-token"] as string);
    if (!token) {
      return reply.status(401).send({ error: "Token de webhook não fornecido" });
    }

    const stack = getStackByWebhookToken(token);
    if (!stack) {
      return reply.status(404).send({ error: "Webhook token inválido ou stack inexistente" });
    }

    request.log.info(`[HarborX Webhook] Redeploy acionado para stack '${stack.name}'`);

    logAudit({
      userId: undefined,
      action: "webhook.redeploy",
      target: stack.name,
      details: { token: `${token.slice(0, 6)}...`, ip: request.ip },
      ip: request.ip,
    });

    // Trigger deploy in background or sync
    try {
      const result = await deployStack(stack.id, "webhook");
      return {
        success: true,
        message: `Deploy da stack '${stack.name}' concluído com sucesso`,
        output: result.output,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: `Falha na execução do deploy: ${msg}`,
      });
    }
  });
};
