import type {
  BatchActionResult,
  BatchContainerActionRequest,
  ContainerAction,
  ContainerStatsSummary,
  ContainerSummary,
  CreateContainerRequest,
  CreateNetworkRequest,
  CreateRegistryRequest,
  CreateStackRequest,
  CreateVolumeRequest,
  HostMetricPoint,
  ImagePullProgress,
  ImageSummary,
  LogLine,
  NetworkSummary,
  R2BackupSettings,
  RegistrySummary,
  RenameContainerRequest,
  SetupStatusResponse,
  StackSummary,
  SystemDfResponse,
  SystemInfo,
  TestRegistryRequest,
  TestRegistryResponse,
  UpdateStackRequest,
  User,
  VolumeSummary,
  WebhookItem,
} from "../../shared/types";

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function extractCleanErrorMessage(
  data: unknown,
  status: number,
  contentType: string | null,
): string {
  if (data && typeof data === "object") {
    if ("error" in data && typeof (data as { error: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
    if ("message" in data && typeof (data as { message: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
  }

  if (typeof data === "string" && data.trim().length > 0) {
    const raw = data.trim();
    const isHtml =
      Boolean(contentType && contentType.includes("text/html")) ||
      raw.startsWith("<!DOCTYPE") ||
      raw.startsWith("<html") ||
      raw.includes("<head>") ||
      raw.includes("<body");

    if (isHtml) {
      // Check for Cloudflare / Proxy status codes
      if (status === 502) {
        return "502 Bad Gateway: O proxy ou servidor reverso (Cloudflare) não conseguiu comunicar com o container do HarborX. O serviço pode estar reiniciando ou a operação demorou mais que o limite.";
      }
      if (status === 504) {
        return "504 Gateway Timeout: A operação excedeu o tempo limite do proxy reverso (Cloudflare). Verifique se o container ou build ainda está em andamento no host.";
      }
      if (status === 503) {
        return "503 Service Unavailable: O serviço está temporariamente indisponível.";
      }
      if (status === 413) {
        return "413 Payload Too Large: O payload enviado excedeu o limite permitido pelo proxy.";
      }

      // Try extracting <title> content
      const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].trim();
        return `${status} Erro: ${title}`;
      }

      // Strip HTML tags and collapse whitespace
      const stripped = raw
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (stripped.length > 0) {
        return stripped.length > 140 ? `${stripped.slice(0, 140)}…` : stripped;
      }

      return `Erro no proxy/servidor HTTP (${status})`;
    }

    return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  }

  return `Erro na requisição HTTP (${status})`;
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }
  if (!headers.has("X-HarborX-Client")) {
    headers.set("X-HarborX-Client", "web");
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMsg = extractCleanErrorMessage(data, response.status, contentType);
    throw new ApiError(response.status, errorMsg, data);
  }

  return data as T;
}

export const api = {
  auth: {
    setupStatus: () => fetchApi<SetupStatusResponse>("/api/auth/setup-status"),
    setup: (body: { username: string; password: string }) =>
      fetchApi<{ success: true; user: User }>("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: { username: string; password: string }) =>
      fetchApi<{ success: true; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    logout: () =>
      fetchApi<{ success: true }>("/api/auth/logout", {
        method: "POST",
      }),
    me: () => fetchApi<{ user: User }>("/api/auth/me"),
  },

  containers: {
    list: () => fetchApi<ContainerSummary[]>("/api/containers"),
    get: (id: string) => fetchApi<Record<string, unknown>>(`/api/containers/${id}`),
    inspect: (id: string) => fetchApi<Record<string, unknown>>(`/api/containers/${id}/inspect`),
    logs: (id: string, params?: { tail?: number; since?: number; until?: number }) => {
      const q = new URLSearchParams();
      if (params?.tail) q.set("tail", String(params.tail));
      if (params?.since) q.set("since", String(params.since));
      if (params?.until) q.set("until", String(params.until));
      const qs = q.toString() ? `?${q.toString()}` : "";
      return fetchApi<{ lines: LogLine[] }>(`/api/containers/${id}/logs${qs}`);
    },
    downloadLogsUrl: (id: string, params?: { tail?: number }) => {
      const qs = params?.tail ? `?tail=${params.tail}` : "";
      return `/api/containers/${id}/logs/download${qs}`;
    },
    stats: (id: string) => fetchApi<ContainerStatsSummary>(`/api/containers/${id}/stats`),
    create: (data: CreateContainerRequest) =>
      fetchApi<{ success: true; id: string; name: string }>("/api/containers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    action: (id: string, action: ContainerAction, params?: { timeout?: number }) => {
      const qs = params?.timeout ? `?t=${params.timeout}` : "";
      return fetchApi<{ success: true; message: string }>(`/api/containers/${id}/${action}${qs}`, {
        method: "POST",
      });
    },
    rename: (id: string, data: RenameContainerRequest) =>
      fetchApi<{ success: true; name: string }>(`/api/containers/${id}/rename`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    duplicate: (id: string, name?: string) =>
      fetchApi<{ success: true; id: string; name: string }>(`/api/containers/${id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    recreate: (id: string, options?: { pullLatest?: boolean }) =>
      fetchApi<{ success: true; id: string; name: string }>(`/api/containers/${id}/recreate`, {
        method: "POST",
        body: JSON.stringify(options || {}),
      }),
    remove: (id: string, options?: { force?: boolean; volumes?: boolean }) => {
      const params = new URLSearchParams();
      if (options?.force) params.set("force", "true");
      if (options?.volumes) params.set("volumes", "true");
      const qs = params.toString() ? `?${params.toString()}` : "";
      return fetchApi<{ success: true; message: string }>(`/api/containers/${id}${qs}`, {
        method: "DELETE",
      });
    },
    batch: (data: BatchContainerActionRequest) =>
      fetchApi<BatchActionResult>("/api/containers/batch", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  images: {
    list: () => fetchApi<ImageSummary[]>("/api/images"),
    inspect: (id: string) => fetchApi<Record<string, unknown>>(`/api/images/${id}/inspect`),
    history: (id: string) => fetchApi<Array<Record<string, unknown>>>(`/api/images/${id}/history`),
    pull: (ref: string) =>
      fetchApi<{ success: true; ref: string }>("/api/images/pull", {
        method: "POST",
        body: JSON.stringify({ ref, stream: false }),
      }),
    pullStream: async (ref: string, onEvent: (event: ImagePullProgress) => void): Promise<void> => {
      const response = await fetch("/api/images/pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-HarborX-Client": "web",
        },
        credentials: "include",
        body: JSON.stringify({ ref, stream: true }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({ error: "Erro ao baixar imagem" }))) as {
          error?: string;
        };
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Stream de resposta não disponível");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as ImagePullProgress;
              if (data.error) throw new Error(data.error);
              onEvent(data);
            } catch (e) {
              if (e instanceof Error && line.includes('"error":')) {
                throw e;
              }
            }
          }
        }
      }
    },
    remove: (id: string, force = false) => {
      const qs = force ? "?force=true" : "";
      return fetchApi<{ success: true }>(`/api/images/${id}${qs}`, {
        method: "DELETE",
      });
    },
    prune: (danglingOnly = false) =>
      fetchApi<{ success: true; imagesDeleted: unknown[]; spaceReclaimed: number }>(
        "/api/images/prune",
        {
          method: "POST",
          body: JSON.stringify({ danglingOnly }),
        },
      ),
    pruneBuildCache: () =>
      fetchApi<{ success: true; cachesDeleted: string[]; spaceReclaimed: number }>(
        "/api/images/build-cache/prune",
        {
          method: "POST",
        },
      ),
  },

  networks: {
    list: () => fetchApi<NetworkSummary[]>("/api/networks"),
    inspect: (id: string) => fetchApi<Record<string, unknown>>(`/api/networks/${id}/inspect`),
    create: (data: CreateNetworkRequest) =>
      fetchApi<{ id: string; name: string }>("/api/networks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      fetchApi<{ success: true; name: string }>(`/api/networks/${id}`, {
        method: "DELETE",
      }),
    connect: (
      id: string,
      data: { container: string; ipv4Address?: string; ipv6Address?: string },
    ) =>
      fetchApi<{ success: true }>(`/api/networks/${id}/connect`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    disconnect: (id: string, data: { container: string; force?: boolean }) =>
      fetchApi<{ success: true }>(`/api/networks/${id}/disconnect`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  volumes: {
    list: () => fetchApi<VolumeSummary[]>("/api/volumes"),
    inspect: (name: string) => fetchApi<Record<string, unknown>>(`/api/volumes/${name}/inspect`),
    create: (data: CreateVolumeRequest) =>
      fetchApi<{ name: string }>("/api/volumes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (name: string, force = false) => {
      const qs = force ? "?force=true" : "";
      return fetchApi<{ success: true; name: string }>(`/api/volumes/${name}${qs}`, {
        method: "DELETE",
      });
    },
    prune: () =>
      fetchApi<{ success: true; volumesDeleted: string[]; spaceReclaimed: number }>(
        "/api/volumes/prune",
        {
          method: "POST",
        },
      ),
  },

  registries: {
    list: () => fetchApi<RegistrySummary[]>("/api/registries"),
    create: (data: CreateRegistryRequest) =>
      fetchApi<RegistrySummary>("/api/registries", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    test: (data: TestRegistryRequest) =>
      fetchApi<TestRegistryResponse>("/api/registries/test", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      fetchApi<{ success: true }>(`/api/registries/${id}`, {
        method: "DELETE",
      }),
  },

  stacks: {
    list: () => fetchApi<StackSummary[]>("/api/stacks"),
    get: (id: string) => fetchApi<StackSummary>(`/api/stacks/${id}`),
    create: (data: CreateStackRequest) =>
      fetchApi<StackSummary>("/api/stacks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateStackRequest) =>
      fetchApi<StackSummary>(`/api/stacks/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deploy: (id: string, options?: { pull?: boolean }) =>
      fetchApi<{ success: true; output: string }>(`/api/stacks/${id}/deploy`, {
        method: "POST",
        body: JSON.stringify(options || {}),
      }),
    stop: (id: string) =>
      fetchApi<{ success: true }>(`/api/stacks/${id}/stop`, {
        method: "POST",
      }),
    start: (id: string) =>
      fetchApi<{ success: true }>(`/api/stacks/${id}/start`, {
        method: "POST",
      }),
    remove: (id: string, removeVolumes = false) => {
      const qs = removeVolumes ? "?volumes=true" : "";
      return fetchApi<{ success: true }>(`/api/stacks/${id}${qs}`, {
        method: "DELETE",
      });
    },
  },

  webhooks: {
    list: () => fetchApi<WebhookItem[]>("/api/webhooks"),
  },

  users: {
    list: () => fetchApi<User[]>("/api/users"),
    create: (data: { username: string; password: string; role: "admin" | "operator" | "viewer" }) =>
      fetchApi<User>("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: { role?: "admin" | "operator" | "viewer"; disabled?: boolean; password?: string },
    ) =>
      fetchApi<User>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      fetchApi<{ success: true }>(`/api/users/${id}`, {
        method: "DELETE",
      }),
  },

  auditLogs: {
    list: (params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      const qs = q.toString() ? `?${q.toString()}` : "";
      return fetchApi<{
        items: Array<{
          id: string;
          ts: string;
          userId: string | null;
          username?: string | null;
          action: string;
          target: string | null;
          details: unknown;
          ip: string | null;
        }>;
        total: number;
      }>(`/api/audit-logs${qs}`);
    },
  },

  system: {
    info: () => fetchApi<SystemInfo>("/api/system/info"),
    df: () => fetchApi<SystemDfResponse>("/api/system/df"),
    backupUrl: () => "/api/system/backup",
    prune: () =>
      fetchApi<{
        success: true;
        containersDeleted: number;
        imagesDeleted: number;
        networksDeleted: number;
        volumesDeleted: number;
        spaceReclaimed: number;
      }>("/api/system/prune", {
        method: "POST",
      }),
    hostMetrics: (hours?: number) => {
      const qs = hours ? `?hours=${hours}` : "";
      return fetchApi<{ points: HostMetricPoint[] }>(`/api/system/host-metrics${qs}`);
    },
    host: () =>
      fetchApi<{
        hostname: string;
        platform: string;
        release: string;
        arch: string;
        uptime: number;
        cpusCount: number;
        cpuModel: string;
        totalMem: number;
        freeMem: number;
        usedMem: number;
      }>("/api/system/host"),
  },

  settings: {
    getR2Backup: () => fetchApi<R2BackupSettings>("/api/settings/r2-backup"),
    saveR2Backup: (data: R2BackupSettings) =>
      fetchApi<{ success: true }>("/api/settings/r2-backup", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};
