import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
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
import { cn } from "@/lib/utils";
import {
  FOLDER_COLOR_STYLES,
  isStackFailed,
  isStackRunning,
  type FolderTreeNode,
} from "./folder-utils";
import type { StackFolder, StackSummary } from "../../../shared/types";

interface StackFolderSectionProps {
  node: FolderTreeNode;
  isExpanded: (folderId: string) => boolean;
  onToggleExpand: (folderId: string) => void;
  onEnsureExpanded: (folderId: string) => void;
  isOperator: boolean;
  batchPending: { folderId: string; action: "start" | "stop" } | null;
  onBatchStart: (folderId: string) => void;
  onRequestBatchStop: (node: FolderTreeNode) => void;
  onCreateStackInFolder: (folderId: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onEditFolder: (folder: StackFolder) => void;
  onDeleteFolder: (folder: StackFolder) => void;
  renderStackCard: (stack: StackSummary) => ReactNode;
}

export function StackFolderSection({
  node,
  isExpanded,
  onToggleExpand,
  onEnsureExpanded,
  isOperator,
  batchPending,
  onBatchStart,
  onRequestBatchStop,
  onCreateStackInFolder,
  onCreateSubfolder,
  onEditFolder,
  onDeleteFolder,
  renderStackCard,
}: StackFolderSectionProps) {
  const expanded = isExpanded(node.folder.id);
  const headingId = useId();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handleBeforeMatch = () => {
      onEnsureExpanded(node.folder.id);
    };
    el.addEventListener("beforematch", handleBeforeMatch);
    return () => el.removeEventListener("beforematch", handleBeforeMatch);
  }, [node.folder.id, onEnsureExpanded]);

  const colorStyle = FOLDER_COLOR_STYLES[node.folder.color] ?? FOLDER_COLOR_STYLES.default;
  const isStartingThis =
    batchPending?.folderId === node.folder.id && batchPending.action === "start";
  const isStoppingThis =
    batchPending?.folderId === node.folder.id && batchPending.action === "stop";
  const anyBatchPending = batchPending !== null;

  const canStart =
    node.totalStacksCount > 0 && node.fullyRunningStacksCount < node.totalStacksCount;
  const canStop = node.runningStacksCount > 0;

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      {/* Cabeçalho de divisória de pasta (estilo fichário operacional) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border/75 bg-surface/70 px-3 py-2 sm:px-3.5 sm:py-2.5 transition-colors hover:border-border min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            id={headingId}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onToggleExpand(node.folder.id)}
            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group/folder"
          >
            <span className="text-muted-foreground group-hover/folder:text-foreground shrink-0 transition-transform">
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </span>

            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md border",
                colorStyle.iconBox,
              )}
            >
              {expanded ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
            </span>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0">
              <span className="font-semibold text-sm text-foreground truncate max-w-full">
                {node.folder.name}
              </span>

              <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
                {node.totalStacksCount} {node.totalStacksCount === 1 ? "stack" : "stacks"}
              </span>

              {node.totalStacksCount === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground shrink-0">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  vazia
                </span>
              ) : node.deployingStacksCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-400 font-medium shrink-0">
                  <Loader2 className="size-3 animate-spin" />
                  {node.deployingStacksCount} em deploy
                </span>
              ) : node.failedStacksCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-rose-500 font-medium shrink-0">
                  <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {node.failedStacksCount} com falha
                </span>
              ) : node.runningStacksCount === node.totalStacksCount ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-500 font-medium shrink-0">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {node.runningStacksCount}/{node.totalStacksCount} rodando
                </span>
              ) : node.runningStacksCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-400 font-medium shrink-0">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  {node.runningStacksCount}/{node.totalStacksCount} rodando
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground shrink-0">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  {node.totalStacksCount} parada{node.totalStacksCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </button>
        </div>

        {isOperator && (
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/50 p-0.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                disabled={anyBatchPending || !canStart}
                onClick={() => onBatchStart(node.folder.id)}
                title={`Iniciar todas as stacks em ${node.folder.name}`}
                aria-label={`Iniciar todas as stacks da pasta ${node.folder.name}`}
              >
                {isStartingThis ? (
                  <Loader2 className="mr-1 size-3 animate-spin text-emerald-500" />
                ) : (
                  <Play className="mr-1 size-3" />
                )}
                {isStartingThis ? "Iniciando..." : "Iniciar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                disabled={anyBatchPending || !canStop}
                onClick={() => onRequestBatchStop(node)}
                title={`Parar todas as stacks em ${node.folder.name}`}
                aria-label={`Parar todas as stacks da pasta ${node.folder.name}`}
              >
                {isStoppingThis ? (
                  <Loader2 className="mr-1 size-3 animate-spin text-amber-500" />
                ) : (
                  <Square className="mr-1 size-3" />
                )}
                {isStoppingThis ? "Parando..." : "Parar"}
              </Button>
            </div>

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={`Opções da pasta ${node.folder.name}`}
                  title="Opções da pasta"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 font-sans text-xs shadow-lg border border-border/80"
              >
                <DropdownMenuLabel className="text-[11px] font-mono text-muted-foreground font-normal truncate">
                  Pasta • {node.folder.name}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer py-1.5"
                  onClick={() => onCreateStackInFolder(node.folder.id)}
                >
                  <Plus className="mr-2 size-3.5 text-primary" />
                  <span>Nova stack aqui</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer py-1.5"
                  onClick={() => onCreateSubfolder(node.folder.id)}
                >
                  <FolderPlus className="mr-2 size-3.5 text-muted-foreground" />
                  <span>Nova subpasta</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer py-1.5"
                  onClick={() => onEditFolder(node.folder)}
                >
                  <Pencil className="mr-2 size-3.5 text-muted-foreground" />
                  <span>Editar pasta</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => onDeleteFolder(node.folder)}
                >
                  <Trash2 className="mr-2 size-3.5 text-destructive" />
                  <span>Excluir pasta</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Conteúdo recolhível indexável pelo Ctrl+F via hidden="until-found" */}
      <div
        ref={panelRef}
        id={panelId}
        hidden={expanded ? undefined : ("until-found" as unknown as boolean)}
      >
        <div className="folder-expand-inner pt-3 px-0.5 pb-0.5 space-y-4 min-w-0">
          {node.directStacks.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-w-0">
              {node.directStacks.map((s) => renderStackCard(s))}
            </div>
          ) : node.children.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-surface/25 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Nenhuma stack organizada nesta pasta.</span>
              {isOperator && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                  onClick={() => onCreateStackInFolder(node.folder.id)}
                >
                  <Plus className="mr-1 size-3" />
                  Nova stack aqui
                </Button>
              )}
            </div>
          ) : null}

          {node.children.length > 0 && (
            <div
              className={cn(
                "space-y-4 border-l border-border/55 min-w-0",
                node.depth < 2
                  ? "ml-2.5 pl-3 sm:ml-3.5 sm:pl-4"
                  : "ml-1.5 pl-2.5 sm:ml-2.5 sm:pl-3",
              )}
            >
              {node.children.map((child) => (
                <StackFolderSection
                  key={child.folder.id}
                  node={child}
                  isExpanded={isExpanded}
                  onToggleExpand={onToggleExpand}
                  onEnsureExpanded={onEnsureExpanded}
                  isOperator={isOperator}
                  batchPending={batchPending}
                  onBatchStart={onBatchStart}
                  onRequestBatchStop={onRequestBatchStop}
                  onCreateStackInFolder={onCreateStackInFolder}
                  onCreateSubfolder={onCreateSubfolder}
                  onEditFolder={onEditFolder}
                  onDeleteFolder={onDeleteFolder}
                  renderStackCard={renderStackCard}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface UnassignedStacksSectionProps {
  stacks: StackSummary[];
  expanded: boolean;
  onToggleExpand: () => void;
  onEnsureExpanded: () => void;
  renderStackCard: (stack: StackSummary) => ReactNode;
}

export function UnassignedStacksSection({
  stacks,
  expanded,
  onToggleExpand,
  onEnsureExpanded,
  renderStackCard,
}: UnassignedStacksSectionProps) {
  const headingId = useId();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handleBeforeMatch = () => {
      onEnsureExpanded();
    };
    el.addEventListener("beforematch", handleBeforeMatch);
    return () => el.removeEventListener("beforematch", handleBeforeMatch);
  }, [onEnsureExpanded]);

  if (stacks.length === 0) return null;

  const runningCount = stacks.filter(isStackRunning).length;
  const failedCount = stacks.filter(isStackFailed).length;

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface/50 px-3 py-2 sm:px-3.5 sm:py-2.5 min-w-0">
        <button
          type="button"
          id={headingId}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggleExpand}
          className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group/unassigned"
        >
          <span className="text-muted-foreground group-hover/unassigned:text-foreground shrink-0">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>

          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground">
            {expanded ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
          </span>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 min-w-0">
            <span className="font-semibold text-sm text-foreground truncate">Sem pasta</span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
              {stacks.length} {stacks.length === 1 ? "stack" : "stacks"}
            </span>
            {failedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-rose-500 font-medium shrink-0">
                <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                {failedCount} com falha
              </span>
            ) : runningCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-500 font-medium shrink-0">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {runningCount}/{stacks.length} rodando
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground shrink-0">
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                {stacks.length} parada{stacks.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </button>
      </div>

      <div
        ref={panelRef}
        id={panelId}
        hidden={expanded ? undefined : ("until-found" as unknown as boolean)}
      >
        <div className="folder-expand-inner pt-3 px-0.5 pb-0.5 grid grid-cols-1 gap-4 lg:grid-cols-2 min-w-0">
          {stacks.map((s) => renderStackCard(s))}
        </div>
      </div>
    </section>
  );
}
