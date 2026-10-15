import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Boxes, Layers, Cpu, HardDrive, RefreshCw, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { activity, cpuSeries, hosts } from "@/lib/mock-data";
import { Meter, PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — HarborX" },
      { name: "description", content: "Painel de controle e monitoramento do Docker na sua VM." },
      { property: "og:title", content: "Visão geral — HarborX" },
    ],
  }),
  component: Overview,
});

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function Overview() {
  const { user } = useAuth();

  const {
    data: system,
    isLoading: isSystemLoading,
    isError: isSystemError,
    error: systemError,
    refetch: refetchSystem,
    isFetching,
  } = useQuery({
    queryKey: ["systemInfo"],
    queryFn: api.system.info,
    refetchInterval: 10000,
  });

  const { data: containers = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: api.containers.list,
    refetchInterval: 10000,
  });

  const runningCount =
    system?.containersRunning ?? containers.filter((c) => c.state === "running").length;
  const totalContainers = system?.containers ?? containers.length;
  const totalImages = system?.images ?? 0;
  const totalCpus = system?.cpus ?? 0;
  const totalMemory = system?.memTotal ? formatBytes(system.memTotal) : "—";

  const stats = [
    {
      label: "Containers ativos",
      value: `${runningCount}/${totalContainers}`,
      icon: Boxes,
      sub: `${system?.containersStopped ?? 0} parados`,
      hl: runningCount > 0,
    },
    {
      label: "Imagens Docker",
      value: `${totalImages}`,
      icon: Layers,
      sub: "Armazenadas localmente",
    },
    {
      label: "Núcleos de CPU",
      value: `${totalCpus} vCPU`,
      icon: Cpu,
      sub: system?.architecture || "x86_64",
    },
    {
      label: "Memória do Host",
      value: totalMemory,
      icon: HardDrive,
      sub: system?.operatingSystem || "Linux",
    },
  ];

  return (
    <>
      <PageHeader
        title={`Olá, ${user?.username || "Administrador"}`}
        subtitle={`Docker Engine ${system?.serverVersion || ""} em execução no host local`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetchSystem()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Atualizar dados
          </Button>
        }
      />

      {isSystemError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Não foi possível conectar ao Docker Engine</AlertTitle>
          <AlertDescription>
            {systemError instanceof Error
              ? systemError.message
              : "Verifique se o socket do Docker está montado em /var/run/docker.sock e tem permissões adequadas."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label} className={cn("p-5", s.hl && "border-primary/40 glow-primary")}>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {s.label}
              <s.icon className={cn("size-4", s.hl && "text-primary")} />
            </div>
            {isSystemLoading ? (
              <Skeleton className="mt-3 h-9 w-20" />
            ) : (
              <p className="mt-3 font-mono text-3xl font-semibold">{s.value}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Histórico de utilização (amostra)</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-1" />
                CPU
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-2" />
                Memória
              </span>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={cpuSeries}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--chart-2)" stopOpacity={0.25} />
                    <stop offset="1" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="h"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Area dataKey="mem" stroke="var(--chart-2)" fill="url(#g2)" strokeWidth={2} />
                <Area dataKey="cpu" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 font-medium">Atividade recente</h2>
          <ul className="space-y-3">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{a.t}</span>
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    a.kind === "error"
                      ? "bg-destructive"
                      : a.kind === "warn"
                        ? "bg-primary"
                        : a.kind === "ok"
                          ? "bg-success"
                          : "bg-info",
                  )}
                />
                <span className="text-foreground/90">{a.msg}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Containers mais recentes</h2>
            <Link to="/containers" className="text-xs text-primary hover:underline">
              Ver todos ({containers.length})
            </Link>
          </div>
          <div className="space-y-3">
            {containers.slice(0, 5).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border bg-surface px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {c.image}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      c.state === "running" ? "bg-emerald-500" : "bg-muted-foreground",
                    )}
                  />
                  <span className="text-xs font-mono capitalize">{c.state}</span>
                </div>
              </div>
            ))}
            {containers.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum container ativo no momento.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Informações da Máquina Host</h2>
            <Link to="/hosts" className="text-xs text-primary hover:underline">
              Detalhes
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Nome do Host</dt>
              <dd className="mt-1 font-mono font-medium truncate">
                {system?.name || "Docker Host"}
              </dd>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Versão do Docker</dt>
              <dd className="mt-1 font-mono font-medium">{system?.serverVersion || "—"}</dd>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Sistema Operacional</dt>
              <dd className="mt-1 font-mono font-medium truncate">
                {system?.operatingSystem || "Linux"}
              </dd>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Diretório Raiz</dt>
              <dd className="mt-1 font-mono font-medium truncate" title={system?.dockerRootDir}>
                {system?.dockerRootDir || "/var/lib/docker"}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
