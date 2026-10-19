import { useState } from "react";
import {
  Layers,
  Boxes,
  Play,
  Square,
  RotateCw,
  Terminal,
  FileText,
  Activity,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square as SquareOutline,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/app/ui-bits";
import { cn } from "@/lib/utils";
import type { ContainerAction, ContainerSummary } from "../../../shared/types";

export interface StackGroup {
  stackName: string;
  isStandalone: boolean;
  containers: ContainerSummary[];
  runningCount: number;
  stoppedCount: number;
}

interface StackBinderViewProps {
  groups: StackGroup[];
  selectedIds: string[];
  toggleSelectOne: (id: string) => void;
  onSelectContainer: (
    c: ContainerSummary,
    initialTab?: "overview" | "env" | "logs" | "console" | "stats" | "inspect",
  ) => void;
  onAction: (id: string, action: ContainerAction) => void;
  onStackAction: (containerIds: string[], action: ContainerAction) => void;
  onRemoveContainer?: (id: string) => void;
  onRecreateContainer?: (id: string) => void;
  isViewer: boolean;
  isActionPending: boolean;
  pendingAction?: { id: string; action: ContainerAction } | null;
  pendingRemoveId?: string | null;
  pendingBatchAction?: ContainerAction | null;
  formatPorts: (ports: ContainerSummary["ports"]) => string;
  formatDate: (unix: number) => string;
}

export function StackBinderView({
  groups,
  selectedIds,
  toggleSelectOne,
  onSelectContainer,
  onAction,
  onStackAction,
  onRemoveContainer,
  onRecreateContainer,
  isViewer,
  isActionPending,
  pendingAction,
  pendingRemoveId,
  pendingBatchAction,
  formatPorts,
  formatDate,
}: StackBinderViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const groupKey = group.isStandalone ? "__standalone__" : group.stackName;
        const isCollapsed = Boolean(collapsed[groupKey]);
        const groupIds = group.containers.map((c) => c.id);
        const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
        const someSelected = groupIds.some((id) => selectedIds.includes(id)) && !allSelected;

        const toggleSelectGroup = () => {
          if (allSelected) {
            groupIds.forEach((id) => {
              if (selectedIds.includes(id)) toggleSelectOne(id);
            });
          } else {
            groupIds.forEach((id) => {
              if (!selectedIds.includes(id)) toggleSelectOne(id);
            });
          }
        };

        const total = group.containers.length;
        const running = group.runningCount;
        const hasFailed = group.containers.some(
          (c) => c.state === "dead" || c.status?.toLowerCase().includes("unhealthy"),
        );

        let binderBorder = "border-border/80 bg-card/60 hover:border-primary/40";
        let binderHeaderBg = "from-surface/90 via-surface/70 to-surface/90";
        let healthBadge = null;

        if (hasFailed) {
          binderBorder =
            "border-rose-500/40 bg-rose-500/[0.02] shadow-sm shadow-rose-500/5 hover:border-rose-500/60";
          binderHeaderBg = "from-rose-500/10 via-surface/80 to-surface/90";
          healthBadge = (
            <Badge
              variant="outline"
              className="border-rose-500/40 text-rose-500 bg-rose-500/10 text-[10px] flex items-center gap-1 font-mono"
            >
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
              Falha Crítica
            </Badge>
          );
        } else if (total > 0 && running === total) {
          binderBorder =
            "border-emerald-500/40 bg-emerald-500/[0.02] shadow-sm shadow-emerald-500/5 hover:border-emerald-500/60";
          binderHeaderBg = "from-emerald-500/10 via-surface/80 to-surface/90";
          healthBadge = (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 text-[10px] flex items-center gap-1 font-mono"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              100% Operacional
            </Badge>
          );
        } else if (running > 0 && running < total) {
          binderBorder =
            "border-amber-500/40 bg-amber-500/[0.02] shadow-sm shadow-amber-500/5 hover:border-amber-500/60";
          binderHeaderBg = "from-amber-500/10 via-surface/80 to-surface/90";
          healthBadge = (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-500 bg-amber-500/10 text-[10px] flex items-center gap-1 font-mono"
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              {running}/{total} Ativos
            </Badge>
          );
        } else {
          binderBorder = "border-border/80 bg-card/60 hover:border-foreground/30";
          binderHeaderBg = "from-surface/90 via-surface/70 to-surface/90";
          healthBadge = (
            <Badge
              variant="outline"
              className="border-muted-foreground/30 text-muted-foreground bg-muted/20 text-[10px] flex items-center gap-1 font-mono"
            >
              <span className="size-1.5 rounded-full bg-muted-foreground/40" />
              Parado
            </Badge>
          );
        }

        return (
          <div
            key={groupKey}
            className={cn(
              "group relative rounded-xl border shadow-md backdrop-blur transition-all duration-200 min-w-0 max-w-full overflow-hidden",
              binderBorder,
            )}
          >
            {/* Divisória de Fichário (Pasta Tab) */}
            <div
              className={cn(
                "flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors min-w-0",
                binderHeaderBg,
              )}
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => toggleCollapse(groupKey)}
                  className="flex items-start sm:items-center gap-2 text-left focus:outline-none min-w-0 flex-1"
                  title={isCollapsed ? "Expandir pasta da stack" : "Recolher pasta da stack"}
                >
                  <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface border border-border/80 text-primary transition-transform duration-200 group-hover:scale-105 mt-0.5 sm:mt-0">
                    {isCollapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </div>

                  <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                    <div
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg border mt-0.5 sm:mt-0",
                        group.isStandalone
                          ? "bg-slate-500/10 border-slate-500/20 text-slate-400"
                          : "bg-primary/10 border-primary/30 text-primary",
                      )}
                    >
                      {group.isStandalone ? (
                        <Boxes className="size-4" />
                      ) : (
                        <Layers className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="font-semibold tracking-tight text-foreground text-sm sm:text-base truncate max-w-full">
                          {group.stackName}
                        </span>
                        <Badge
                          variant={group.isStandalone ? "secondary" : "default"}
                          className={cn(
                            "text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 shrink-0",
                            !group.isStandalone &&
                              "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20",
                          )}
                        >
                          {group.isStandalone ? "Avulso" : "Compose"}
                        </Badge>
                        {healthBadge}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                        <span>{group.containers.length} container(s)</span>
                        <span>•</span>
                        <span className="text-emerald-500 font-medium">
                          {group.runningCount} rodando
                        </span>
                        {group.stoppedCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-500 font-medium">
                              {group.stoppedCount} parado(s)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Controles da Divisória da Stack */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                {!isViewer && !group.isStandalone && (
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                      title={`Iniciar todos os containers de ${group.stackName}`}
                      onClick={() => onStackAction(groupIds, "start")}
                      disabled={isActionPending || group.runningCount === group.containers.length}
                    >
                      {isActionPending && pendingBatchAction === "start" ? (
                        <Loader2 className="mr-1 size-3 animate-spin text-emerald-500" />
                      ) : (
                        <Play className="mr-1 size-3" />
                      )}
                      {isActionPending && pendingBatchAction === "start"
                        ? "Iniciando..."
                        : "Iniciar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                      title={`Parar todos os containers de ${group.stackName}`}
                      onClick={() => onStackAction(groupIds, "stop")}
                      disabled={isActionPending || group.runningCount === 0}
                    >
                      {isActionPending && pendingBatchAction === "stop" ? (
                        <Loader2 className="mr-1 size-3 animate-spin text-amber-500" />
                      ) : (
                        <Square className="mr-1 size-3" />
                      )}
                      {isActionPending && pendingBatchAction === "stop" ? "Parando..." : "Parar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                      title={`Reiniciar todos os containers de ${group.stackName}`}
                      onClick={() => onStackAction(groupIds, "restart")}
                      disabled={isActionPending}
                    >
                      {isActionPending && pendingBatchAction === "restart" ? (
                        <Loader2 className="mr-1 size-3 animate-spin text-blue-400" />
                      ) : (
                        <RotateCw className="mr-1 size-3" />
                      )}
                      {isActionPending && pendingBatchAction === "restart"
                        ? "Reiniciando..."
                        : "Reiniciar"}
                    </Button>
                  </div>
                )}

                {!isViewer && (
                  <button
                    type="button"
                    onClick={toggleSelectGroup}
                    className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                    title={
                      allSelected ? "Desmarcar todos desta pasta" : "Selecionar todos desta pasta"
                    }
                  >
                    {allSelected ? (
                      <CheckSquare className="size-3.5 text-primary" />
                    ) : someSelected ? (
                      <CheckSquare className="size-3.5 text-muted-foreground" />
                    ) : (
                      <SquareOutline className="size-3.5" />
                    )}
                    <span>Selecionar pasta</span>
                  </button>
                )}
              </div>
            </div>

            {/* Conteúdo da Pasta (Containers do Fichário) */}
            {!isCollapsed && (
              <>
                {/* Visualização em Cartões para Mobile */}
                <div className="block md:hidden p-3 space-y-2.5">
                  {group.containers.map((c) => {
                    const isSelected = selectedIds.includes(c.id);
                    const isRunning = c.state === "running";
                    const isThisAction = pendingAction?.id === c.id;
                    const isThisRemoving = pendingRemoveId === c.id;
                    const isRowDisabled = isActionPending || isThisAction || isThisRemoving;

                    return (
                      <div
                        key={`mobile-${c.id}`}
                        className={cn(
                          "rounded-lg border border-border/50 bg-surface/50 p-3 space-y-2 transition-colors",
                          isSelected && "bg-primary/5 border-primary/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {!isViewer && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectOne(c.id)}
                              />
                            )}
                            <div className="min-w-0">
                              <button
                                onClick={() => onSelectContainer(c, "overview")}
                                className="font-medium text-sm hover:text-primary transition-colors text-left flex items-center gap-1.5 truncate"
                              >
                                <span className="truncate">{c.name}</span>
                                <ExternalLink className="size-3 shrink-0 opacity-40 hover:opacity-100" />
                              </button>
                              <p className="font-mono text-[10px] text-muted-foreground truncate">
                                {c.id.slice(0, 12)}
                              </p>
                            </div>
                          </div>
                          <StatusPill status={c.state} />
                        </div>

                        <div className="text-xs space-y-0.5 font-mono text-muted-foreground">
                          <p className="truncate" title={c.image}>
                            <span className="text-foreground/70">img:</span> {c.image}
                          </p>
                          {formatPorts(c.ports) && (
                            <p className="truncate">
                              <span className="text-foreground/70">portas:</span>{" "}
                              {formatPorts(c.ports)}
                            </p>
                          )}
                        </div>

                        {/* Ações Mobile com toque confortável */}
                        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-border/40 gap-1.5">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              onClick={() => onSelectContainer(c, "logs")}
                            >
                              <FileText className="size-3.5 mr-1" />
                              Logs
                            </Button>
                            {isRunning && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => onSelectContainer(c, "console")}
                                >
                                  <Terminal className="size-3.5 mr-1" />
                                  Exec
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => onSelectContainer(c, "stats")}
                                >
                                  <Activity className="size-3.5 mr-1" />
                                  Métricas
                                </Button>
                              </>
                            )}
                          </div>

                          {!isViewer && (
                            <div className="flex items-center gap-1">
                              {isRunning ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs text-amber-500 hover:text-amber-400"
                                  onClick={() => onAction(c.id, "stop")}
                                  disabled={isRowDisabled}
                                >
                                  {isThisAction && pendingAction?.action === "stop" ? (
                                    <Loader2 className="size-3 mr-1 animate-spin" />
                                  ) : (
                                    <Square className="size-3 mr-1" />
                                  )}
                                  {isThisAction && pendingAction?.action === "stop"
                                    ? "Parando..."
                                    : "Parar"}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs text-emerald-500 hover:text-emerald-400"
                                  onClick={() => onAction(c.id, "start")}
                                  disabled={isRowDisabled}
                                >
                                  {isThisAction && pendingAction?.action === "start" ? (
                                    <Loader2 className="size-3 mr-1 animate-spin" />
                                  ) : (
                                    <Play className="size-3 mr-1" />
                                  )}
                                  {isThisAction && pendingAction?.action === "start"
                                    ? "Iniciando..."
                                    : "Iniciar"}
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-blue-400 hover:text-blue-300"
                                onClick={() => onAction(c.id, "restart")}
                                disabled={isRowDisabled}
                                title="Reiniciar"
                              >
                                {isThisAction && pendingAction?.action === "restart" ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <RotateCw className="size-3.5" />
                                )}
                              </Button>
                              {onRecreateContainer && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                  onClick={() => onRecreateContainer(c.id)}
                                  disabled={isRowDisabled}
                                  title="Recriar container (Repull)"
                                >
                                  <RefreshCw className="size-3.5" />
                                </Button>
                              )}
                              {onRemoveContainer && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                                  onClick={() => onRemoveContainer(c.id)}
                                  disabled={isRowDisabled}
                                  title="Remover container"
                                >
                                  {isThisRemoving ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-3.5" />
                                  )}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tabela para Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/40 bg-surface/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {!isViewer && <th className="w-10 px-4 py-2.5"></th>}
                        <th className="px-4 py-2.5 font-medium">Container</th>
                        <th className="px-4 py-2.5 font-medium">Imagem</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">Portas</th>
                        <th className="px-4 py-2.5 font-medium">Criado em</th>
                        <th className="px-4 py-2.5 font-medium text-right">Ações Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {group.containers.map((c) => {
                        const isSelected = selectedIds.includes(c.id);
                        const isRunning = c.state === "running";
                        const isThisAction = pendingAction?.id === c.id;
                        const isThisRemoving = pendingRemoveId === c.id;
                        const isRowDisabled = isActionPending || isThisAction || isThisRemoving;

                        return (
                          <tr
                            key={c.id}
                            className={cn(
                              "transition-colors hover:bg-accent/40",
                              isSelected && "bg-primary/5",
                            )}
                          >
                            {!isViewer && (
                              <td className="px-4 py-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelectOne(c.id)}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => onSelectContainer(c, "overview")}
                                className="font-medium hover:text-primary transition-colors text-left flex items-center gap-1.5"
                              >
                                <span>{c.name}</span>
                                <ExternalLink className="size-3 opacity-40 hover:opacity-100" />
                              </button>
                              <p className="font-mono text-[11px] text-muted-foreground">
                                {c.id.slice(0, 12)}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="font-mono text-xs truncate max-w-[220px] block text-muted-foreground hover:text-foreground"
                                title={c.image}
                              >
                                {c.image}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusPill status={c.state} />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {formatPorts(c.ports)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {formatDate(c.created)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Botão de Logs */}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  title="Ver logs em tempo real"
                                  onClick={() => onSelectContainer(c, "logs")}
                                >
                                  <FileText className="size-3.5" />
                                </Button>

                                {/* Botão de Terminal */}
                                {isRunning && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    title="Abrir terminal interativo (exec)"
                                    onClick={() => onSelectContainer(c, "console")}
                                  >
                                    <Terminal className="size-3.5" />
                                  </Button>
                                )}

                                {/* Botão de Métricas */}
                                {isRunning && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    title="Estatísticas ao vivo"
                                    onClick={() => onSelectContainer(c, "stats")}
                                  >
                                    <Activity className="size-3.5" />
                                  </Button>
                                )}

                                {!isViewer && (
                                  <>
                                    {isRunning ? (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                                        title="Parar container"
                                        onClick={() => onAction(c.id, "stop")}
                                        disabled={isRowDisabled}
                                      >
                                        {isThisAction && pendingAction?.action === "stop" ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Square className="size-3.5" />
                                        )}
                                      </Button>
                                    ) : (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                        title="Iniciar container"
                                        onClick={() => onAction(c.id, "start")}
                                        disabled={isRowDisabled}
                                      >
                                        {isThisAction && pendingAction?.action === "start" ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Play className="size-3.5" />
                                        )}
                                      </Button>
                                    )}

                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                      title="Reiniciar container"
                                      onClick={() => onAction(c.id, "restart")}
                                      disabled={isRowDisabled}
                                    >
                                      {isThisAction && pendingAction?.action === "restart" ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      ) : (
                                        <RotateCw className="size-3.5" />
                                      )}
                                    </Button>

                                    {onRecreateContainer && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                        title="Recriar container (com opção de repull)"
                                        onClick={() => onRecreateContainer(c.id)}
                                        disabled={isRowDisabled}
                                      >
                                        <RefreshCw className="size-3.5" />
                                      </Button>
                                    )}

                                    {onRemoveContainer && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-7 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                                        title="Remover container"
                                        onClick={() => onRemoveContainer(c.id)}
                                        disabled={isRowDisabled}
                                      >
                                        {isThisRemoving ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="size-3.5" />
                                        )}
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
