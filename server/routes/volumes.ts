import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { VolumeSummary } from "../../shared/types.js";
import { requireRole } from "../auth/middleware.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";

const createVolumeSchema = z.object({
  name: z.string().optional(),
  driver: z.string().default("local"),
  driverOpts: z.record(z.string()).optional(),
  labels: z.record(z.string()).optional(),
});

export const volumeRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/volumes - List volumes with container usage reference
  fastify.get("/volumes", async (_request, reply) => {
    try {
      const [volResult, containerList] = await Promise.all([
        docker.listVolumes(),
        docker.listContainers({ all: true }).catch(() => []),
      ]);

      // Map volume name -> container names
      const volumeUsers = new Map<string, Array<{ id: string; name: string }>>();
      for (const c of containerList) {
        const rawName = (c.Names?.[0] || c.Id).replace(/^\//, "");
        if (Array.isArray(c.Mounts)) {
          for (const m of c.Mounts) {
            if (m.Type === "volume" && m.Name) {
              const current = volumeUsers.get(m.Name) || [];
              current.push({ id: c.Id, name: rawName });
              volumeUsers.set(m.Name, current);
            }
          }
        }
      }

      const rawVolumes = volResult.Volumes || [];
      const volumes: VolumeSummary[] = rawVolumes.map((vol) => {
        const anyVol = vol as unknown as {
          CreatedAt?: string;
          UsageData?: { Size: number; RefCount: number };
        };
        const users = volumeUsers.get(vol.Name) || [];

        return {
          name: vol.Name,
          driver: vol.Driver,
          mountpoint: vol.Mountpoint,
          createdAt: anyVol.CreatedAt,
          labels: vol.Labels || {},
          scope: vol.Scope,
          usageData: anyVol.UsageData
            ? {
                size: anyVol.UsageData.Size,
                refCount: anyVol.UsageData.RefCount,
              }
            : undefined,
          inUseBy: users,
        };
      });

      return volumes;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao listar volumes do Docker: ${msg}` });
    }
  });

  // GET /api/volumes/:name/inspect
  fastify.get<{ Params: { name: string } }>("/volumes/:name/inspect", async (request, reply) => {
    try {
      const vol = docker.getVolume(request.params.name);
      const data = await vol.inspect();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(404).send({ error: `Volume não encontrado: ${msg}` });
    }
  });

  // POST /api/volumes - Create volume
  fastify.post("/volumes", { preHandler: [requireRole("operator")] }, async (request, reply) => {
    const parsed = createVolumeSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Dados de requisição inválidos",
        issues: parsed.error.issues,
      });
    }

    const { name, driver, driverOpts, labels } = parsed.data;

    try {
      const result = await docker.createVolume({
        Name: name,
        Driver: driver,
        DriverOpts: driverOpts,
        Labels: labels,
      });

      logAudit({
        userId: request.user?.id,
        action: "volume.create",
        target: result.name || name || "novo-volume",
        details: { driver, labels },
        ip: request.ip,
      });

      return reply.status(201).send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao criar volume: ${msg}` });
    }
  });

  // DELETE /api/volumes/:name
  fastify.delete<{ Params: { name: string }; Querystring: { force?: string } }>(
    "/volumes/:name",
    { preHandler: [requireRole("operator")] },
    async (request, reply) => {
      const { name } = request.params;
      const force = request.query.force === "true";

      try {
        const vol = docker.getVolume(name);
        await vol.remove({ force });

        logAudit({
          userId: request.user?.id,
          action: "volume.remove",
          target: name,
          details: { force },
          ip: request.ip,
        });

        return { success: true, name };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao remover volume: ${msg}` });
      }
    },
  );

  // POST /api/volumes/prune
  fastify.post(
    "/volumes/prune",
    { preHandler: [requireRole("operator")] },
    async (request, reply) => {
      try {
        const result = await docker.pruneVolumes();

        logAudit({
          userId: request.user?.id,
          action: "volume.prune",
          target: "volumes",
          details: {
            volumesDeleted: result.VolumesDeleted?.length || 0,
            spaceReclaimed: result.SpaceReclaimed || 0,
          },
          ip: request.ip,
        });

        return {
          success: true,
          volumesDeleted: result.VolumesDeleted || [],
          spaceReclaimed: result.SpaceReclaimed || 0,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao podar volumes: ${msg}` });
      }
    },
  );
};
