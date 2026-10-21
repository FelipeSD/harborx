import { useState } from "react";
import {
  Layers,
  Boxes,
  Play,
  Square,
  RotateCw,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square as SquareOutline,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/app/ui-bits";
import { cn } from "@/lib/utils";
import { ContainerRowActions } from "./ContainerRowActions";
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

        return (
          <div
            key={groupKey}
            className="group relative rounded-xl border border-border/70 bg-card/60 transition-all duration-200 min-w-0 max-w-full overflow-hidden"
          >
            {/* Divisória de Fichário (Pasta Tab) */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5 border-b border-border/60 bg-surface/40 px-3.5 py-2.5 sm:px-4 sm:py-3 transition-colors min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => toggleCollapse(groupKey)}
                  className="flex items-center gap-2 text-left focus:outline-none min-w-0 flex-1 group/btn"
                  title={isCollapsed ? "Expandir pasta da stack" : "Recolher pasta da stack"}
                  aria-label={
                    isCollapsed
                      ? `Expandir pasta ${group.stackName}`
                      : `Recolher pasta ${group.stackName}`
                  }
                  aria-expanded={!isCollapsed}
                >
                  <div className="text-muted-foreground group-hover/btn:text-foreground transition-transform shrink-0">
                    {isCollapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <div
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded border",
                        group.isStandalone
                          ? "bg-muted/40 border-border text-muted-foreground"
                          : "bg-primary/10 border-primary/20 text-primary",
                      )}
                    >
                      {group.isStandalone ? (
                        <Boxes className="size-3" />
                      ) : (
                        <Layers className="size-3" />
                      )}
                    </div>

                    <span className="font-semibold text-sm text-foreground truncate">
                      {group.stackName}
                    </span>

                    {group.isStandalone && (
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 border border-border/60 rounded px-1.5 py-0.2 shrink-0">
                        avulso
                      </span>
                    )}

                    {/* Status Único e Preciso */}
                    {hasFailed ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-rose-500 font-medium">
                        <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                        falha crítica
                      </span>
                    ) : total > 0 && running === total ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-500 font-medium">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {running}/{total} rodando
                      </span>
                    ) : running > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-500 font-medium">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {running}/{total} rodando
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                        {total} parado{total > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Controles da Divisória da Stack */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                {!isViewer && !group.isStandalone && (
                  <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/50 p-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                      title={`Iniciar todos os containers de ${group.stackName}`}
                      aria-label={`Iniciar todos os containers de ${group.stackName}`}
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
                      aria-label={`Parar todos os containers de ${group.stackName}`}
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
                      aria-label={`Reiniciar todos os containers de ${group.stackName}`}
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
                    aria-label={
                      allSelected
                        ? `Desmarcar todos os containers de ${group.stackName}`
                        : `Selecionar todos os containers de ${group.stackName}`
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
                {/* Visualização para Mobile (sem caixas aninhadas) */}
                <div className="block md:hidden divide-y divide-border/40">
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
                          "p-3 space-y-2 transition-colors",
                          isSelected && "bg-primary/5",
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

                        {/* Ações Mobile Consolidadas */}
                        <div className="pt-2 border-t border-border/40">
                          <ContainerRowActions
                            container={c}
                            isRunning={isRunning}
                            isViewer={isViewer}
                            isRowDisabled={isRowDisabled}
                            isThisAction={isThisAction}
                            pendingActionType={pendingAction?.id === c.id ? pendingAction.action : null}
                            isThisRemoving={isThisRemoving}
                            onSelectContainer={onSelectContainer}
                            onAction={onAction}
                            onRecreateContainer={onRecreateContainer}
                            onRemoveContainer={onRemoveContainer}
                            variant="mobile"
                          />
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
                              <ContainerRowActions
                                container={c}
                                isRunning={isRunning}
                                isViewer={isViewer}
                                isRowDisabled={isRowDisabled}
                                isThisAction={isThisAction}
                                pendingActionType={pendingAction?.id === c.id ? pendingAction.action : null}
                                isThisRemoving={isThisRemoving}
                                onSelectContainer={onSelectContainer}
                                onAction={onAction}
                                onRecreateContainer={onRecreateContainer}
                                onRemoveContainer={onRemoveContainer}
                                variant="desktop"
                              />
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
