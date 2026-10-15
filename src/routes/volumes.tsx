import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  HardDrive,
  AlertCircle,
  Scissors,
  Trash2,
  Eye,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import type { CreateVolumeRequest, VolumeSummary } from "../../shared/types";

export const Route = createFileRoute("/volumes")({
  head: () => ({
    meta: [
      { title: "Volumes Docker — HarborX" },
      {
        name: "description",
        content: "Gerencie volumes persistentes do Docker com detecção de containers associados.",
      },
      { property: "og:title", content: "Volumes Docker — HarborX" },
    ],
  }),
  component: VolumesPage,
});

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoString?: string): string {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function VolumesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOperator = user?.role === "admin" || user?.role === "operator";

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [volName, setVolName] = useState("");
  const [volDriver, setVolDriver] = useState("local");

  const [isPruneOpen, setIsPruneOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VolumeSummary | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  const [inspectVolume, setInspectVolume] = useState<VolumeSummary | null>(null);
  const [inspectData, setInspectData] = useState<Record<string, unknown> | null>(null);
  const [isLoadingInspect, setIsLoadingInspect] = useState(false);

  const {
    data: volumes = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["volumes"],
    queryFn: api.volumes.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateVolumeRequest) => api.volumes.create(data),
    onSuccess: (res) => {
      toast.success(`Volume '${res.name}' criado com sucesso!`);
      setIsCreateOpen(false);
      setVolName("");
      setVolDriver("local");
      void queryClient.invalidateQueries({ queryKey: ["volumes"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao criar volume: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ name, force }: { name: string; force: boolean }) =>
      api.volumes.remove(name, force),
    onSuccess: (res) => {
      toast.success(`Volume '${res.name}' removido.`);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["volumes"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao remover volume: ${err.message}`);
    },
  });

  const pruneMutation = useMutation({
    mutationFn: () => api.volumes.prune(),
    onSuccess: (res) => {
      const count = res.volumesDeleted?.length || 0;
      toast.success(
        count > 0
          ? `${count} volumes não utilizados foram removidos (${formatBytes(res.spaceReclaimed)} liberados)`
          : "Nenhum volume não utilizado para podar",
      );
      setIsPruneOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["volumes"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao podar volumes: ${err.message}`);
    },
  });

  const handleOpenInspect = async (vol: VolumeSummary) => {
    setInspectVolume(vol);
    setIsLoadingInspect(true);
    setInspectData(null);
    try {
      const data = await api.volumes.inspect(vol.name);
      setInspectData(data);
    } catch {
      toast.error("Falha ao carregar detalhes do volume");
    } finally {
      setIsLoadingInspect(false);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: volName.trim() || undefined,
      driver: volDriver.trim() || "local",
    });
  };

  return (
    <>
      <PageHeader
        title="Volumes"
        subtitle={`${volumes.length} volumes persistentes no Docker`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              Atualizar
            </Button>
            {isOperator && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPruneOpen(true)}
                  disabled={pruneMutation.isPending}
                >
                  <Scissors className="size-4" />
                  Podar não usados
                </Button>
                <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="size-4" /> Novo volume
                </Button>
              </>
            )}
          </div>
        }
      />

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro ao carregar volumes</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Não foi possível comunicar com o daemon do Docker."}
          </AlertDescription>
        </Alert>
      )}

      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome do Volume</th>
              <th className="px-4 py-3 font-medium">Driver / Escopo</th>
              <th className="px-4 py-3 font-medium">Containers em Uso</th>
              <th className="px-4 py-3 font-medium">Ponto de Montagem (Host)</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-64" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-12" />
                  </td>
                </tr>
              ))
            ) : volumes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <HardDrive className="mx-auto size-8 mb-2 opacity-40" />
                  Nenhum volume persistente encontrado no Docker.
                </td>
              </tr>
            ) : (
              volumes.map((v) => {
                const inUse = v.inUseBy && v.inUseBy.length > 0;

                return (
                  <tr
                    key={v.name}
                    className="border-b last:border-0 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      <span className="text-foreground">{v.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                        {v.driver}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inUse ? (
                        <div className="flex flex-wrap gap-1">
                          {v.inUseBy!.map((c) => (
                            <Badge
                              key={c.id}
                              variant="outline"
                              className="text-[11px] font-mono border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                            >
                              {c.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não utilizado</span>
                      )}
                    </td>
                    <td
                      className="max-w-xs truncate px-4 py-3 font-mono text-xs text-muted-foreground"
                      title={v.mountpoint}
                    >
                      {v.mountpoint}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatDate(v.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Inspecionar"
                          onClick={() => handleOpenInspect(v)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {isOperator && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Remover volume"
                            onClick={() => {
                              setDeleteTarget(v);
                              setForceDelete(false);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>

      {/* Create Volume Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar novo volume Docker</DialogTitle>
            <DialogDescription>
              Volumes persistentes preservam dados fora do ciclo de vida dos containers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium">Nome do Volume (opcional)</label>
              <Input
                placeholder="ex.: app-postgres-data (vazio = UUID automático)"
                value={volName}
                onChange={(e) => setVolName(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-medium">Driver</label>
              <Input
                value={volDriver}
                onChange={(e) => setVolDriver(e.target.value)}
                placeholder="local"
                className="mt-1 font-mono text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar volume"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inspect Volume Dialog */}
      <Dialog
        open={Boolean(inspectVolume)}
        onOpenChange={(open) => !open && setInspectVolume(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-base truncate">
              Volume: {inspectVolume?.name}
            </DialogTitle>
            <DialogDescription>Metadados de armazenamento, driver e escopo</DialogDescription>
          </DialogHeader>

          {isLoadingInspect ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto size-6 animate-spin mb-2 text-primary" />
              Carregando detalhes do volume...
            </div>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-surface p-3 font-mono text-[11px]">
              {JSON.stringify(inspectData, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Volume Alert */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover volume Docker?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>
                O volume <strong className="font-mono text-foreground">{deleteTarget?.name}</strong>{" "}
                será excluído.
              </div>
              {deleteTarget?.inUseBy && deleteTarget.inUseBy.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-500 flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Atenção: Este volume está montado em {deleteTarget.inUseBy.length} container(s):{" "}
                    <strong>{deleteTarget.inUseBy.map((c) => c.name).join(", ")}</strong>. Removê-lo
                    pode corromper a persistência!
                  </span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="force-volume-delete"
              checked={forceDelete}
              onCheckedChange={(v) => setForceDelete(Boolean(v))}
            />
            <label
              htmlFor="force-volume-delete"
              className="text-xs font-medium leading-none text-muted-foreground cursor-pointer"
            >
              Forçar remoção (-f / force)
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ name: deleteTarget.name, force: forceDelete });
                }
              }}
            >
              {deleteMutation.isPending ? "Removendo..." : "Sim, remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prune Volumes Alert */}
      <AlertDialog open={isPruneOpen} onOpenChange={setIsPruneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Podar volumes não utilizados?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá permanentemente todos os volumes Docker locais que não estão montados em
              nenhum container ativo ou parado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pruneMutation.isPending}
              onClick={() => pruneMutation.mutate()}
            >
              {pruneMutation.isPending ? "Podando..." : "Confirmar poda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
