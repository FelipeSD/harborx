import type {
  BatchActionResult,
  BatchContainerActionRequest,
  ContainerAction,
  ContainerSummary,
  CreateContainerRequest,
  ImageSummary,
  LogLine,
  NetworkSummary,
  RenameContainerRequest,
  SetupStatusResponse,
  SystemInfo,
  User,
  VolumeSummary,
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

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
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
    const errorMsg =
      (isJson && data && typeof data === "object" && "error" in data
        ? (data as { error: string }).error
        : typeof data === "string" && data.length > 0
          ? data
          : `Erro na requisição HTTP (${response.status})`) || "Erro inesperado";

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
  },

  networks: {
    list: () => fetchApi<NetworkSummary[]>("/api/networks"),
  },

  volumes: {
    list: () => fetchApi<VolumeSummary[]>("/api/volumes"),
  },

  system: {
    info: () => fetchApi<SystemInfo>("/api/system/info"),
  },
};
