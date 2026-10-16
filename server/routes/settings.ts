import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import { getR2BackupSettings, saveR2BackupSettings } from "../services/settings.js";

const r2SettingsSchema = z.object({
  endpoint: z.string().min(1, "Endpoint do Cloudflare R2 obrigatório"),
  bucket: z.string().min(1, "Bucket do R2 obrigatório"),
  accessKeyId: z.string().min(1, "Access Key ID obrigatório"),
  secretAccessKey: z.string().optional(),
  resticPassword: z.string().optional(),
  intervalSeconds: z.number().optional(),
  keepDaily: z.number().optional(),
  keepWeekly: z.number().optional(),
  keepMonthly: z.number().optional(),
});

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/settings/r2-backup
  fastify.get(
    "/settings/r2-backup",
    { preHandler: [requireRole("operator", "admin")] },
    async () => {
      const settings = getR2BackupSettings(true);
      return settings || {};
    },
  );

  // POST /api/settings/r2-backup
  fastify.post(
    "/settings/r2-backup",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = r2SettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados de configuração inválidos",
          issues: parsed.error.issues,
        });
      }

      saveR2BackupSettings(parsed.data);

      logAudit({
        userId: request.user?.id,
        action: "settings.r2_backup.update",
        target: parsed.data.bucket,
        details: { endpoint: parsed.data.endpoint, bucket: parsed.data.bucket },
        ip: request.ip,
      });

      return reply.send({ success: true });
    },
  );
};
