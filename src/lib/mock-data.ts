export type Status = "running" | "stopped" | "updating" | "error";

export interface Host {
  id: string;
  name: string;
  ip: string;
  os: string;
  cpu: number;
  mem: number;
  disk: number;
  containers: number;
  online: boolean;
  docker: string;
}
export interface Container {
  id: string;
  name: string;
  image: string;
  tag: string;
  host: string;
  status: Status;
  cpu: number;
  mem: string;
  ports: string;
  uptime: string;
  source: "dockerhub" | "ghcr";
  updateAvailable: boolean;
  repo?: string;
}
export interface Repo {
  id: string;
  name: string;
  branch: string;
  lastCommit: string;
  author: string;
  ago: string;
  autoDeploy: boolean;
  stack: string;
  containers: number;
  status: "synced" | "behind" | "deploying";
}
export interface ImageItem {
  id: string;
  repo: string;
  tag: string;
  size: string;
  created: string;
  source: "dockerhub" | "ghcr";
  inUse: number;
  latest: boolean;
}

export const hosts: Host[] = [
  {
    id: "h1",
    name: "vm-prod-01",
    ip: "10.0.1.12",
    os: "Ubuntu 24.04",
    cpu: 62,
    mem: 71,
    disk: 48,
    containers: 14,
    online: true,
    docker: "27.3.1",
  },
  {
    id: "h2",
    name: "vm-prod-02",
    ip: "10.0.1.13",
    os: "Ubuntu 24.04",
    cpu: 38,
    mem: 54,
    disk: 61,
    containers: 11,
    online: true,
    docker: "27.3.1",
  },
  {
    id: "h3",
    name: "vm-staging",
    ip: "10.0.2.20",
    os: "Debian 12",
    cpu: 17,
    mem: 33,
    disk: 29,
    containers: 8,
    online: true,
    docker: "26.1.4",
  },
  {
    id: "h4",
    name: "vm-edge-sp",
    ip: "177.12.40.8",
    os: "Rocky 9",
    cpu: 0,
    mem: 0,
    disk: 72,
    containers: 5,
    online: false,
    docker: "25.0.3",
  },
];

export const containers: Container[] = [
  {
    id: "a1f3",
    name: "api-gateway",
    image: "ghcr.io/acme/gateway",
    tag: "v2.4.1",
    host: "vm-prod-01",
    status: "running",
    cpu: 12.4,
    mem: "312 MB",
    ports: "443→8443",
    uptime: "12d 4h",
    source: "ghcr",
    updateAvailable: true,
    repo: "acme/gateway",
  },
  {
    id: "b7c2",
    name: "postgres",
    image: "postgres",
    tag: "16-alpine",
    host: "vm-prod-01",
    status: "running",
    cpu: 8.1,
    mem: "1.2 GB",
    ports: "5432",
    uptime: "41d 2h",
    source: "dockerhub",
    updateAvailable: false,
  },
  {
    id: "c9d0",
    name: "redis",
    image: "redis",
    tag: "7.4",
    host: "vm-prod-02",
    status: "running",
    cpu: 1.2,
    mem: "86 MB",
    ports: "6379",
    uptime: "41d 2h",
    source: "dockerhub",
    updateAvailable: true,
  },
  {
    id: "d2e8",
    name: "web-frontend",
    image: "ghcr.io/acme/web",
    tag: "main-8f2a1c",
    host: "vm-prod-02",
    status: "updating",
    cpu: 0,
    mem: "—",
    ports: "80→3000",
    uptime: "—",
    source: "ghcr",
    updateAvailable: false,
    repo: "acme/web",
  },
  {
    id: "e4f1",
    name: "worker-queue",
    image: "ghcr.io/acme/worker",
    tag: "v1.9.0",
    host: "vm-prod-01",
    status: "running",
    cpu: 34.7,
    mem: "540 MB",
    ports: "—",
    uptime: "3d 7h",
    source: "ghcr",
    updateAvailable: false,
    repo: "acme/worker",
  },
  {
    id: "f6a3",
    name: "nginx-proxy",
    image: "nginx",
    tag: "1.27",
    host: "vm-staging",
    status: "running",
    cpu: 0.4,
    mem: "24 MB",
    ports: "80, 443",
    uptime: "9d 1h",
    source: "dockerhub",
    updateAvailable: true,
  },
  {
    id: "g8b5",
    name: "grafana",
    image: "grafana/grafana",
    tag: "11.2.0",
    host: "vm-staging",
    status: "stopped",
    cpu: 0,
    mem: "—",
    ports: "3000",
    uptime: "—",
    source: "dockerhub",
    updateAvailable: false,
  },
  {
    id: "h1c7",
    name: "edge-cache",
    image: "varnish",
    tag: "7.5",
    host: "vm-edge-sp",
    status: "error",
    cpu: 0,
    mem: "—",
    ports: "6081",
    uptime: "—",
    source: "dockerhub",
    updateAvailable: false,
  },
];

export const repos: Repo[] = [
  {
    id: "r1",
    name: "acme/gateway",
    branch: "main",
    lastCommit: "feat: rate limit por tenant",
    author: "felipe",
    ago: "há 14 min",
    autoDeploy: true,
    stack: "docker-compose.prod.yml",
    containers: 2,
    status: "behind",
  },
  {
    id: "r2",
    name: "acme/web",
    branch: "main",
    lastCommit: "fix: hydration no checkout",
    author: "ana",
    ago: "há 2 min",
    autoDeploy: true,
    stack: "compose.yml",
    containers: 3,
    status: "deploying",
  },
  {
    id: "r3",
    name: "acme/worker",
    branch: "release",
    lastCommit: "chore: bump deps",
    author: "bruno",
    ago: "há 3 h",
    autoDeploy: false,
    stack: "stack.yml",
    containers: 4,
    status: "synced",
  },
  {
    id: "r4",
    name: "acme/infra-monitoring",
    branch: "main",
    lastCommit: "add loki datasource",
    author: "felipe",
    ago: "ontem",
    autoDeploy: false,
    stack: "monitoring/compose.yml",
    containers: 3,
    status: "synced",
  },
];

export const images: ImageItem[] = [
  {
    id: "sha256:9f1a",
    repo: "ghcr.io/acme/gateway",
    tag: "v2.4.1",
    size: "84 MB",
    created: "há 12 dias",
    source: "ghcr",
    inUse: 2,
    latest: false,
  },
  {
    id: "sha256:3b7e",
    repo: "ghcr.io/acme/web",
    tag: "main-8f2a1c",
    size: "142 MB",
    created: "há 2 min",
    source: "ghcr",
    inUse: 1,
    latest: true,
  },
  {
    id: "sha256:c41d",
    repo: "postgres",
    tag: "16-alpine",
    size: "238 MB",
    created: "há 41 dias",
    source: "dockerhub",
    inUse: 1,
    latest: true,
  },
  {
    id: "sha256:7aa0",
    repo: "redis",
    tag: "7.4",
    size: "117 MB",
    created: "há 41 dias",
    source: "dockerhub",
    inUse: 1,
    latest: false,
  },
  {
    id: "sha256:e02f",
    repo: "nginx",
    tag: "1.27",
    size: "188 MB",
    created: "há 9 dias",
    source: "dockerhub",
    inUse: 1,
    latest: false,
  },
  {
    id: "sha256:1d9c",
    repo: "grafana/grafana",
    tag: "11.2.0",
    size: "412 MB",
    created: "há 20 dias",
    source: "dockerhub",
    inUse: 0,
    latest: false,
  },
];

export const activity = [
  { t: "10:02", msg: "web-frontend: pull ghcr.io/acme/web:main-8f2a1c", kind: "info" },
  { t: "09:58", msg: "Push em acme/web → deploy automático iniciado", kind: "info" },
  { t: "09:41", msg: "Nova versão disponível: redis 7.4.1", kind: "warn" },
  { t: "09:12", msg: "edge-cache saiu com código 137 (OOM)", kind: "error" },
  { t: "08:30", msg: "worker-queue atualizado para v1.9.0", kind: "ok" },
] as const;

export const cpuSeries = Array.from({ length: 24 }, (_, i) => ({
  h: `${i}h`,
  cpu: Math.round(30 + 25 * Math.sin(i / 3) + (i % 5) * 3),
  mem: Math.round(50 + 12 * Math.cos(i / 4) + (i % 3) * 2),
}));

export interface Network {
  id: string;
  name: string;
  driver: "bridge" | "overlay" | "host" | "macvlan";
  subnet: string;
  gateway: string;
  host: string;
  containers: number;
  internal: boolean;
}
export const networks: Network[] = [
  {
    id: "n1a2",
    name: "bridge",
    driver: "bridge",
    subnet: "172.17.0.0/16",
    gateway: "172.17.0.1",
    host: "vm-prod-01",
    containers: 3,
    internal: false,
  },
  {
    id: "n3b4",
    name: "acme_backend",
    driver: "bridge",
    subnet: "172.20.0.0/24",
    gateway: "172.20.0.1",
    host: "vm-prod-01",
    containers: 4,
    internal: true,
  },
  {
    id: "n5c6",
    name: "acme_public",
    driver: "overlay",
    subnet: "10.10.0.0/24",
    gateway: "10.10.0.1",
    host: "vm-prod-02",
    containers: 2,
    internal: false,
  },
  {
    id: "n7d8",
    name: "monitoring",
    driver: "bridge",
    subnet: "172.22.0.0/24",
    gateway: "172.22.0.1",
    host: "vm-staging",
    containers: 3,
    internal: false,
  },
  {
    id: "n9e0",
    name: "host",
    driver: "host",
    subnet: "—",
    gateway: "—",
    host: "vm-edge-sp",
    containers: 1,
    internal: false,
  },
];

export interface Volume {
  id: string;
  name: string;
  driver: string;
  size: string;
  host: string;
  mount: string;
  usedBy: string[];
}
export const volumes: Volume[] = [
  {
    id: "v1",
    name: "pg_data",
    driver: "local",
    size: "8.4 GB",
    host: "vm-prod-01",
    mount: "/var/lib/docker/volumes/pg_data/_data",
    usedBy: ["postgres"],
  },
  {
    id: "v2",
    name: "redis_data",
    driver: "local",
    size: "312 MB",
    host: "vm-prod-02",
    mount: "/var/lib/docker/volumes/redis_data/_data",
    usedBy: ["redis"],
  },
  {
    id: "v3",
    name: "grafana_storage",
    driver: "local",
    size: "96 MB",
    host: "vm-staging",
    mount: "/var/lib/docker/volumes/grafana_storage/_data",
    usedBy: ["grafana"],
  },
  {
    id: "v4",
    name: "nginx_certs",
    driver: "local",
    size: "2 MB",
    host: "vm-staging",
    mount: "/var/lib/docker/volumes/nginx_certs/_data",
    usedBy: ["nginx-proxy"],
  },
  {
    id: "v5",
    name: "old_uploads",
    driver: "local",
    size: "1.9 GB",
    host: "vm-prod-01",
    mount: "/var/lib/docker/volumes/old_uploads/_data",
    usedBy: [],
  },
];

export interface Webhook {
  id: string;
  repo: string;
  workflow: string;
  branch: string;
  targets: string[];
  enabled: boolean;
  lastRun: string;
  lastStatus: "success" | "failed" | "never";
  token: string;
}
export const webhooks: Webhook[] = [
  {
    id: "wh_8f2a",
    repo: "acme/web",
    workflow: "build-and-push.yml",
    branch: "main",
    targets: ["web-frontend"],
    enabled: true,
    lastRun: "há 2 min",
    lastStatus: "success",
    token: "whk_3f9a…c21",
  },
  {
    id: "wh_1c7d",
    repo: "acme/gateway",
    workflow: "release.yml",
    branch: "main",
    targets: ["api-gateway"],
    enabled: true,
    lastRun: "há 12 dias",
    lastStatus: "success",
    token: "whk_77be…0a4",
  },
  {
    id: "wh_4e90",
    repo: "acme/worker",
    workflow: "docker.yml",
    branch: "release",
    targets: ["worker-queue"],
    enabled: false,
    lastRun: "há 3 dias",
    lastStatus: "failed",
    token: "whk_a01c…9d2",
  },
];
export const webhookEvents = [
  {
    t: "10:02:14",
    repo: "acme/web",
    run: "#482",
    result: "Redeploy de web-frontend concluído",
    ok: true,
  },
  {
    t: "09:58:40",
    repo: "acme/web",
    run: "#482",
    result: "workflow_run completed · success → pull iniciado",
    ok: true,
  },
  {
    t: "ontem",
    repo: "acme/worker",
    run: "#131",
    result: "Assinatura inválida — ignorado",
    ok: false,
  },
];
