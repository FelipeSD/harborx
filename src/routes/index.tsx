import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Boxes,
  Layers,
  Cpu,
  HardDrive,
  RefreshCw,
  AlertCircle,
  Activity as ActivityIcon,
  Radio,
  Clock,
  Server,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useDockerEvents } from "@/hooks/use-docker-events";
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
  const { events: liveEvents, isConnected: isEventsConnected } = useDockerEvents();

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

  const { data: hostMetricsData } = useQuery({
    queryKey: ["host-metrics"],
    queryFn: () => api.system.hostMetrics(24),
    refetchInterval: 30000,
  });

  const { data: dfData } = useQuery({
    queryKey: ["system-df"],
    queryFn: api.system.df,
    refetchInterval: 60000,
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
      sub: dfData ? `Uso total: ${formatBytes(dfData.layersSize)}` : "Armazenadas localmente",
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

  // Map host metrics history for chart
  const chartPoints = (hostMetricsData?.points || []).map((pt) => {
    const timeStr = new Date(pt.ts).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const memPercent = pt.memTotalMb > 0 ? Math.round((pt.memUsedMb / pt.memTotalMb) * 100) : 0;
    return {
      h: timeStr,
      cpu: pt.cpuPercent,
      mem: memPercent,
      memUsedMb: pt.memUsedMb,
    };
  });

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
            aria-label="Atualizar dados de visão geral"
          >
            <RefreshCw className={cn("size-4 mr-1.5", isFetching && "animate-spin")} />
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

      {/* Top 4 Stats Panels */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Panel
            key={s.label}
            className={cn("p-4 sm:p-5", s.hl && "border-primary/40 glow-primary")}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {s.label}
              <s.icon className={cn("size-4 shrink-0", s.hl && "text-primary")} />
            </div>
            {isSystemLoading ? (
              <Skeleton className="mt-3 h-9 w-20" />
            ) : (
              <p className="mt-2 sm:mt-3 font-mono text-2xl sm:text-3xl font-semibold truncate">
                {s.value}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground truncate">{s.sub}</p>
          </Panel>
        ))}
      </div>

      {/* Charts & Live Events */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Real Historical Chart */}
        <Panel className="p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-medium">Utilização do Host (Últimas 24h)</h2>
              <p className="text-xs text-muted-foreground">
                Consumo real de CPU e memória RAM amostrados a cada minuto
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-500" />
                CPU (%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-purple-500" />
                Memória (%)
              </span>
            </div>
          </div>
          <div className="h-56">
            {chartPoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs space-y-1">
                <ActivityIcon className="size-5 text-zinc-600 animate-pulse" />
                <span>Coletando métricas do host... aguarde o primeiro ciclo.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartPoints}>
                  <defs>
                    <linearGradient id="cpuGradientHost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#06b6d4" stopOpacity={0.35} />
                      <stop offset="1" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="memGradientHost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#a855f7" stopOpacity={0.25} />
                      <stop offset="1" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="h"
                    stroke="#71717a"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#71717a"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                    }}
                    formatter={(val: unknown, name: unknown) => [
                      `${String(val)}%`,
                      String(name) === "cpu" ? "CPU" : "Memória",
                    ]}
                  />
                  <Area
                    dataKey="mem"
                    stroke="#a855f7"
                    fill="url(#memGradientHost)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Area
                    dataKey="cpu"
                    stroke="#06b6d4"
                    fill="url(#cpuGradientHost)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* Live Docker Events Feed */}
        <Panel className="p-4 sm:p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-medium flex items-center gap-2 text-sm sm:text-base">
              <Radio
                className={cn(
                  "size-3.5 shrink-0",
                  isEventsConnected ? "text-emerald-400 animate-pulse" : "text-zinc-600",
                )}
              />
              <span className="truncate">Atividade em Tempo Real</span>
            </h2>
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              {isEventsConnected ? "Ao vivo" : "Conectando..."}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[220px] space-y-2.5 pr-1">
            {liveEvents.length > 0 ? (
              liveEvents.slice(0, 10).map((evt, idx) => {
                const timeStr = new Date(evt.time * 1000).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                const isDieOrKill =
                  evt.action === "die" || evt.action === "kill" || evt.action === "destroy";
                const isStart = evt.action === "start" || evt.action === "restart";

                return (
                  <div
                    key={`${evt.id}-${evt.time}-${idx}`}
                    className="flex items-start gap-2.5 text-xs min-w-0"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {timeStr}
                    </span>
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full mt-1.5",
                        isDieOrKill ? "bg-red-500" : isStart ? "bg-emerald-500" : "bg-cyan-500",
                      )}
                    />
                    <div className="flex-1 min-w-0 truncate">
                      <span className="font-semibold text-foreground uppercase text-[10px] mr-1">
                        [{evt.type}]
                      </span>
                      <span className="font-medium capitalize text-cyan-400 mr-1.5">
                        {evt.action}
                      </span>
                      <span className="text-muted-foreground truncate" title={evt.name || evt.id}>
                        {evt.name || evt.id.slice(0, 12)}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs py-8 space-y-2">
                <Clock className="size-5 text-zinc-600" />
                <p className="text-center">Aguardando eventos do daemon Docker...</p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Recent Containers & Host Specs */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Containers mais recentes</h2>
            <Link to="/containers" className="text-xs text-primary hover:underline">
              Ver todos ({containers.length})
            </Link>
          </div>
          <div className="space-y-3">
            {containers.slice(0, 5).map((c) => (
              <Link
                to="/containers"
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface/60 px-3 py-2 text-sm hover:border-primary/40 hover:bg-surface transition-all group"
                aria-label={`Ver container ${c.name}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate group-hover:text-primary transition-colors">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground truncate" title={c.image}>
                    {c.image}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      c.state === "running" ? "bg-emerald-500 pulse-dot" : "bg-muted-foreground",
                    )}
                  />
                  <span className="text-xs font-mono capitalize">{c.state}</span>
                </div>
              </Link>
            ))}
            {containers.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum container ativo no momento.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Informações da Máquina Host</h2>
            <Link to="/hosts" className="text-xs text-primary hover:underline">
              Detalhes
            </Link>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Nome do Host</dt>
              <dd className="mt-1 font-mono font-medium truncate">
                {isSystemLoading ? <Skeleton className="h-4 w-28" /> : (system?.name || "Docker Host")}
              </dd>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Versão do Docker</dt>
              <dd className="mt-1 font-mono font-medium truncate">
                {isSystemLoading ? <Skeleton className="h-4 w-20" /> : (system?.serverVersion || "—")}
              </dd>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Sistema Operacional</dt>
              <dd className="mt-1 font-mono font-medium truncate">
                {isSystemLoading ? <Skeleton className="h-4 w-24" /> : (system?.operatingSystem || "Linux")}
              </dd>
            </div>
            <div className="rounded-lg border bg-surface p-3">
              <dt className="text-muted-foreground">Diretório Raiz</dt>
              <dd className="mt-1 font-mono font-medium truncate" title={system?.dockerRootDir}>
                {isSystemLoading ? <Skeleton className="h-4 w-32" /> : (system?.dockerRootDir || "/var/lib/docker")}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
