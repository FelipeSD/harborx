import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
  Search,
  Box,
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
  const [search, setSearch] = useState("");
  const [filterUsage, setFilterUsage] = useState<"all" | "in_use" | "unused">("all");

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
    onSuccess: (res, vars) => {
      toast.success(`Volume '${res.name || vars.name}' removido.`);
      queryClient.setQueryData<VolumeSummary[]>(["volumes"], (old) =>
        old ? old.filter((v) => v.name !== vars.name) : [],
      );
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
      if (count > 0) {
        queryClient.setQueryData<VolumeSummary[]>(["volumes"], (old) =>
          old ? old.filter((v) => v.inUseBy && v.inUseBy.length > 0) : [],
        );
      }
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

  const inUseCount = useMemo(
    () => volumes.filter((v) => v.inUseBy && v.inUseBy.length > 0).length,
    [volumes],
  );
  const unusedCount = useMemo(
    () => volumes.filter((v) => !v.inUseBy || v.inUseBy.length === 0).length,
    [volumes],
  );

  const filteredVolumes = useMemo(() => {
    return volumes.filter((v) => {
      const isInUse = Boolean(v.inUseBy && v.inUseBy.length > 0);
      if (filterUsage === "in_use" && !isInUse) return false;
      if (filterUsage === "unused" && isInUse) return false;

      const term = search.toLowerCase().trim();
      if (!term) return true;

      return (
        v.name.toLowerCase().includes(term) ||
        v.driver.toLowerCase().includes(term) ||
        v.mountpoint.toLowerCase().includes(term) ||
        (v.inUseBy && v.inUseBy.some((c) => c.name.toLowerCase().includes(term)))
      );
    });
  }, [volumes, filterUsage, search]);

  return (
    <>
      <PageHeader
        title="Volumes"
        subtitle={`${volumes.length} volumes persistentes no Docker`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            {isOperator && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPruneOpen(true)}
                  disabled={pruneMutation.isPending}
                  aria-label="Podar volumes órfãos"
                >
                  {pruneMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin text-destructive" />
                  ) : (
                    <Scissors className="size-4" />
                  )}
                  {pruneMutation.isPending ? "Podando..." : "Podar órfãos"}
                </Button>
                <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="size-4" /> Novo volume
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Divisórias Estilizadas tipo Fichário e Busca */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 rounded-xl border border-border/70 bg-surface/50 p-1 backdrop-blur min-w-0">
          <button
            type="button"
            onClick={() => setFilterUsage("all")}
            aria-pressed={filterUsage === "all"}
            aria-label="Filtrar todos os volumes"
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all",
              filterUsage === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <span>Todos</span>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px] font-mono",
                filterUsage === "all"
                  ? "border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface text-muted-foreground",
              )}
            >
              {volumes.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setFilterUsage("in_use")}
            aria-pressed={filterUsage === "in_use"}
            aria-label="Filtrar volumes em uso"
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all",
              filterUsage === "in_use"
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Em Uso
            </span>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px] font-mono",
                filterUsage === "in_use"
                  ? "border-white/30 bg-white/20 text-white"
                  : "bg-surface text-muted-foreground",
              )}
            >
              {inUseCount}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setFilterUsage("unused")}
            aria-pressed={filterUsage === "unused"}
            aria-label="Filtrar volumes órfãos"
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all",
              filterUsage === "unused"
                ? "bg-amber-500 text-black font-semibold shadow-sm"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-400" />
              Órfãos
            </span>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px] font-mono",
                filterUsage === "unused"
                  ? "border-black/30 bg-black/20 text-black"
                  : "bg-surface text-muted-foreground",
              )}
            >
              {unusedCount}
            </Badge>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nome, driver ou container..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {pruneMutation.isPending && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <Loader2 className="size-5 shrink-0 animate-spin" />
          <div>
            <p className="font-medium">Podando volumes não utilizados no host Docker...</p>
            <p className="text-xs text-muted-foreground">
              O daemon do Docker está excluindo volumes órfãos sem containers associados. Aguarde um
              instante.
            </p>
          </div>
        </div>
      )}

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

      <Panel className="overflow-hidden">
        {/* Visualização em Cartões para Telas Pequenas (Mobile) */}
        <div className="block md:hidden p-3 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-surface/50 p-3 space-y-2">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full mt-2" />
              </div>
            ))
          ) : filteredVolumes.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-xs">
              <HardDrive className="mx-auto size-8 mb-2 opacity-40" />
              Nenhum volume persistente encontrado.
            </div>
          ) : (
            filteredVolumes.map((v) => {
              const inUse = v.inUseBy && v.inUseBy.length > 0;

              return (
                <div
                  key={`mobile-${v.name}`}
                  className="rounded-lg border border-border/60 bg-surface/40 p-3 space-y-2.5 transition-colors hover:bg-surface/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="font-semibold font-mono text-xs text-foreground truncate"
                          title={v.name}
                        >
                          {v.name}
                        </span>
                        <span className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase">
                          {v.driver}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        Criado em {formatDate(v.createdAt)}
                      </p>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono shrink-0",
                        inUse
                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                          : "border-amber-500/40 text-amber-400 bg-amber-500/10",
                      )}
                    >
                      {inUse ? `${v.inUseBy!.length} em uso` : "Órfão"}
                    </Badge>
                  </div>

                  {inUse ? (
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                        Containers em uso:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {v.inUseBy!.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400"
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full shrink-0",
                                c.state === "running" ? "bg-emerald-400" : "bg-slate-400",
                              )}
                            />
                            <span className="font-medium text-foreground truncate max-w-[140px]">
                              {c.name}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] uppercase font-semibold">Montagem:</span>
                      <span
                        className="text-foreground truncate flex-1 text-right ml-2"
                        title={v.mountpoint}
                      >
                        {v.mountpoint}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs flex-1"
                      aria-label={`Inspecionar volume ${v.name}`}
                      onClick={() => handleOpenInspect(v)}
                    >
                      <Eye className="size-3.5 mr-1" /> Inspecionar
                    </Button>
                    {isOperator && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:bg-destructive/10"
                        title="Remover volume"
                        aria-label={`Remover volume ${v.name}`}
                        disabled={
                          deleteMutation.isPending && deleteMutation.variables?.name === v.name
                        }
                        onClick={() => {
                          setDeleteTarget(v);
                          setForceDelete(false);
                        }}
                      >
                        {deleteMutation.isPending && deleteMutation.variables?.name === v.name ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tabela para Desktop */}
        <div className="hidden md:block overflow-x-auto overscroll-x-contain">
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
              ) : filteredVolumes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <HardDrive className="mx-auto size-8 mb-2 opacity-40" />
                    Nenhum volume persistente encontrado.
                    {search || filterUsage !== "all" ? (
                      <p className="text-xs mt-1">Tente ajustar os filtros ou a busca acima.</p>
                    ) : null}
                  </td>
                </tr>
              ) : (
                filteredVolumes.map((v) => {
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
                          <div className="flex flex-wrap gap-1.5">
                            {v.inUseBy!.map((c) => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400"
                                title={`Container: ${c.name} (${c.state || "ativo"})`}
                              >
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full shrink-0",
                                    c.state === "running" ? "bg-emerald-400" : "bg-slate-400",
                                  )}
                                />
                                <span>{c.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-mono"
                          >
                            Não utilizado (órfão)
                          </Badge>
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
                            aria-label={`Inspecionar volume ${v.name}`}
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
                              aria-label={`Remover volume ${v.name}`}
                              disabled={
                                deleteMutation.isPending &&
                                deleteMutation.variables?.name === v.name
                              }
                              onClick={() => {
                                setDeleteTarget(v);
                                setForceDelete(false);
                              }}
                            >
                              {deleteMutation.isPending &&
                              deleteMutation.variables?.name === v.name ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
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
        </div>
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

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createMutation.isPending}
              >
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
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto" disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate({ name: deleteTarget.name, force: forceDelete });
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                "Sim, remover"
              )}
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
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto" disabled={pruneMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pruneMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                pruneMutation.mutate();
              }}
            >
              {pruneMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Podando volumes...
                </>
              ) : (
                "Confirmar poda"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
