import React from "react";
import {
  Play,
  Square,
  RotateCw,
  Terminal,
  FileText,
  Activity,
  Trash2,
  RefreshCw,
  MoreHorizontal,
  ExternalLink,
  Pause,
  Loader2,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContainerAction, ContainerSummary } from "../../../shared/types";

export interface ContainerRowActionsProps {
  container: ContainerSummary;
  isRunning: boolean;
  isPaused?: boolean | undefined;
  isViewer: boolean;
  isRowDisabled: boolean;
  isThisAction: boolean;
  pendingActionType?: ContainerAction | null | undefined;
  isThisRemoving: boolean;
  isRecreating?: boolean | undefined;
  onSelectContainer: (
    c: ContainerSummary,
    initialTab?: "overview" | "env" | "logs" | "console" | "stats" | "inspect",
  ) => void;
  onAction: (id: string, action: ContainerAction) => void;
  onRecreateContainer?: ((id: string) => void) | undefined;
  onRemoveContainer?: ((id: string) => void) | undefined;
  onRestoreBackup?: ((c: ContainerSummary) => void) | undefined;
  onPauseToggle?: (() => void) | undefined;
  variant?: "desktop" | "mobile" | undefined;
}

export function ContainerRowActions({
  container,
  isRunning,
  isPaused = false,
  isViewer,
  isRowDisabled,
  isThisAction,
  pendingActionType,
  isThisRemoving,
  isRecreating = false,
  onSelectContainer,
  onAction,
  onRecreateContainer,
  onRemoveContainer,
  onRestoreBackup,
  onPauseToggle,
  variant = "desktop",
}: ContainerRowActionsProps) {
  const isPendingStart = isThisAction && pendingActionType === "start";
  const isPendingStop = isThisAction && pendingActionType === "stop";
  const isPendingRestart = isThisAction && pendingActionType === "restart";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {/* 1. Diagnóstico Primário: Ver Logs em tempo real */}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors"
        title="Ver logs em tempo real"
        aria-label={`Ver logs do container ${container.name}`}
        onClick={() => onSelectContainer(container, "logs")}
      >
        <FileText className="size-3.5 mr-1 text-primary shrink-0" />
        <span>Logs</span>
      </Button>

      {/* 2. Ação Operacional Primária Direta: Iniciar ou Parar */}
      {!isViewer && (
        isRunning ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Parar container"
            aria-label={`Parar container ${container.name}`}
            onClick={() => onAction(container.id, "stop")}
            disabled={isRowDisabled}
          >
            {isPendingStop ? (
              <Loader2 className="size-3.5 mr-1 animate-spin shrink-0" />
            ) : (
              <Square className="size-3.5 mr-1 shrink-0" />
            )}
            <span>{isPendingStop ? "Parando..." : "Parar"}</span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            title="Iniciar container"
            aria-label={`Iniciar container ${container.name}`}
            onClick={() => onAction(container.id, "start")}
            disabled={isRowDisabled}
          >
            {isPendingStart ? (
              <Loader2 className="size-3.5 mr-1 animate-spin shrink-0" />
            ) : (
              <Play className="size-3.5 mr-1 shrink-0" />
            )}
            <span>{isPendingStart ? "Iniciando..." : "Iniciar"}</span>
          </Button>
        )
      )}

      {/* 3. Ações Consolidadas: Menu Kebab (···) */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-foreground hover:bg-accent/80 shrink-0"
            title="Mais opções do container"
            aria-label={`Mais opções para o container ${container.name}`}
          >
            {isThisRemoving ? (
              <Loader2 className="size-3.5 animate-spin text-destructive" />
            ) : isPendingRestart || isRecreating ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 font-sans text-xs shadow-lg border border-border/80"
        >
          <DropdownMenuLabel className="text-[11px] font-mono text-muted-foreground font-normal truncate">
            {container.name}
          </DropdownMenuLabel>

          {/* Seção 1: Inspeção e Ferramentas */}
          <DropdownMenuItem
            onClick={() => onSelectContainer(container, "overview")}
            className="cursor-pointer py-1.5"
          >
            <ExternalLink className="mr-2 size-3.5 text-muted-foreground" />
            <span>Detalhes & Configuração</span>
          </DropdownMenuItem>

          {isRunning ? (
            <>
              <DropdownMenuItem
                onClick={() => onSelectContainer(container, "console")}
                className="cursor-pointer py-1.5"
              >
                <Terminal className="mr-2 size-3.5 text-sky-400" />
                <span>Terminal Interativo (Exec)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSelectContainer(container, "stats")}
                className="cursor-pointer py-1.5"
              >
                <Activity className="mr-2 size-3.5 text-emerald-400" />
                <span>Métricas ao Vivo (Stats)</span>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled className="opacity-50 py-1.5">
              <Terminal className="mr-2 size-3.5 text-muted-foreground" />
              <span>Terminal (Container parado)</span>
            </DropdownMenuItem>
          )}

          {!isViewer && (
            <>
              <DropdownMenuSeparator />

              {/* Seção 2: Ciclo de Vida e Manutenção */}
              <DropdownMenuItem
                onClick={() => onAction(container.id, "restart")}
                disabled={isRowDisabled}
                className="cursor-pointer py-1.5"
              >
                <RotateCw className="mr-2 size-3.5 text-blue-400" />
                <span>Reiniciar container</span>
              </DropdownMenuItem>

              {onRecreateContainer && (
                <DropdownMenuItem
                  onClick={() => onRecreateContainer(container.id)}
                  disabled={isRowDisabled}
                  className="cursor-pointer py-1.5"
                >
                  <RefreshCw className="mr-2 size-3.5 text-amber-400" />
                  <span>Recriar (com repull)</span>
                </DropdownMenuItem>
              )}

              {isRunning && onPauseToggle && (
                <DropdownMenuItem
                  onClick={onPauseToggle}
                  disabled={isRowDisabled}
                  className="cursor-pointer py-1.5"
                >
                  <Pause className="mr-2 size-3.5 text-muted-foreground" />
                  <span>{isPaused ? "Retomar execução" : "Pausar processos"}</span>
                </DropdownMenuItem>
              )}

              {onRestoreBackup && (
                <DropdownMenuItem
                  onClick={() => onRestoreBackup(container)}
                  disabled={isRowDisabled}
                  className="cursor-pointer py-1.5 text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400 focus:bg-amber-500/10"
                >
                  <ArchiveRestore className="mr-2 size-3.5 text-amber-500" />
                  <span>Restaurar Backup (R2/S3)</span>
                </DropdownMenuItem>
              )}

              {/* Seção 3: Zona de Perigo / Destrutivo */}
              {onRemoveContainer && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onRemoveContainer(container.id)}
                    disabled={isRowDisabled}
                    className="cursor-pointer py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-3.5 text-destructive" />
                    <span>Remover container</span>
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

