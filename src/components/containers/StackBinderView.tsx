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
  onSelectContainer: (c: ContainerSummary) => void;
  onAction: (id: string, action: ContainerAction) => void;
  onStackAction: (containerIds: string[], action: ContainerAction) => void;
  isViewer: boolean;
  isActionPending: boolean;
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
  isViewer,
  isActionPending,
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
        const allSelected =
          groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
        const someSelected =
          groupIds.some((id) => selectedIds.includes(id)) && !allSelected;

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

        return (
          <div
            key={groupKey}
            className="group relative rounded-xl border border-border/80 bg-card/60 shadow-md backdrop-blur transition-all duration-200 hover:border-primary/40 hover:shadow-lg"
          >
            {/* Divisória de Fichário (Pasta Tab) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-surface/90 via-surface/70 to-surface/90 px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleCollapse(groupKey)}
                  className="flex items-center gap-2 text-left focus:outline-none"
                  title={isCollapsed ? "Expandir pasta da stack" : "Recolher pasta da stack"}
                >
                  <div className="grid size-7 place-items-center rounded-lg bg-surface border border-border/80 text-primary transition-transform duration-200 group-hover:scale-105">
                    {isCollapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "grid size-8 place-items-center rounded-lg border",
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
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tracking-tight text-foreground sm:text-base">
                          {group.stackName}
                        </span>
                        <Badge
                          variant={group.isStandalone ? "secondary" : "default"}
                          className={cn(
                            "text-[10px] uppercase tracking-wider font-mono px-2 py-0.5",
                            !group.isStandalone && "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20",
                          )}
                        >
                          {group.isStandalone ? "Avulso" : "Docker Compose"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
              <div className="flex flex-wrap items-center gap-2">
                {!isViewer && !group.isStandalone && (
                  <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                      title={`Iniciar todos os containers de ${group.stackName}`}
                      onClick={() => onStackAction(groupIds, "start")}
                      disabled={isActionPending || group.runningCount === group.containers.length}
                    >
                      <Play className="mr-1 size-3" />
                      Iniciar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                      title={`Parar todos os containers de ${group.stackName}`}
                      onClick={() => onStackAction(groupIds, "stop")}
                      disabled={isActionPending || group.runningCount === 0}
                    >
                      <Square className="mr-1 size-3" />
                      Parar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                      title={`Reiniciar todos os containers de ${group.stackName}`}
                      onClick={() => onStackAction(groupIds, "restart")}
                      disabled={isActionPending}
                    >
                      <RotateCw className="mr-1 size-3" />
                      Reiniciar
                    </Button>
                  </div>
                )}

                {!isViewer && (
                  <button
                    onClick={toggleSelectGroup}
                    className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={allSelected ? "Desmarcar todos desta pasta" : "Selecionar todos desta pasta"}
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
              <div className="overflow-x-auto">
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
                              onClick={() => onSelectContainer(c)}
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
                                onClick={() => onSelectContainer(c)}
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
                                  onClick={() => onSelectContainer(c)}
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
                                  onClick={() => onSelectContainer(c)}
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
                                      disabled={isActionPending}
                                    >
                                      <Square className="size-3.5" />
                                    </Button>
                                  ) : (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-7 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                      title="Iniciar container"
                                      onClick={() => onAction(c.id, "start")}
                                      disabled={isActionPending}
                                    >
                                      <Play className="size-3.5" />
                                    </Button>
                                  )}

                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                    title="Reiniciar container"
                                    onClick={() => onAction(c.id, "restart")}
                                    disabled={isActionPending}
                                  >
                                    <RotateCw className="size-3.5" />
                                  </Button>
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
            )}
          </div>
        );
      })}
    </div>
  );
}

