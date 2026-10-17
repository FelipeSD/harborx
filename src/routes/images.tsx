import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  RefreshCw,
  Layers,
  AlertCircle,
  HardDrive,
  Trash2,
  Eye,
  Scissors,
  CheckCircle2,
  Loader2,
  Copy,
  Search,
  Sparkles,
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
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { ImagePullProgress, ImageSummary } from "../../shared/types";

export const Route = createFileRoute("/images")({
  head: () => ({
    meta: [
      { title: "Imagens — HarborX" },
      {
        name: "description",
        content:
          "Gerencie e visualize imagens Docker armazenadas localmente com download em tempo real.",
      },
      { property: "og:title", content: "Imagens — HarborX" },
    ],
  }),
  component: ImagesPage,
});

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ImagesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOperator = user?.role === "admin" || user?.role === "operator";

  const [ref, setRef] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<
    Record<string, { status: string; current?: number | undefined; total?: number | undefined }>
  >({});
  const [pullStatusText, setPullStatusText] = useState("");

  const [inspectImage, setInspectImage] = useState<ImageSummary | null>(null);
  const [inspectData, setInspectData] = useState<Record<string, unknown> | null>(null);
  const [inspectHistory, setInspectHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const [isLoadingInspect, setIsLoadingInspect] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ImageSummary | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [isPruneOpen, setIsPruneOpen] = useState(false);
  const [isPruneBuildCacheOpen, setIsPruneBuildCacheOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterUsage, setFilterUsage] = useState<"all" | "in_use" | "unused">("all");

  const {
    data: images = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["images"],
    queryFn: api.images.list,
  });

  const handlePull = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetRef = ref.trim();
    if (!targetRef) return;

    setIsPulling(true);
    setPullProgress({});
    setPullStatusText(`Iniciando download de ${targetRef}...`);

    try {
      await api.images.pullStream(targetRef, (event: ImagePullProgress) => {
        if (event.id) {
          setPullProgress((prev) => ({
            ...prev,
            [event.id!]: {
              status: event.status || "",
              current: event.progressDetail?.current,
              total: event.progressDetail?.total,
            },
          }));
        } else if (event.status) {
          setPullStatusText(event.status);
        }
      });

      toast.success(`Imagem ${targetRef} baixada com sucesso!`);
      setRef("");
      setPullProgress({});
      setPullStatusText("");
      void queryClient.invalidateQueries({ queryKey: ["images"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha no download: ${msg}`);
      setPullStatusText(`Erro: ${msg}`);
    } finally {
      setIsPulling(false);
    }
  };

  const handleOpenInspect = async (img: ImageSummary) => {
    setInspectImage(img);
    setIsLoadingInspect(true);
    setInspectData(null);
    setInspectHistory(null);

    try {
      const [inspect, history] = await Promise.all([
        api.images.inspect(img.id),
        api.images.history(img.id).catch(() => []),
      ]);
      setInspectData(inspect);
      setInspectHistory(history);
    } catch (err: unknown) {
      toast.error("Falha ao carregar detalhes da imagem");
    } finally {
      setIsLoadingInspect(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => api.images.remove(id, force),
    onSuccess: (_, vars) => {
      toast.success("Imagem removida com sucesso");
      queryClient.setQueryData<ImageSummary[]>(["images"], (old) =>
        old ? old.filter((img) => img.id !== vars.id) : [],
      );
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["images"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover imagem: ${err.message}`);
    },
  });

  const pruneMutation = useMutation({
    mutationFn: () => api.images.prune(false),
    onSuccess: (data) => {
      const count = data.imagesDeleted?.length || 0;
      toast.success(
        count > 0
          ? `${count} imagens podadas (${formatBytes(data.spaceReclaimed)} liberados)`
          : "Nenhuma imagem não utilizada para podar",
      );
      if (count > 0) {
        queryClient.setQueryData<ImageSummary[]>(["images"], (old) =>
          old ? old.filter((img) => img.inUseBy && img.inUseBy.length > 0) : [],
        );
      }
      setIsPruneOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["images"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao podar imagens: ${err.message}`);
    },
  });

  const pruneBuildCacheMutation = useMutation({
    mutationFn: () => api.images.pruneBuildCache(),
    onSuccess: (data) => {
      const count = data.cachesDeleted?.length || 0;
      toast.success(
        count > 0
          ? `${count} item(ns) de cache de build removidos (${formatBytes(data.spaceReclaimed)} liberados)`
          : "Nenhum cache de build residual para limpar",
      );
      setIsPruneBuildCacheOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["images"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao limpar cache de build: ${err.message}`);
    },
  });

  const inUseCount = useMemo(
    () => images.filter((img) => img.inUseBy && img.inUseBy.length > 0).length,
    [images],
  );
  const unusedCount = useMemo(
    () => images.filter((img) => !img.inUseBy || img.inUseBy.length === 0).length,
    [images],
  );

  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      const isInUse = Boolean(img.inUseBy && img.inUseBy.length > 0);
      if (filterUsage === "in_use" && !isInUse) return false;
      if (filterUsage === "unused" && isInUse) return false;

      const term = search.toLowerCase().trim();
      if (!term) return true;

      return (
        img.repoTags.some((t) => t.toLowerCase().includes(term)) ||
        img.id.toLowerCase().includes(term) ||
        (img.inUseBy && img.inUseBy.some((c) => c.name.toLowerCase().includes(term)))
      );
    });
  }, [images, filterUsage, search]);

  return (
    <>
      <PageHeader
        title="Imagens"
        subtitle={`${images.length} imagens no host local`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
                  disabled={pruneMutation.isPending || pruneBuildCacheMutation.isPending}
                >
                  {pruneMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin text-destructive" />
                  ) : (
                    <Scissors className="size-4" />
                  )}
                  <span>Podar <span className="hidden sm:inline">imagens órfãs</span></span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPruneBuildCacheOpen(true)}
                  disabled={pruneMutation.isPending || pruneBuildCacheMutation.isPending}
                  className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                >
                  {pruneBuildCacheMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin text-amber-500" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  <span>Limpar <span className="hidden sm:inline">cache de build</span></span>
                </Button>
              </>
            )}
          </div>
        }
      />

      <Panel className="mb-6 p-5">
        <p className="mb-3 text-sm font-medium">
          Baixar imagem de registro (Docker Hub, GHCR, etc.)
        </p>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handlePull}>
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="ex.: nginx:alpine, redis:7, ghcr.io/owner/repo:v1"
            className="font-mono text-xs"
            disabled={isPulling || !isOperator}
          />
          <Button type="submit" disabled={isPulling || !isOperator || !ref.trim()}>
            {isPulling ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Baixando...
              </>
            ) : (
              <>
                <Download className="size-4" /> Baixar
              </>
            )}
          </Button>
        </form>

        {(isPulling || pullStatusText) && (
          <div className="mt-4 rounded-lg border bg-surface p-4 text-xs font-mono">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-foreground flex items-center gap-2">
                {isPulling ? (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                )}
                {pullStatusText || "Processando camadas..."}
              </span>
            </div>

            {Object.keys(pullProgress).length > 0 && (
              <div className="space-y-2 mt-3 max-h-48 overflow-y-auto pr-1">
                {Object.entries(pullProgress).map(([layerId, item]) => {
                  const percent =
                    item.total && item.current
                      ? Math.round((item.current / item.total) * 100)
                      : item.status.includes("Complete")
                        ? 100
                        : 0;

                  return (
                    <div key={layerId} className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{layerId}</span>
                        <span>
                          {item.status}{" "}
                          {item.total
                            ? `(${formatBytes(item.current || 0)} / ${formatBytes(item.total)})`
                            : ""}
                        </span>
                      </div>
                      <Progress value={percent} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Divisórias Estilizadas tipo Fichário e Busca */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-surface/50 p-1 backdrop-blur">
          <button
            type="button"
            onClick={() => setFilterUsage("all")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              filterUsage === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <span>Todas as Imagens</span>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px] font-mono",
                filterUsage === "all"
                  ? "border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface text-muted-foreground",
              )}
            >
              {images.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setFilterUsage("in_use")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
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
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              filterUsage === "unused"
                ? "bg-amber-500 text-black font-semibold shadow-sm"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-400" />
              Não Utilizadas / Órfãs
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
            placeholder="Filtrar por tag, ID ou container..."
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
            <p className="font-medium">Podando imagens órfãs no host Docker...</p>
            <p className="text-xs text-muted-foreground">
              O daemon do Docker está removendo imagens sem containers associados e liberando espaço
              em disco. Aguarde um instante.
            </p>
          </div>
        </div>
      )}

      {pruneBuildCacheMutation.isPending && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500">
          <Loader2 className="size-5 shrink-0 animate-spin" />
          <div>
            <p className="font-medium">Limpando cache de compilação BuildKit...</p>
            <p className="text-xs text-muted-foreground">
              Removendo snapshots e camadas residuais de build. Isso pode levar alguns segundos
              dependendo do tamanho do cache.
            </p>
          </div>
        </div>
      )}

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro ao carregar imagens</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Não foi possível comunicar com o daemon do Docker."}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i} className="p-5">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-5 w-48 mb-1" />
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-3 w-32" />
            </Panel>
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <Panel className="p-12 text-center text-muted-foreground">
          <Layers className="mx-auto size-10 mb-3 opacity-40" />
          <p className="text-base font-medium">Nenhuma imagem Docker encontrada</p>
          <p className="text-sm mt-1">
            {search || filterUsage !== "all"
              ? "Tente ajustar os filtros ou a busca acima."
              : "Baixe uma imagem utilizando o campo acima para começar."}
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredImages.map((i) => {
            const primaryTag = i.repoTags[0] || "<none>:<none>";
            const [repo, tag] = primaryTag.includes(":")
              ? [
                  primaryTag.slice(0, primaryTag.lastIndexOf(":")),
                  primaryTag.slice(primaryTag.lastIndexOf(":") + 1),
                ]
              : [primaryTag, "latest"];

            const isGhcr = repo.includes("ghcr.io");
            const isDockerHub = !isGhcr && !repo.includes(".");
            const shortId = i.id.replace(/^sha256:/, "").slice(0, 12);

            return (
              <Panel
                key={i.id}
                className="p-5 flex flex-col justify-between hover:border-foreground/20 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {isGhcr ? "GHCR" : isDockerHub ? "Docker Hub" : "Registro"}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">{shortId}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground"
                        onClick={() => {
                          void navigator.clipboard.writeText(i.id);
                          toast.success("ID copiado");
                        }}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                  </div>

                  <p className="mt-3 truncate font-mono text-sm font-semibold" title={repo}>
                    {repo}
                  </p>
                  <p className="font-mono text-xs text-primary font-medium">:{tag}</p>

                  {i.repoTags.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {i.repoTags.slice(1).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Taxação / Quem está utilizando a imagem */}
                  <div className="mt-3 rounded-lg border border-border/70 bg-surface/60 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Box className="size-3 text-primary" />
                        Uso por Containers
                      </span>
                      {i.inUseBy && i.inUseBy.length > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono"
                        >
                          {i.inUseBy.length} container(s)
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-mono"
                        >
                          Não utilizada (órfã)
                        </Badge>
                      )}
                    </div>

                    {i.inUseBy && i.inUseBy.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                        {i.inUseBy.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background/80 px-2 py-0.5 font-mono text-[11px] text-foreground hover:border-primary/40 transition-colors"
                            title={`Container: ${c.name} (${c.state || "ativo"})`}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full shrink-0",
                                c.state === "running" ? "bg-emerald-400" : "bg-slate-400",
                              )}
                            />
                            <span className="truncate max-w-[140px]">{c.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">
                        Nenhum container ativo ou parado utiliza esta imagem. Pronta para poda.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t pt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <HardDrive className="size-3.5" />
                      {formatBytes(i.size)}
                    </span>
                    <span>{formatDate(i.created)}</span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleOpenInspect(i)}
                    >
                      <Eye className="size-3.5" /> Inspecionar
                    </Button>
                    {isOperator && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={deleteMutation.isPending && deleteMutation.variables?.id === i.id}
                        onClick={() => {
                          setDeleteTarget(i);
                          setForceDelete(false);
                        }}
                      >
                        {deleteMutation.isPending && deleteMutation.variables?.id === i.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Inspect Modal */}
      <Dialog open={Boolean(inspectImage)} onOpenChange={(open) => !open && setInspectImage(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-base truncate">
              {inspectImage?.repoTags[0] || inspectImage?.id}
            </DialogTitle>
            <DialogDescription>
              Camadas e metadados inspecionados do Docker Engine
            </DialogDescription>
          </DialogHeader>

          {isLoadingInspect ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto size-6 animate-spin mb-2 text-primary" />
              Carregando metadados da imagem...
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto pr-1">
              {inspectHistory && inspectHistory.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Histórico de Camadas ({inspectHistory.length})
                  </h4>
                  <div className="space-y-1.5 rounded-lg border bg-surface p-3 font-mono text-xs">
                    {inspectHistory.map((h, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-4 border-b pb-1.5 last:border-0 last:pb-0"
                      >
                        <div
                          className="truncate text-muted-foreground"
                          title={String(h["CreatedBy"] || "")}
                        >
                          {String(h["CreatedBy"] || "").replace(/^\/bin\/sh -c #(nop) /, "")}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-medium text-foreground">
                            {formatBytes(Number(h["Size"] || 0))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  JSON de Inspeção
                </h4>
                <pre className="max-h-72 overflow-auto rounded-lg border bg-surface p-3 font-mono text-[11px]">
                  {JSON.stringify(inspectData, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover imagem Docker?</AlertDialogTitle>
            <AlertDialogDescription>
              A imagem{" "}
              <strong className="font-mono text-foreground">
                {deleteTarget?.repoTags[0] || deleteTarget?.id}
              </strong>{" "}
              será excluída do host.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="force-delete"
              checked={forceDelete}
              onCheckedChange={(v) => setForceDelete(Boolean(v))}
            />
            <label
              htmlFor="force-delete"
              className="text-xs font-medium leading-none text-muted-foreground cursor-pointer"
            >
              Forçar remoção (-f / force) mesmo se associada a tags secundárias
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate({ id: deleteTarget.id, force: forceDelete });
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

      {/* Prune Confirmation */}
      <AlertDialog open={isPruneOpen} onOpenChange={setIsPruneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Podar imagens não utilizadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá todas as imagens não associadas a nenhum container em execução ou
              parado, liberando espaço em disco. Imagens ativas não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pruneMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pruneMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                pruneMutation.mutate();
              }}
            >
              {pruneMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Podando imagens...
                </>
              ) : (
                "Confirmar poda"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prune Build Cache Confirmation */}
      <AlertDialog open={isPruneBuildCacheOpen} onOpenChange={setIsPruneBuildCacheOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" />
              Limpar cache de build do Docker?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>
                Esta ação executa{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  docker builder prune
                </code>
                , removendo camadas intermediárias e caches de compilação BuildKit armazenados pelo
                Docker Engine.
              </div>
              <div className="text-xs text-muted-foreground">
                Liberará espaço em disco do host. Suas imagens concluídas e containers ativos não
                serão afetados.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pruneBuildCacheMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-black hover:bg-amber-400 font-medium"
              disabled={pruneBuildCacheMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                pruneBuildCacheMutation.mutate();
              }}
            >
              {pruneBuildCacheMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin text-black" />
                  Limpando cache...
                </>
              ) : (
                "Sim, limpar cache"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
