import type { FastifyPluginAsync } from "fastify";
import { logAudit } from "../services/audit.js";
import { deployStack, getStackByWebhookToken, listStacks } from "../services/stacks.js";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/webhooks - List all configured webhooks for user (authenticated)
  fastify.get("/webhooks", async (request) => {
    const stacks = await listStacks();
    const host = request.headers.host || "localhost:8080";
    const forwardedProto = (request.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim();
    const isLocal =
      host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("0.0.0.0");
    const protocol = forwardedProto || (isLocal ? request.protocol || "http" : "https");

    return stacks.map((s) => ({
      id: s.id,
      stackName: s.name,
      stackType: s.type,
      folderId: s.folderId,
      status: s.status,
      autoDeploy: s.autoDeploy,
      webhookToken: s.webhookToken,
      webhookUrl: `${protocol}://${host}/api/public/hooks/${s.webhookToken}`,
      recentDeployment: s.recentDeployment,
    }));
  });

  const handleWebhookTrigger = async (
    request: Parameters<Parameters<typeof fastify.post>[1]>[0],
    reply: Parameters<Parameters<typeof fastify.post>[1]>[1],
  ) => {
    const params = request.params as { token?: string };
    const token = params?.token || (request.headers["x-harborx-token"] as string);
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

    // Dispara deploy forçando pull da imagem mais recente (:latest / nova tag) e recriação dos containers
    try {
      const result = await deployStack(stack.id, "webhook", { pull: true });
      return {
        success: true,
        message: `Deploy da stack '${stack.name}' concluído com sucesso`,
        stackName: stack.name,
        output: result.output,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        stackName: stack.name,
        error: `Falha na execução do deploy: ${msg}`,
      });
    }
  };

  const handleWebhookInfo = async (
    request: Parameters<Parameters<typeof fastify.get>[1]>[0],
    reply: Parameters<Parameters<typeof fastify.get>[1]>[1],
  ) => {
    const params = request.params as { token?: string };
    const token = params?.token;
    if (!token) return reply.status(400).send({ error: "Token não fornecido" });

    const stack = getStackByWebhookToken(token);
    if (!stack) return reply.status(404).send({ error: "Webhook token inválido ou stack inexistente" });

    return {
      message: `Webhook ativo para a stack '${stack.name}'. Para executar o redeploy, envie uma requisição HTTP POST.`,
      stack: stack.name,
      type: stack.type,
      status: stack.status,
      tip: "No GitHub Actions ou terminal, execute: curl -fsSL -X POST <URL>",
    };
  };

  // POST /api/public/hooks/:token e alias /api/hooks/:token
  fastify.post("/public/hooks/:token", handleWebhookTrigger);
  fastify.post("/hooks/:token", handleWebhookTrigger);

  // GET informativo para navegadores ou testes
  fastify.get("/public/hooks/:token", handleWebhookInfo);
  fastify.get("/hooks/:token", handleWebhookInfo);
};

