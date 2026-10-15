import type Dockerode from "dockerode";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type {
  BatchActionResult,
  BatchContainerActionRequest,
  ContainerAction,
  ContainerSummary,
} from "../../shared/types.js";
import { requireRole } from "../auth/middleware.js";
import { docker } from "../docker.js";
import { logAudit } from "../services/audit.js";

function checkHarborXSelfProtection(
  id: string,
  inspectData?: Dockerode.ContainerInspectInfo | null,
): boolean {
  const currentHostname = process.env["HOSTNAME"] || process.env["COMPUTERNAME"];
  if (
    currentHostname &&
    currentHostname.length >= 8 &&
    id.toLowerCase().startsWith(currentHostname.toLowerCase())
  ) {
    return true;
  }
  if (inspectData) {
    const rawName = (inspectData.Name || "").replace(/^\//, "").toLowerCase();
    if (rawName === "harborx" || rawName.startsWith("harborx-")) {
      return true;
    }
    if (inspectData.Config?.Labels?.["com.harborx.app"] === "true") {
      return true;
    }
  }
  return false;
}

function maskSensitiveEnv(envList: string[] = []): string[] {
  const sensitiveRegex = /(SECRET|PASSWORD|TOKEN|KEY|AUTH|PRIVATE|CREDENTIAL)/i;
  return envList.map((entry) => {
    const eqIdx = entry.indexOf("=");
    if (eqIdx === -1) return entry;
    const key = entry.slice(0, eqIdx);
    if (sensitiveRegex.test(key)) {
      return `${key}=********`;
    }
    return entry;
  });
}

async function ensureImageExists(imageName: string): Promise<void> {
  try {
    const img = docker.getImage(imageName);
    await img.inspect();
    return;
  } catch {
    await new Promise<void>((resolve, reject) => {
      const pullTimeout = setTimeout(
        () => {
          reject(new Error(`Timeout ao baixar imagem ${imageName} após 3 minutos.`));
        },
        3 * 60 * 1000,
      );

      docker.pull(imageName, (err: unknown, stream: NodeJS.ReadableStream) => {
        if (err) {
          clearTimeout(pullTimeout);
          return reject(err);
        }
        docker.modem.followProgress(stream, (followErr: unknown) => {
          clearTimeout(pullTimeout);
          if (followErr) return reject(followErr);
          resolve();
        });
      });
    });
  }
}

const createContainerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "O nome do container é obrigatório")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/,
      "Nome inválido: use apenas letras, números, hífen, sublinhado e ponto",
    ),
  image: z.string().trim().min(1, "A imagem é obrigatória"),
  env: z.array(z.object({ key: z.string().trim().min(1), value: z.string() })).optional(),
  ports: z
    .array(
      z.object({
        hostPort: z.number().int().min(1).max(65535).optional(),
        containerPort: z.number().int().min(1).max(65535),
        protocol: z.enum(["tcp", "udp"]).default("tcp"),
      }),
    )
    .optional(),
  volumes: z
    .array(
      z.object({
        source: z.string().trim().min(1),
        target: z.string().trim().min(1),
        mode: z.enum(["ro", "rw"]).default("rw"),
      }),
    )
    .optional(),
  network: z.string().optional(),
  restartPolicy: z.enum(["no", "always", "unless-stopped", "on-failure"]).default("unless-stopped"),
  cpuLimit: z.number().positive().optional(),
  memoryLimitMb: z.number().positive().optional(),
  cmd: z.union([z.string(), z.array(z.string())]).optional(),
  labels: z.record(z.string()).optional(),
  start: z.boolean().default(true),
});

export const containerRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/containers (list)
  fastify.get("/", async (_request, reply) => {
    try {
      const list = await docker.listContainers({ all: true });
      const containers: ContainerSummary[] = list.map((c) => {
        const rawName = c.Names[0] || c.Id.slice(0, 12);
        const cleanName = rawName.replace(/^\//, "");
        const labels = c.Labels || {};
        const stack =
          labels["com.docker.compose.project"] || labels["io.portainer.stack.name"] || undefined;

        return {
          id: c.Id,
          names: c.Names.map((n) => n.replace(/^\//, "")),
          name: cleanName,
          image: c.Image,
          imageId: c.ImageID,
          command: c.Command,
          created: c.Created,
          state: c.State,
          status: c.Status,
          ports: (c.Ports || []).map((p) => ({
            ip: p.IP,
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort,
            type: p.Type,
          })),
          labels,
          stack,
        };
      });

      return containers;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao listar containers: ${msg}` });
    }
  });

  // POST /api/containers/batch (batch actions)
  fastify.post<{ Body: BatchContainerActionRequest }>(
    "/batch",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { ids, action, force, volumes } = request.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: "Nenhum container selecionado para ação em lote." });
      }

      const results: BatchActionResult["results"] = [];

      for (const id of ids) {
        try {
          const container = docker.getContainer(id);

          if (action === "stop" || action === "kill" || action === "remove") {
            const inspect = await container.inspect().catch(() => null);
            if (checkHarborXSelfProtection(id, inspect)) {
              results.push({
                id,
                success: false,
                error:
                  "Ação bloqueada: não é permitido parar ou remover o próprio container do HarborX.",
              });
              continue;
            }
          }

          if (action === "start") await container.start();
          else if (action === "stop") await container.stop({ t: 10 });
          else if (action === "restart") await container.restart({ t: 10 });
          else if (action === "kill") await container.kill();
          else if (action === "pause") await container.pause();
          else if (action === "unpause") await container.unpause();
          else if (action === "remove")
            await container.remove({ force: Boolean(force), v: Boolean(volumes) });

          logAudit({
            action: `container.batch_${action}`,
            userId: request.user?.id,
            target: id,
            ip: request.ip,
          });

          results.push({ id, success: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ id, success: false, error: msg });
        }
      }

      return { results };
    },
  );

  // POST /api/containers (create)
  fastify.post("/", { preHandler: [requireRole("operator", "admin")] }, async (request, reply) => {
    const parsed = createContainerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message || "Dados de criação do container inválidos",
      });
    }

    const data = parsed.data;

    try {
      await ensureImageExists(data.image);

      const ExposedPorts: Record<string, Record<string, never>> = {};
      const PortBindings: Record<string, Array<{ HostPort: string }>> = {};

      if (data.ports) {
        for (const p of data.ports) {
          const proto = p.protocol || "tcp";
          const portKey = `${p.containerPort}/${proto}`;
          ExposedPorts[portKey] = {};
          if (p.hostPort) {
            PortBindings[portKey] = [{ HostPort: String(p.hostPort) }];
          }
        }
      }

      const Binds: string[] = [];
      if (data.volumes) {
        for (const v of data.volumes) {
          Binds.push(`${v.source}:${v.target}:${v.mode || "rw"}`);
        }
      }

      const Env: string[] = [];
      if (data.env) {
        for (const e of data.env) {
          Env.push(`${e.key}=${e.value}`);
        }
      }

      const RestartPolicyName =
        data.restartPolicy === "unless-stopped"
          ? "unless-stopped"
          : data.restartPolicy === "always"
            ? "always"
            : data.restartPolicy === "on-failure"
              ? "on-failure"
              : "";

      const container = await docker.createContainer({
        name: data.name,
        Image: data.image,
        Env,
        ExposedPorts,
        Cmd: typeof data.cmd === "string" ? data.cmd.split(" ").filter(Boolean) : data.cmd,
        Labels: data.labels || {},
        HostConfig: {
          PortBindings,
          Binds,
          RestartPolicy: { Name: RestartPolicyName },
          Memory: data.memoryLimitMb ? Math.round(data.memoryLimitMb * 1024 * 1024) : undefined,
          NanoCpus: data.cpuLimit ? Math.round(data.cpuLimit * 1e9) : undefined,
          NetworkMode: data.network || undefined,
        },
      });

      if (data.start) {
        await container.start();
      }

      logAudit({
        action: "container.create",
        userId: request.user?.id,
        target: container.id,
        details: { name: data.name, image: data.image, start: data.start },
        ip: request.ip,
      });

      return reply.status(201).send({
        success: true,
        id: container.id,
        name: data.name,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Falha ao criar container: ${msg}` });
    }
  });

  // GET /api/containers/:id (basic details)
  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      const container = docker.getContainer(request.params.id);
      const data = await container.inspect();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.toLowerCase().includes("no such container")) {
        return reply.status(404).send({ error: "Container não encontrado" });
      }
      return reply.status(502).send({ error: `Falha ao inspecionar container: ${msg}` });
    }
  });

  // GET /api/containers/:id/inspect (detailed inspect with env masking for viewer)
  fastify.get<{ Params: { id: string } }>("/:id/inspect", async (request, reply) => {
    try {
      const container = docker.getContainer(request.params.id);
      const data = await container.inspect();

      if (request.user?.role === "viewer" && data.Config?.Env) {
        data.Config.Env = maskSensitiveEnv(data.Config.Env);
      }

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.toLowerCase().includes("no such container")) {
        return reply.status(404).send({ error: "Container não encontrado" });
      }
      return reply.status(502).send({ error: `Falha ao obter inspect do container: ${msg}` });
    }
  });

  // POST /api/containers/:id/:action (start, stop, restart, kill, pause, unpause)
  fastify.post<{ Params: { id: string; action: string }; Querystring: { t?: string } }>(
    "/:id/:action",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id, action } = request.params;
      const validActions = ["start", "stop", "restart", "kill", "pause", "unpause"];

      if (!validActions.includes(action)) {
        return reply
          .status(400)
          .send({ error: `Ação inválida: "${action}". Permitidas: ${validActions.join(", ")}` });
      }

      const container = docker.getContainer(id);
      let inspect: Dockerode.ContainerInspectInfo;
      try {
        inspect = await container.inspect();
      } catch {
        return reply.status(404).send({ error: "Container não encontrado" });
      }

      if (action === "stop" || action === "kill") {
        if (checkHarborXSelfProtection(id, inspect)) {
          return reply.status(409).send({
            error: "Não é permitido parar ou forçar encerramento do próprio container do HarborX.",
          });
        }
      }

      try {
        const timeoutSeconds = request.query.t ? parseInt(request.query.t, 10) : 10;

        if (action === "start") await container.start();
        else if (action === "stop") await container.stop({ t: timeoutSeconds });
        else if (action === "restart") await container.restart({ t: timeoutSeconds });
        else if (action === "kill") await container.kill();
        else if (action === "pause") await container.pause();
        else if (action === "unpause") await container.unpause();

        logAudit({
          action: `container.${action}`,
          userId: request.user?.id,
          target: id,
          details: { name: (inspect.Name || "").replace(/^\//, "") },
          ip: request.ip,
        });

        return { success: true, message: `Ação ${action} executada com sucesso no container.` };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Erro ao executar ${action}: ${msg}` });
      }
    },
  );

  // POST /api/containers/:id/rename
  fastify.post<{ Params: { id: string }; Body: { name: string } }>(
    "/:id/rename",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body || {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send({ error: "Informe o novo nome do container." });
      }

      const container = docker.getContainer(id);

      try {
        await container.rename({ name: name.trim() });
        logAudit({
          action: "container.rename",
          userId: request.user?.id,
          target: id,
          details: { newName: name.trim() },
          ip: request.ip,
        });
        return { success: true, name: name.trim() };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao renomear container: ${msg}` });
      }
    },
  );

  // POST /api/containers/:id/duplicate
  fastify.post<{ Params: { id: string }; Body: { name?: string } }>(
    "/:id/duplicate",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id } = request.params;
      const container = docker.getContainer(id);

      try {
        const inspect = await container.inspect();
        const baseName = (inspect.Name || "").replace(/^\//, "");
        const newName =
          request.body?.name || `${baseName}-copia-${Date.now().toString().slice(-4)}`;

        const newContainer = await docker.createContainer({
          name: newName,
          Image: inspect.Config.Image,
          Env: inspect.Config.Env || [],
          Cmd: inspect.Config.Cmd,
          Labels: inspect.Config.Labels || {},
          ExposedPorts: inspect.Config.ExposedPorts || {},
          HostConfig: inspect.HostConfig || {},
        });

        logAudit({
          action: "container.duplicate",
          userId: request.user?.id,
          target: newContainer.id,
          details: { originalId: id, newName },
          ip: request.ip,
        });

        return reply.status(201).send({ success: true, id: newContainer.id, name: newName });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao duplicar container: ${msg}` });
      }
    },
  );

  // POST /api/containers/:id/recreate
  fastify.post<{ Params: { id: string }; Body: { pullLatest?: boolean } }>(
    "/:id/recreate",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id } = request.params;
      const container = docker.getContainer(id);

      try {
        const inspect = await container.inspect();
        if (checkHarborXSelfProtection(id, inspect)) {
          return reply.status(409).send({
            error: "Não é permitido recriar o próprio container do HarborX.",
          });
        }

        const name = (inspect.Name || "").replace(/^\//, "");
        const image = inspect.Config.Image;
        const isRunning = inspect.State.Running;

        if (request.body?.pullLatest) {
          await ensureImageExists(image);
        }

        if (isRunning) {
          await container.stop({ t: 10 });
        }
        await container.remove();

        const newContainer = await docker.createContainer({
          name,
          Image: image,
          Env: inspect.Config.Env || [],
          Cmd: inspect.Config.Cmd,
          Labels: inspect.Config.Labels || {},
          ExposedPorts: inspect.Config.ExposedPorts || {},
          HostConfig: inspect.HostConfig || {},
        });

        if (isRunning) {
          await newContainer.start();
        }

        logAudit({
          action: "container.recreate",
          userId: request.user?.id,
          target: newContainer.id,
          details: { name, image, wasRunning: isRunning },
          ip: request.ip,
        });

        return { success: true, id: newContainer.id, name };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Falha ao recriar container: ${msg}` });
      }
    },
  );

  // DELETE /api/containers/:id (remove)
  fastify.delete<{ Params: { id: string }; Querystring: { force?: string; volumes?: string } }>(
    "/:id",
    { preHandler: [requireRole("operator", "admin")] },
    async (request, reply) => {
      const { id } = request.params;
      const force = request.query.force === "true" || request.query.force === "1";
      const removeVolumes = request.query.volumes === "true" || request.query.volumes === "1";

      const container = docker.getContainer(id);

      try {
        const inspect = await container.inspect();
        if (checkHarborXSelfProtection(id, inspect)) {
          return reply.status(409).send({
            error: "Não é permitido remover o próprio container do HarborX.",
          });
        }

        await container.remove({ force, v: removeVolumes });

        logAudit({
          action: "container.remove",
          userId: request.user?.id,
          target: id,
          details: { name: (inspect.Name || "").replace(/^\//, ""), force, removeVolumes },
          ip: request.ip,
        });

        return { success: true, message: "Container removido com sucesso." };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404") || msg.toLowerCase().includes("no such container")) {
          return reply.status(404).send({ error: "Container não encontrado" });
        }
        return reply.status(502).send({ error: `Falha ao remover container: ${msg}` });
      }
    },
  );
};
