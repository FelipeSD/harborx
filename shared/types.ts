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
  inUseBy?: Array<{ id: string; name: string; state?: string }>;
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
  inUseBy?: Array<{ id: string; name: string; ipv4?: string }>;
}

export interface BuildCachePruneResponse {
  success: boolean;
  cachesDeleted: string[];
  spaceReclaimed: number;
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
  inUseBy?: Array<{ id: string; name: string }>;
}

export interface RegistrySummary {
  id: string;
  name: string;
  url: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRegistryRequest {
  name: string;
  url: string;
  username: string;
  secret: string;
}

export interface TestRegistryRequest {
  url: string;
  username: string;
  secret: string;
}

export interface TestRegistryResponse {
  success: boolean;
  status?: string;
  error?: string;
}

export interface CreateNetworkRequest {
  name: string;
  driver?: "bridge" | "overlay" | "macvlan" | "ipvlan";
  subnet?: string;
  gateway?: string;
  internal?: boolean;
  attachable?: boolean;
  labels?: Record<string, string>;
}

export interface CreateVolumeRequest {
  name?: string;
  driver?: string;
  driverOpts?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface ImagePullProgress {
  status?: string;
  id?: string;
  progressDetail?: {
    current?: number;
    total?: number;
  };
  progress?: string;
  error?: string;
  success?: boolean;
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

export interface HostMetricPoint {
  ts: string;
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
}

export interface SystemDfResponse {
  layersSize: number;
  images: number;
  containers: number;
  volumes: number;
  buildCache: number;
}

export interface ContainerStatsSummary {
  id: string;
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
  memPercent: number;
  rxBytes: number;
  txBytes: number;
  ioReadBytes: number;
  ioWriteBytes: number;
  pids: number;
  readAt: string;
}

export interface DockerEventItem {
  type: string;
  action: string;
  id: string;
  name: string;
  time: number;
  attributes: Record<string, string>;
}

export interface StackEnvVar {
  key: string;
  value: string;
  secret: boolean;
}

export interface StackSummary {
  id: string;
  name: string;
  type: "compose" | "git";
  status: "deployed" | "stopped" | "failed" | "deploying";
  composeYaml: string;
  env: StackEnvVar[];
  gitRepo?: string;
  gitBranch?: string;
  gitPath?: string;
  webhookToken: string;
  autoDeploy: boolean;
  createdAt: string;
  updatedAt: string;
  containersCount: number;
  runningContainersCount: number;
  containers: Array<{
    id: string;
    name: string;
    state: string;
    status: string;
    image: string;
    ports: Array<{ hostPort?: number; containerPort: number; protocol: string }>;
  }>;
  recentDeployment?: {
    id: string;
    triggeredBy: string;
    status: string;
    outputLog: string;
    createdAt: string;
  };
}

export interface CreateStackRequest {
  name: string;
  type?: "compose" | "git";
  composeYaml?: string;
  env?: StackEnvVar[];
  gitRepo?: string;
  gitBranch?: string;
  gitPath?: string;
  autoDeploy?: boolean;
  deployNow?: boolean;
}

export interface UpdateStackRequest {
  name?: string;
  type?: "compose" | "git";
  composeYaml?: string;
  env?: StackEnvVar[];
  gitRepo?: string;
  gitBranch?: string;
  gitPath?: string;
  autoDeploy?: boolean;
  redeploy?: boolean;
}

export interface WebhookItem {
  id: string;
  stackName: string;
  stackType: "compose" | "git";
  status: string;
  autoDeploy: boolean;
  webhookToken: string;
  webhookUrl: string;
  recentDeployment?: {
    id: string;
    triggeredBy: string;
    status: string;
    outputLog: string;
    createdAt: string;
  };
}

export interface R2BackupSettings {
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  resticPassword?: string;
  hasSecretKey?: boolean;
  hasResticPassword?: boolean;
  intervalSeconds?: number;
  keepDaily?: number;
  keepWeekly?: number;
  keepMonthly?: number;
}
