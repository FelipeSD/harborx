import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Cpu,
  HardDrive,
  Layers,
  Radio,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContainerStatsSummary } from "../../../shared/types.js";
import { WebSocketClient, type WsStatus } from "../../lib/ws.js";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Progress } from "../ui/progress.js";

const MAX_CHART_POINTS = 30;

interface ContainerStatsViewerProps {
  containerId: string;
  containerName?: string;
  containerState?: string;
  className?: string;
}

interface MetricHistoryPoint {
  time: string;
  cpu: number;
  memMb: number;
  memPercent: number;
  rxKb: number;
  txKb: number;
}

export function ContainerStatsViewer({
  containerId,
  containerName,
  containerState = "running",
  className = "",
}: ContainerStatsViewerProps) {
  const isRunning = containerState === "running";
  const [currentStats, setCurrentStats] = useState<ContainerStatsSummary | null>(null);
  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);
  const [status, setStatus] = useState<WsStatus>("connecting");

  const lastNetRxRef = useRef<number | null>(null);
  const lastNetTxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    let active = true;

    const client = new WebSocketClient<ContainerStatsSummary>({
      url: `/ws/containers/${containerId}/stats`,
      onStatusChange: (newStatus) => {
        if (active) setStatus(newStatus);
      },
      onMessage: (stats) => {
        if (!active || typeof stats.cpuPercent !== "number") return;

        setCurrentStats(stats);

        const timeStr = new Date(stats.readAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        // Calculate rate if previous value exists
        let rxDeltaKb = 0;
        let txDeltaKb = 0;
        if (lastNetRxRef.current !== null && stats.rxBytes >= lastNetRxRef.current) {
          rxDeltaKb = Math.round((stats.rxBytes - lastNetRxRef.current) / 1024);
        }
        if (lastNetTxRef.current !== null && stats.txBytes >= lastNetTxRef.current) {
          txDeltaKb = Math.round((stats.txBytes - lastNetTxRef.current) / 1024);
        }
        lastNetRxRef.current = stats.rxBytes;
        lastNetTxRef.current = stats.txBytes;

        const point: MetricHistoryPoint = {
          time: timeStr,
          cpu: stats.cpuPercent,
          memMb: Math.round(stats.memUsedBytes / (1024 * 1024)),
          memPercent: stats.memPercent,
          rxKb: rxDeltaKb,
          txKb: txDeltaKb,
        };

        setHistory((prev) => [...prev.slice(-MAX_CHART_POINTS + 1), point]);
      },
    });

    client.connect();

    return () => {
      active = false;
      client.disconnect();
    };
  }, [containerId, isRunning]);

  if (!isRunning) {
    return (
      <div className={`p-6 rounded-lg border bg-zinc-950 text-zinc-100 ${className}`}>
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertCircle className="size-4 text-amber-500" />
          <AlertTitle>Container Parado</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            As métricas em tempo real só são coletadas enquanto o container estiver em execução.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const memLimitMb = currentStats ? Math.round(currentStats.memLimitBytes / (1024 * 1024)) : 0;
  const memUsedMb = currentStats ? Math.round(currentStats.memUsedBytes / (1024 * 1024)) : 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Status Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              status === "connected"
                ? "bg-emerald-500 animate-pulse"
                : status === "reconnecting"
                  ? "bg-amber-500 animate-ping"
                  : "bg-zinc-600"
            }`}
          />
          <span>
            {status === "connected"
              ? "Stream de métricas ativo (1Hz)"
              : status === "reconnecting"
                ? "Reconectando..."
                : "Conectando ao daemon..."}
          </span>
        </div>
        <div>
          <span>PIDs em execução: </span>
          <strong className="text-foreground">{currentStats?.pids ?? "--"}</strong>
        </div>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* CPU Card */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Cpu className="size-3.5 text-cyan-400" />
              Uso de CPU
            </span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {currentStats ? `${currentStats.cpuPercent}%` : "--"}
            </span>
          </div>
          <Progress
            value={currentStats ? Math.min(100, currentStats.cpuPercent) : 0}
            className="h-1.5 bg-zinc-800"
          />
        </div>

        {/* Memory Card */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <HardDrive className="size-3.5 text-purple-400" />
              Memória RAM
            </span>
            <span className="text-lg font-bold font-mono text-purple-400">
              {currentStats ? `${memUsedMb} MB` : "--"}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{currentStats ? `${currentStats.memPercent}%` : ""}</span>
            <span>Limite: {memLimitMb ? `${memLimitMb} MB` : "Sem limite"}</span>
          </div>
          <Progress
            value={currentStats ? Math.min(100, currentStats.memPercent) : 0}
            className="h-1.5 bg-zinc-800"
          />
        </div>

        {/* Network & IO Card */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Radio className="size-3.5 text-emerald-400" />
              Rede & Disco
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground text-[10px] block">RX (Download)</span>
              <span className="font-mono font-medium text-emerald-400 flex items-center gap-0.5">
                <ArrowDown className="size-3" />
                {currentStats ? `${Math.round(currentStats.rxBytes / 1024)} KB` : "--"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground text-[10px] block">TX (Upload)</span>
              <span className="font-mono font-medium text-blue-400 flex items-center gap-0.5">
                <ArrowUp className="size-3" />
                {currentStats ? `${Math.round(currentStats.txBytes / 1024)} KB` : "--"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Charts */}
      <div className="space-y-4">
        {/* CPU Chart */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <span className="text-xs font-semibold text-zinc-300">
            Histórico de CPU (%) — Últimos 30 segundos
          </span>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    fontSize: 11,
                    borderRadius: 6,
                  }}
                  formatter={(val: unknown) => [`${String(val)}%`, "CPU"]}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#06b6d4"
                  fillOpacity={1}
                  fill="url(#cpuGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory Chart */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <span className="text-xs font-semibold text-zinc-300">Histórico de Memória RAM (MB)</span>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    fontSize: 11,
                    borderRadius: 6,
                  }}
                  formatter={(val: unknown) => [`${String(val)} MB`, "Memória"]}
                />
                <Area
                  type="monotone"
                  dataKey="memMb"
                  stroke="#a855f7"
                  fillOpacity={1}
                  fill="url(#memGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
