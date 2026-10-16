import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { NetworkSummary } from "../../shared/types.js";
import { requireRole } from "../auth/middleware.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";

const BUILTIN_NETWORKS = new Set(["bridge", "host", "none"]);

const createNetworkSchema = z.object({
  name: z.string().min(1, "Nome da rede obrigatório"),
  driver: z.enum(["bridge", "overlay", "macvlan", "ipvlan"]).default("bridge"),
  subnet: z.string().optional(),
  gateway: z.string().optional(),
  internal: z.boolean().default(false),
  attachable: z.boolean().default(true),
  labels: z.record(z.string()).optional(),
});

const connectSchema = z.object({
  container: z.string().min(1, "Identificador do container obrigatório"),
  ipv4Address: z.string().optional(),
  ipv6Address: z.string().optional(),
});

const disconnectSchema = z.object({
  container: z.string().min(1, "Identificador do container obrigatório"),
  force: z.boolean().default(false),
});

export const networkRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/networks - List networks
  fastify.get("/networks", async (_request, reply) => {
    try {
      const [list, containerList] = await Promise.all([
        docker.listNetworks(),
        docker.listContainers({ all: true }).catch(() => []),
      ]);

      // Map network name/id -> containers
      const networkContainers = new Map<string, Array<{ id: string; name: string; ipv4?: string }>>();
      for (const c of containerList) {
        const cleanName = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, "");
        const networks = c.NetworkSettings?.Networks || {};
        for (const [netName, netInfo] of Object.entries(networks)) {
          const entry = {
            id: c.Id,
            name: cleanName,
            ipv4: (netInfo as { IPAddress?: string }).IPAddress || undefined,
          };

          const byName = networkContainers.get(netName) || [];
          byName.push(entry);
          networkContainers.set(netName, byName);

          const netId = (netInfo as { NetworkID?: string }).NetworkID;
          if (netId) {
            const byId = networkContainers.get(netId) || [];
            byId.push(entry);
            networkContainers.set(netId, byId);
          }
        }
      }

      const networks: NetworkSummary[] = list.map((net) => {
        const fromContainers = net.Containers
          ? Object.entries(net.Containers).map(([cid, info]) => ({
              id: cid,
              name: info.Name,
              ipv4: info.IPv4Address,
            }))
          : [];
        const fromContainerList = [
          ...(networkContainers.get(net.Id) || []),
          ...(networkContainers.get(net.Name) || []),
        ];
        const inUseBy = Array.from(
          new Map([...fromContainers, ...fromContainerList].map((u) => [u.id, u])).values(),
        );

        return {
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
          inUseBy,
        };
      });

      return networks;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao listar redes do Docker: ${msg}` });
    }
  });

  // GET /api/networks/:id/inspect
  fastify.get<{ Params: { id: string } }>("/networks/:id/inspect", async (request, reply) => {
    try {
      const net = docker.getNetwork(request.params.id);
      const data = await net.inspect();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(404).send({ error: `Rede não encontrada: ${msg}` });
    }
  });

  // POST /api/networks - Create network
  fastify.post("/networks", { preHandler: [requireRole("operator", "admin")] }, async (request, reply) => {
    const parsed = createNetworkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Dados de requisição inválidos",
        issues: parsed.error.issues,
      });
    }

    const { name, driver, subnet, gateway, internal, attachable, labels } = parsed.data;

    try {
      const ipamConfig: Array<{ Subnet?: string; Gateway?: string }> = [];
      if (subnet) {
        ipamConfig.push({
          Subnet: subnet,
          ...(gateway ? { Gateway: gateway } : {}),
        });
      }

      const network = await docker.createNetwork({
        Name: name,
        Driver: driver,
        Internal: internal,
        Attachable: attachable,
        Labels: labels,
        ...(ipamConfig.length > 0 ? { IPAM: { Driver: "default", Config: ipamConfig } } : {}),
      });

      logAudit({
        userId: request.user?.id,
        action: "network.create",
        target: name,
        details: { id: network.id, driver, subnet, gateway },
        ip: request.ip,
      });

      return reply.status(201).send({ id: network.id, name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao criar rede: ${msg}` });
    }
  });

  // DELETE /api/networks/:id
  fastify.delete<{ Params: { id: string } }>(
    "/networks/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id } = request.params;

      try {
        const net = docker.getNetwork(id);
        const inspect = await net.inspect();

        if (BUILTIN_NETWORKS.has(inspect.Name.toLowerCase())) {
          return reply
            .status(400)
            .send({ error: `Não é permitido remover a rede padrão '${inspect.Name}'.` });
        }

        await net.remove();

        logAudit({
          userId: request.user?.id,
          action: "network.remove",
          target: inspect.Name,
          details: { id },
          ip: request.ip,
        });

        return { success: true, name: inspect.Name };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao remover rede: ${msg}` });
      }
    },
  );

  // POST /api/networks/:id/connect
  fastify.post<{ Params: { id: string } }>(
    "/networks/:id/connect",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = connectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados de requisição inválidos",
          issues: parsed.error.issues,
        });
      }

      const { container, ipv4Address, ipv6Address } = parsed.data;

      try {
        const net = docker.getNetwork(request.params.id);
        await net.connect({
          Container: container,
          EndpointConfig:
            ipv4Address || ipv6Address
              ? {
                  IPAMConfig: {
                    ...(ipv4Address ? { IPv4Address: ipv4Address } : {}),
                    ...(ipv6Address ? { IPv6Address: ipv6Address } : {}),
                  },
                }
              : undefined,
        });

        logAudit({
          userId: request.user?.id,
          action: "network.connect",
          target: request.params.id,
          details: { container, ipv4Address, ipv6Address },
          ip: request.ip,
        });

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao conectar container à rede: ${msg}` });
      }
    },
  );

  // POST /api/networks/:id/disconnect
  fastify.post<{ Params: { id: string } }>(
    "/networks/:id/disconnect",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const parsed = disconnectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Dados de requisição inválidos",
          issues: parsed.error.issues,
        });
      }

      const { container, force } = parsed.data;

      try {
        const net = docker.getNetwork(request.params.id);
        await net.disconnect({
          Container: container,
          Force: force,
        });

        logAudit({
          userId: request.user?.id,
          action: "network.disconnect",
          target: request.params.id,
          details: { container, force },
          ip: request.ip,
        });

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao desconectar container da rede: ${msg}` });
      }
    },
  );
};
