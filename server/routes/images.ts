import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ImageSummary } from "../../shared/types.js";
import { requireRole } from "../auth/middleware.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";
import { getRegistryAuthForImage } from "../services/registries.js";

const pullSchema = z.object({
  ref: z.string().min(1, "Nome da imagem obrigatório"),
  stream: z.boolean().default(true),
});

const pruneSchema = z.object({
  danglingOnly: z.boolean().default(false),
});

export const imageRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/images - List images
  fastify.get("/images", async (_request, reply) => {
    try {
      const list = await docker.listImages({ all: false });
      const images: ImageSummary[] = list.map((img) => ({
        id: img.Id,
        repoTags: (img.RepoTags || []).filter((t) => t !== "<none>:<none>"),
        repoDigests: img.RepoDigests || [],
        created: img.Created,
        size: img.Size,
        containers: img.Containers,
        labels: img.Labels || {},
      }));

      return images;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao listar imagens do Docker: ${msg}` });
    }
  });

  // GET /api/images/:id/inspect
  fastify.get<{ Params: { id: string } }>("/images/:id/inspect", async (request, reply) => {
    try {
      const img = docker.getImage(request.params.id);
      const data = await img.inspect();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(404).send({ error: `Imagem não encontrada: ${msg}` });
    }
  });

  // GET /api/images/:id/history
  fastify.get<{ Params: { id: string } }>("/images/:id/history", async (request, reply) => {
    try {
      const img = docker.getImage(request.params.id);
      const history = await img.history();
      return history;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(404).send({ error: `Histórico da imagem indisponível: ${msg}` });
    }
  });

  // POST /api/images/pull (SSE Streaming or sync pull)
  fastify.post(
    "/images/pull",
    { preHandler: [requireRole("operator")] },
    async (request, reply) => {
      const parsed = pullSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados de requisição inválidos",
          issues: parsed.error.issues,
        });
      }

      const { ref, stream } = parsed.data;
      const auth = getRegistryAuthForImage(ref);
      const authconfig = auth
        ? {
            username: auth.username,
            password: auth.password,
            serveraddress: auth.serveraddress,
          }
        : undefined;

      const user = request.user;

      if (!stream) {
        try {
          await new Promise<void>((resolve, reject) => {
            docker.pull(
              ref,
              { authconfig },
              (err: Error | null, pullStream: NodeJS.ReadableStream) => {
                if (err) return reject(err);
                docker.modem.followProgress(pullStream, (finishErr) => {
                  if (finishErr) return reject(finishErr);
                  resolve();
                });
              },
            );
          });

          logAudit({
            userId: user?.id,
            action: "image.pull",
            target: ref,
            details: { authConfigUsed: Boolean(auth) },
            ip: request.ip,
          });

          return { success: true, ref };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(502).send({ error: `Falha ao baixar imagem: ${msg}` });
        }
      }

      // SSE Stream mode
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders?.();

      docker.pull(ref, { authconfig }, (err: Error | null, pullStream: NodeJS.ReadableStream) => {
        if (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          reply.raw.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
          reply.raw.end();
          return;
        }

        docker.modem.followProgress(
          pullStream,
          (finishErr) => {
            if (finishErr) {
              const errorMsg = finishErr instanceof Error ? finishErr.message : String(finishErr);
              reply.raw.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
            } else {
              logAudit({
                userId: user?.id,
                action: "image.pull",
                target: ref,
                details: { authConfigUsed: Boolean(auth) },
                ip: request.ip,
              });
              reply.raw.write(`data: ${JSON.stringify({ status: "Complete", success: true })}\n\n`);
            }
            reply.raw.end();
          },
          (progressEvent) => {
            reply.raw.write(`data: ${JSON.stringify(progressEvent)}\n\n`);
          },
        );
      });

      return reply;
    },
  );

  // DELETE /api/images/:id
  fastify.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    "/images/:id",
    { preHandler: [requireRole("operator")] },
    async (request, reply) => {
      const { id } = request.params;
      const force = request.query.force === "true";

      try {
        const img = docker.getImage(id);
        const result = await img.remove({ force });

        logAudit({
          userId: request.user?.id,
          action: "image.remove",
          target: id,
          details: { force },
          ip: request.ip,
        });

        return { success: true, result };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao remover imagem: ${msg}` });
      }
    },
  );

  // POST /api/images/prune
  fastify.post(
    "/images/prune",
    { preHandler: [requireRole("operator")] },
    async (request, reply) => {
      const parsed = pruneSchema.safeParse(request.body || {});
      const danglingOnly = parsed.success ? parsed.data.danglingOnly : false;

      try {
        const filters = danglingOnly ? { dangling: { true: true } } : undefined;
        const result = await docker.pruneImages({ filters });

        logAudit({
          userId: request.user?.id,
          action: "image.prune",
          target: "images",
          details: {
            danglingOnly,
            imagesDeleted: result.ImagesDeleted?.length || 0,
            spaceReclaimed: result.SpaceReclaimed || 0,
          },
          ip: request.ip,
        });

        return {
          success: true,
          imagesDeleted: result.ImagesDeleted || [],
          spaceReclaimed: result.SpaceReclaimed || 0,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao podar imagens: ${msg}` });
      }
    },
  );
};
