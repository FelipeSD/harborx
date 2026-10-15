import type {
  ContainerSummary,
  ImageSummary,
  NetworkSummary,
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
    get: (id: string) => fetchApi<unknown>(`/api/containers/${id}`),
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
