import os from "node:os";
import type { FastifyPluginAsync } from "fastify";
import type {
  ImageSummary,
  NetworkSummary,
  SystemInfo,
  VolumeSummary,
} from "../../shared/types.js";
import { docker } from "../docker.js";
import { getHostMetricsHistory } from "../services/metrics.js";

export const dockerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/system/info
  fastify.get("/system/info", async (_request, reply) => {
    try {
      const [info, version] = await Promise.all([docker.info(), docker.version()]);

      const systemInfo: SystemInfo = {
        containers: info.Containers || 0,
        containersRunning: info.ContainersRunning || 0,
        containersPaused: info.ContainersPaused || 0,
        containersStopped: info.ContainersStopped || 0,
        images: info.Images || 0,
        serverVersion: version.Version || info.ServerVersion || "desconhecida",
        operatingSystem: info.OperatingSystem || "desconhecido",
        architecture: info.Architecture || version.Arch || "desconhecida",
        cpus: info.NCPU || 0,
        memTotal: info.MemTotal || 0,
        name: info.Name || "Docker Host",
        dockerRootDir: info.DockerRootDir || "",
      };

      return systemInfo;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply
        .status(502)
        .send({ error: `Falha ao obter informações do sistema Docker: ${msg}` });
    }
  });

  // GET /api/system/df (Disk usage breakdown)
  fastify.get("/system/df", async (_request, reply) => {
    try {
      const df = await docker.df();
      return {
        layersSize: df.LayersSize || 0,
        images: (df.Images || []).length,
        containers: (df.Containers || []).length,
        volumes: (df.Volumes || []).length,
        buildCache: (df.BuildCache || []).length,
        raw: df,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao obter uso de disco: ${msg}` });
    }
  });

  // GET /api/system/host-metrics (24h history for dashboard charts)
  fastify.get<{ Querystring: { hours?: string } }>("/system/host-metrics", async (request) => {
    const hours = parseInt(request.query.hours || "24", 10) || 24;
    return { points: getHostMetricsHistory(hours) };
  });

  // GET /api/system/host (Host hardware and OS metrics)
  fastify.get("/system/host", async () => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptime: os.uptime(),
      cpusCount: cpus.length,
      cpuModel: cpus[0]?.model || "CPU",
      totalMem,
      freeMem,
      usedMem: totalMem - freeMem,
    };
  });
};
