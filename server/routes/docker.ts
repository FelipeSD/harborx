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
  // GET /api/images
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

  // GET /api/networks
  fastify.get("/networks", async (_request, reply) => {
    try {
      const list = await docker.listNetworks();
      const networks: NetworkSummary[] = list.map((net) => ({
        id: net.Id,
        name: net.Name,
        driver: net.Driver,
        scope: net.Scope,
        internal: Boolean(net.Internal),
        attachable: Boolean(net.Attachable),
        ipam: net.IPAM
          ? {
              driver: net.IPAM.Driver,
              config: (net.IPAM.Config || []).map(
                (cfg: { Subnet?: string | undefined; Gateway?: string | undefined }) => ({
                  subnet: cfg.Subnet,
                  gateway: cfg.Gateway,
                }),
              ),
            }
          : undefined,
        containers: net.Containers
          ? Object.fromEntries(
              Object.entries(net.Containers).map(([cid, info]) => [
                cid,
                {
                  name: info.Name,
                  endpointId: info.EndpointID,
                  macAddress: info.MacAddress,
                  ipv4Address: info.IPv4Address,
                  ipv6Address: info.IPv6Address,
                },
              ]),
            )
          : undefined,
      }));

      return networks;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao listar redes do Docker: ${msg}` });
    }
  });

  // GET /api/volumes
  fastify.get("/volumes", async (_request, reply) => {
    try {
      const result = await docker.listVolumes();
      const rawVolumes = result.Volumes || [];
      const volumes: VolumeSummary[] = rawVolumes.map((vol) => {
        const anyVol = vol as unknown as {
          CreatedAt?: string;
          UsageData?: { Size: number; RefCount: number };
        };
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
        };
      });

      return volumes;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao listar volumes do Docker: ${msg}` });
    }
  });

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
