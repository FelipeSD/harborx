import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Loader2,
  Search,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FOLDER_COLOR_STYLES,
  buildFolderMap,
  flattenFolderTree,
  getFolderFullPath,
  type FolderTreeNode,
} from "./folder-utils";
import type { StackFolder, StackFolderColor, StackSummary } from "../../../shared/types";

const FOLDER_COLORS: StackFolderColor[] = [
  "default",
  "amber",
  "emerald",
  "sky",
  "violet",
  "rose",
  "orange",
];

interface FolderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: StackFolder[];
  editingFolder: StackFolder | null;
  defaultParentId?: string | null | undefined;
  onSaved?: ((folder: StackFolder) => void) | undefined;
}

export function FolderFormDialog({
  open,
  onOpenChange,
  folders,
  editingFolder,
  defaultParentId,
  onSaved,
}: FolderFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [color, setColor] = useState<StackFolderColor>("amber");

  useEffect(() => {
    if (!open) return;
    if (editingFolder) {
      setName(editingFolder.name);
      setParentId(editingFolder.parentId || "none");
      setColor(editingFolder.color || "default");
    } else {
      setName("");
      setParentId(defaultParentId || "none");
      setColor("amber");
    }
  }, [open, editingFolder, defaultParentId]);

  const parentOptions = useMemo(
    () => flattenFolderTree(folders, editingFolder?.id ?? null),
    [folders, editingFolder?.id],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      const resolvedParent = parentId === "none" ? null : parentId;
      if (editingFolder) {
        return api.stackFolders.update(editingFolder.id, {
          name: trimmed,
          parentId: resolvedParent,
          color,
        });
      }
      return api.stackFolders.create({
        name: trimmed,
        parentId: resolvedParent,
        color,
      });
    },
    onSuccess: (folder) => {
      toast.success(
        editingFolder
          ? `Pasta '${folder.name}' atualizada com sucesso!`
          : `Pasta '${folder.name}' criada com sucesso!`,
      );
      void queryClient.invalidateQueries({ queryKey: ["stack-folders"] });
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      onSaved?.(folder);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome da pasta");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {editingFolder ? (
              <FolderOpen className="size-4 text-primary shrink-0" />
            ) : (
              <FolderPlus className="size-4 text-primary shrink-0" />
            )}
            <span>{editingFolder ? `Editar pasta: ${editingFolder.name}` : "Nova pasta de stacks"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pastas são apenas organização visual no HarborX e podem ser aninhadas em subpastas sem
            afetar containers, volumes ou diretórios no servidor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name" className="text-xs">
              Nome da pasta *
            </Label>
            <Input
              id="folder-name"
              placeholder="ex.: Clientes, Acme, Produção..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="text-xs h-9"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folder-parent" className="text-xs">
              Pasta pai (opcional)
            </Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="folder-parent" className="text-xs h-9">
                <SelectValue placeholder="Raiz (nível principal)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  Raiz (nível principal)
                </SelectItem>
                {parentOptions.map((opt) => {
                  const style = FOLDER_COLOR_STYLES[opt.folder.color] ?? FOLDER_COLOR_STYLES.default;
                  return (
                    <SelectItem key={opt.folder.id} value={opt.folder.id} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("size-2 rounded-full shrink-0", style.dot)} />
                        <span className="font-mono text-muted-foreground">
                          {opt.depth > 0 ? `${"— ".repeat(opt.depth)}` : ""}
                        </span>
                        <span>{opt.folder.name}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs block">Cor identificadora</Label>
            <div
              role="radiogroup"
              aria-label="Cor da pasta"
              className="flex flex-wrap gap-1.5"
            >
              {FOLDER_COLORS.map((c) => {
                const style = FOLDER_COLOR_STYLES[c];
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={style.label}
                    onClick={() => setColor(c)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors cursor-pointer",
                      selected
                        ? "border-primary/60 bg-primary/10 text-foreground font-medium ring-1 ring-primary/30"
                        : "border-border/70 bg-surface/50 text-muted-foreground hover:text-foreground hover:border-border",
                    )}
                  >
                    <span className={cn("size-2.5 rounded-full shrink-0", style.swatch)} />
                    <span>{style.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending || !name.trim()}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Salvando...
                </>
              ) : editingFolder ? (
                "Salvar Alterações"
              ) : (
                "Criar Pasta"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteFolderAlertDialogProps {
  folder: StackFolder | null;
  directStacksCount: number;
  directSubfoldersCount: number;
  parentFolderName: string | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: ((deletedId: string) => void) | undefined;
}

export function DeleteFolderAlertDialog({
  folder,
  directStacksCount,
  directSubfoldersCount,
  parentFolderName,
  onOpenChange,
  onDeleted,
}: DeleteFolderAlertDialogProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.stackFolders.remove(id),
    onSuccess: (res, id) => {
      toast.success(
        `Pasta removida. ${res.movedStacksCount} stack(s) e ${res.movedFoldersCount} subpasta(s) reorganizadas.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["stack-folders"] });
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      onDeleted?.(id);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(`Falha ao excluir pasta: ${err.message}`);
    },
  });

  const destinationLabel = parentFolderName ? `a pasta pai "${parentFolderName}"` : "Sem pasta (Raiz)";

  return (
    <AlertDialog open={Boolean(folder)} onOpenChange={(o) => !o && onOpenChange(false)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-500 shrink-0" />
            <span>Excluir pasta "{folder?.name}"?</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            Apenas a pasta organizacional será removida.{" "}
            <strong className="text-foreground">
              Nenhuma stack, container, rede ou volume será apagado ou parado.
            </strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-border/70 bg-surface/60 p-3 text-xs space-y-1.5">
          <p className="text-muted-foreground">
            Ao excluir esta pasta, os itens diretos serão movidos para{" "}
            <strong className="text-foreground font-mono">{destinationLabel}</strong>:
          </p>
          <ul className="font-mono text-[11px] text-foreground space-y-0.5 pl-1">
            <li>• {directStacksCount} stack(s) direta(s)</li>
            <li>• {directSubfoldersCount} subpasta(s) direta(s)</li>
          </ul>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending || !folder}
            onClick={(e) => {
              e.preventDefault();
              if (folder) deleteMutation.mutate(folder.id);
            }}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir apenas a pasta"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface MoveStackFolderDialogProps {
  stack: StackSummary | null;
  folders: StackFolder[];
  onOpenChange: (open: boolean) => void;
  onRequestNewFolder?: ((onCreated: (folder: StackFolder) => void) => void) | undefined;
}

export function MoveStackFolderDialog({
  stack,
  folders,
  onOpenChange,
  onRequestNewFolder,
}: MoveStackFolderDialogProps) {
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!stack) return;
    setSelectedFolderId(stack.folderId ?? null);
    setSearchTerm("");
  }, [stack]);

  const folderMap = useMemo(() => buildFolderMap(folders), [folders]);
  const flattened = useMemo(() => flattenFolderTree(folders), [folders]);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return flattened;
    return flattened.filter(
      (opt) =>
        opt.folder.name.toLowerCase().includes(q) || opt.fullPath.toLowerCase().includes(q),
    );
  }, [flattened, searchTerm]);

  const currentPath = stack?.folderId ? getFolderFullPath(stack.folderId, folderMap) : null;
  const unchanged = stack ? selectedFolderId === (stack.folderId ?? null) : true;

  const moveMutation = useMutation({
    mutationFn: ({ stackId, folderId }: { stackId: string; folderId: string | null }) =>
      api.stacks.moveFolder(stackId, folderId),
    onSuccess: (updated) => {
      const destName = updated.folderId
        ? getFolderFullPath(updated.folderId, folderMap) || "pasta selecionada"
        : "Sem pasta (Raiz)";
      toast.success(`Stack '${updated.name}' movida para ${destName}.`);
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(`Erro ao mover stack: ${err.message}`);
    },
  });

  return (
    <Dialog open={Boolean(stack)} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <FolderInput className="size-4 text-primary shrink-0" />
            <span className="truncate">Mover stack: {stack?.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pasta atual:{" "}
            <span className="font-mono text-foreground">{currentPath || "Sem pasta (Raiz)"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 min-h-0 flex-1 flex flex-col">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar pasta…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>
            {onRequestNewFolder && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs shrink-0 gap-1"
                onClick={() =>
                  onRequestNewFolder((created) => {
                    setSelectedFolderId(created.id);
                  })
                }
              >
                <FolderPlus className="size-3.5" />
                Nova
              </Button>
            )}
          </div>

          <div
            role="radiogroup"
            aria-label="Selecionar pasta de destino"
            className="max-h-64 overflow-y-auto rounded-lg border border-border/70 bg-surface/40 divide-y divide-border/40"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedFolderId === null}
              onClick={() => setSelectedFolderId(null)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors cursor-pointer",
                selectedFolderId === null
                  ? "bg-primary/10 text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">Sem pasta (Raiz)</span>
                {stack?.folderId === null && (
                  <span className="font-mono text-[10px] text-muted-foreground border border-border/60 rounded px-1">
                    atual
                  </span>
                )}
              </span>
              {selectedFolderId === null && <Check className="size-3.5 text-primary shrink-0" />}
            </button>

            {filteredOptions.length === 0 && searchTerm.trim() ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhuma pasta corresponde a "{searchTerm}".
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const style =
                  FOLDER_COLOR_STYLES[opt.folder.color] ?? FOLDER_COLOR_STYLES.default;
                const isSelected = selectedFolderId === opt.folder.id;
                const isCurrent = stack?.folderId === opt.folder.id;
                const indentPx = searchTerm.trim() ? 12 : opt.depth * 16 + 12;

                return (
                  <button
                    key={opt.folder.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedFolderId(opt.folder.id)}
                    style={{ paddingLeft: `${indentPx}px` }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 pr-3 py-2 text-left text-xs transition-colors cursor-pointer",
                      isSelected
                        ? "bg-primary/10 text-foreground font-medium"
                        : "text-foreground/85 hover:bg-accent/40",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={cn("size-2 rounded-full shrink-0", style.dot)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{opt.folder.name}</span>
                          {isCurrent && (
                            <span className="font-mono text-[10px] text-muted-foreground border border-border/60 rounded px-1 shrink-0">
                              atual
                            </span>
                          )}
                        </div>
                        {opt.depth > 0 && (
                          <p className="font-mono text-[10px] text-muted-foreground truncate">
                            {opt.fullPath}
                          </p>
                        )}
                      </div>
                    </span>
                    {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
            Apenas organização visual no HarborX — containers, redes, volumes e tokens de webhook
            não são alterados nem reiniciados.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={moveMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!stack || unchanged || moveMutation.isPending}
            onClick={() => {
              if (!stack) return;
              moveMutation.mutate({ stackId: stack.id, folderId: selectedFolderId });
            }}
          >
            {moveMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Movendo...
              </>
            ) : (
              "Mover Stack"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StopFolderStacksDialogProps {
  node: FolderTreeNode | null;
  runningStacks: StackSummary[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmStop: (folderId: string) => void;
}

export function StopFolderStacksDialog({
  node,
  runningStacks,
  isPending,
  onOpenChange,
  onConfirmStop,
}: StopFolderStacksDialogProps) {
  const previewStacks = runningStacks.slice(0, 6);
  const remaining = Math.max(0, runningStacks.length - previewStacks.length);

  return (
    <AlertDialog open={Boolean(node)} onOpenChange={(o) => !o && !isPending && onOpenChange(false)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Square className="size-4 text-amber-500 shrink-0" />
            <span>Parar todas as stacks em "{node?.folder.name}"?</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            Esta ação irá executar <code className="font-mono">docker compose stop</code> em{" "}
            <strong className="text-foreground">{runningStacks.length} stack(s)</strong> ativas
            nesta pasta{node && node.children.length > 0 ? " e nas subpastas" : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {runningStacks.length > 0 && (
          <div className="rounded-lg border border-border/70 bg-surface/60 p-3 text-xs space-y-1.5">
            <p className="text-[11px] font-mono text-muted-foreground">
              Caminho: <span className="text-foreground">{node?.fullPath}</span>
            </p>
            <ul className="font-mono text-[11px] text-foreground space-y-0.5 pt-1">
              {previewStacks.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5 truncate">
                  <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="truncate">{s.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    ({s.runningContainersCount}/{s.containersCount})
                  </span>
                </li>
              ))}
              {remaining > 0 && (
                <li className="text-muted-foreground pl-3">
                  + {remaining} outra(s) stack(s)...
                </li>
              )}
            </ul>
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
              A stack própria do HarborX possui proteção automática e nunca será parada em lote.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
            disabled={isPending || !node || runningStacks.length === 0}
            onClick={(e) => {
              e.preventDefault();
              if (node) onConfirmStop(node.folder.id);
            }}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Parando...
              </>
            ) : (
              `Parar ${runningStacks.length} stack(s)`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
