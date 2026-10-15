export type UserRole = "admin" | "operator" | "viewer";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  disabled: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface AuthMeResponse {
  user: User;
}

export interface AuthSuccessResponse {
  success: true;
  user: User;
}

export interface AuditEntry {
  id: string;
  ts: string;
  userId: string | null;
  username?: string | null | undefined;
  action: string;
  target?: string | null | undefined;
  detailsJson?: string | null | undefined;
  ip?: string | null | undefined;
}

export interface PortMapping {
  ip?: string | undefined;
  privatePort: number;
  publicPort?: number | undefined;
  type: string;
}

export interface ContainerSummary {
  id: string;
  names: string[];
  name: string;
  image: string;
  imageId: string;
  command: string;
  created: number;
  state: "running" | "exited" | "paused" | "restarting" | "dead" | "created" | string;
  status: string;
  ports: PortMapping[];
  labels: Record<string, string>;
  stack?: string | undefined;
}

export interface ImageSummary {
  id: string;
  repoTags: string[];
  repoDigests: string[];
  created: number;
  size: number;
  containers: number;
  labels: Record<string, string>;
}

export interface NetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  attachable: boolean;
  ipam?:
    | {
        driver?: string | undefined;
        config?: Array<{ subnet?: string | undefined; gateway?: string | undefined }> | undefined;
      }
    | undefined;
  containers?:
    | Record<
        string,
        {
          name: string;
          endpointId: string;
          macAddress: string;
          ipv4Address: string;
          ipv6Address: string;
        }
      >
    | undefined;
}

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt?: string | undefined;
  labels?: Record<string, string> | undefined;
  scope: string;
  usageData?:
    | {
        size: number;
        refCount: number;
      }
    | undefined;
}

export interface SystemInfo {
  containers: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  images: number;
  serverVersion: string;
  operatingSystem: string;
  architecture: string;
  cpus: number;
  memTotal: number;
  name: string;
  dockerRootDir: string;
}
