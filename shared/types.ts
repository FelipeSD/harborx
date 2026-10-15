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

export type ContainerAction =
  "start" | "stop" | "restart" | "kill" | "pause" | "unpause" | "remove";

export interface CreateContainerRequest {
  name: string;
  image: string;
  env?: Array<{ key: string; value: string }> | undefined;
  ports?:
    | Array<{
        hostPort?: number | undefined;
        containerPort: number;
        protocol?: "tcp" | "udp" | undefined;
      }>
    | undefined;
  volumes?: Array<{ source: string; target: string; mode?: "ro" | "rw" | undefined }> | undefined;
  network?: string | undefined;
  restartPolicy?: "no" | "always" | "unless-stopped" | "on-failure" | undefined;
  cpuLimit?: number | undefined;
  memoryLimitMb?: number | undefined;
  cmd?: string | string[] | undefined;
  labels?: Record<string, string> | undefined;
  start?: boolean | undefined;
}

export interface BatchContainerActionRequest {
  ids: string[];
  action: ContainerAction;
  force?: boolean | undefined;
  volumes?: boolean | undefined;
}

export interface BatchActionResult {
  results: Array<{
    id: string;
    success: boolean;
    error?: string | undefined;
  }>;
}

export interface RenameContainerRequest {
  name: string;
}

export interface LogLine {
  s: "out" | "err";
  ts: string;
  m: string;
}

export type LogWsMessage =
  | { t: "batch"; lines: LogLine[] }
  | { t: "dropped"; n: number }
  | { t: "end" }
  | { t: "error"; m: string };
