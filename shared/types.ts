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

export interface ContainerBackupInfo {
  id: string;
  name: string;
  image: string;
  isDatabase: boolean;
  dbType: string | null;
  hasBackupConfigured: boolean;
  isBackupRunner?: boolean;
  backupContainer?: {
    id: string;
    name: string;
    state: string;
    image: string;
  };
}

export interface ResticSnapshot {
  id: string;
  short_id: string;
  time: string;
  parent?: string | undefined;
  tree?: string | undefined;
  paths?: string[] | undefined;
  hostname?: string | undefined;
  username?: string | undefined;
  tags?: string[] | undefined;
}

export interface ContainerBackupInspection {
  repository: string;
  dbType: string;
  dbName: string;
  dbHost: string;
  dbPort: string;
  totalSnapshots: number;
  latestSnapshot: ResticSnapshot | null;
  snapshots: ResticSnapshot[];
  isInitialized: boolean;
  error?: string | undefined;
  backupContainerId: string;
  backupContainerName: string;
}

export interface ContainerBackupRestoreRequest {
  snapshotId?: string | undefined;
  confirmText: string;
}

export interface ContainerBackupRestoreResult {
  success: boolean;
  log: string;
  message: string;
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
  inUseBy?: Array<{ id: string; name: string; ipv4?: string | undefined }> | undefined;
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
  inUseBy?: Array<{ id: string; name: string; state?: string | undefined }> | undefined;
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

export interface UpdateRegistryRequest {
  name?: string | undefined;
  url?: string | undefined;
  username?: string | undefined;
  secret?: string | undefined;
}

export interface TestRegistryRequest {
  url: string;
  username: string;
  secret?: string | undefined;
  registryId?: string | undefined;
  repoUrl?: string | undefined;
}

export interface TestRegistryResponse {
  success: boolean;
  status?: string | undefined;
  error?: string | undefined;
  warning?: string | undefined;
  scopes?: string[] | undefined;
  permissions?:
    | {
        canCloneRepos: boolean;
        canPullImages: boolean;
        provider?: string | undefined;
        account?: string | undefined;
      }
    | undefined;
}

export interface TestGitRepoRequest {
  gitRepo: string;
  gitBranch?: string | undefined;
  gitRegistryId?: string | null | undefined;
}

export interface TestGitRepoResponse {
  success: boolean;
  status?: string | undefined;
  error?: string | undefined;
  warning?: string | undefined;
}

export interface CreateNetworkRequest {
  name: string;
  driver?: "bridge" | "overlay" | "macvlan" | "ipvlan" | undefined;
  subnet?: string | undefined;
  gateway?: string | undefined;
  internal?: boolean | undefined;
  attachable?: boolean | undefined;
  labels?: Record<string, string> | undefined;
}

export interface CreateVolumeRequest {
  name?: string | undefined;
  driver?: string | undefined;
  driverOpts?: Record<string, string> | undefined;
  labels?: Record<string, string> | undefined;
}

export interface ImagePullProgress {
  status?: string | undefined;
  id?: string | undefined;
  progressDetail?:
    | {
        current?: number | undefined;
        total?: number | undefined;
      }
    | undefined;
  progress?: string | undefined;
  error?: string | undefined;
  success?: boolean | undefined;
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

export type StackFolderColor =
  | "default"
  | "amber"
  | "emerald"
  | "sky"
  | "violet"
  | "rose"
  | "orange";

export interface StackFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: StackFolderColor;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStackFolderRequest {
  name: string;
  parentId?: string | null | undefined;
  color?: StackFolderColor | undefined;
  sortOrder?: number | undefined;
}

export interface UpdateStackFolderRequest {
  name?: string | undefined;
  parentId?: string | null | undefined;
  color?: StackFolderColor | undefined;
  sortOrder?: number | undefined;
}

export interface BatchStackFolderActionResult {
  folderId: string;
  action: "start" | "stop";
  totalTargeted: number;
  results: Array<{
    stackId: string;
    stackName: string;
    success: boolean;
    error?: string | undefined;
  }>;
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
  folderId: string | null;
  composeYaml: string;
  env: StackEnvVar[];
  gitRepo?: string | undefined;
  gitBranch?: string | undefined;
  gitPath?: string | undefined;
  gitRegistryId?: string | undefined;
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
    ports: Array<{ hostPort?: number | undefined; containerPort: number; protocol: string }>;
  }>;
  recentDeployment?:
    | {
        id: string;
        triggeredBy: string;
        status: string;
        outputLog: string;
        createdAt: string;
      }
    | undefined;
}

export interface CreateStackRequest {
  name: string;
  type?: "compose" | "git" | undefined;
  folderId?: string | null | undefined;
  composeYaml?: string | undefined;
  env?: StackEnvVar[] | undefined;
  gitRepo?: string | undefined;
  gitBranch?: string | undefined;
  gitPath?: string | undefined;
  gitRegistryId?: string | null | undefined;
  autoDeploy?: boolean | undefined;
  deployNow?: boolean | undefined;
}

export interface UpdateStackRequest {
  name?: string | undefined;
  type?: "compose" | "git" | undefined;
  folderId?: string | null | undefined;
  composeYaml?: string | undefined;
  env?: StackEnvVar[] | undefined;
  gitRepo?: string | undefined;
  gitBranch?: string | undefined;
  gitPath?: string | undefined;
  gitRegistryId?: string | null | undefined;
  autoDeploy?: boolean | undefined;
  redeploy?: boolean | undefined;
  pull?: boolean | undefined;
}

export interface WebhookItem {
  id: string;
  stackName: string;
  stackType: "compose" | "git";
  folderId?: string | null | undefined;
  status: string;
  autoDeploy: boolean;
  webhookToken: string;
  webhookUrl: string;
  recentDeployment?:
    | {
        id: string;
        triggeredBy: string;
        status: string;
        outputLog: string;
        createdAt: string;
      }
    | undefined;
}

export interface R2BackupSettings {
  endpoint?: string | undefined;
  bucket?: string | undefined;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  resticPassword?: string | undefined;
  hasSecretKey?: boolean | undefined;
  hasResticPassword?: boolean | undefined;
  intervalSeconds?: number | undefined;
  keepDaily?: number | undefined;
  keepWeekly?: number | undefined;
  keepMonthly?: number | undefined;
}
