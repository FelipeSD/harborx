import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Plus,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Pause,
  Trash2,
  Copy,
  Terminal,
  FileText,
  Activity,
  Layers,
  Search,
  AlertCircle,
  Check,
  CheckSquare,
  Square as SquareOutline,
  Code,
  Shield,
  Loader2,
  Table as TableIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ContainerAction, ContainerSummary } from "../../shared/types";
import { StackBinderView, type StackGroup } from "@/components/containers/StackBinderView";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CreateContainerDialog } from "@/components/containers/CreateContainerDialog";
import { LogViewer } from "@/components/containers/LogViewer";
import { TerminalViewer } from "@/components/containers/TerminalViewer";
import { ContainerStatsViewer } from "@/components/containers/ContainerStatsViewer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/containers")({
  head: () => ({
    meta: [
      { title: "Containers — HarborX" },
      { name: "description", content: "Gerencie e monitore containers Docker em execução." },
      { property: "og:title", content: "Containers — HarborX" },
    ],
  }),
  component: ContainersPage,
});

function formatPorts(ports: ContainerSummary["ports"]): string {
  if (!ports || ports.length === 0) return "—";
  return ports
    .map((p) =>
      p.publicPort ? `${p.publicPort}:${p.privatePort}/${p.type}` : `${p.privatePort}/${p.type}`,
    )
    .join(", ");
}

function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ContainersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isViewer = user?.role === "viewer";

  const [search, setSearch] = useState("");
  const [filterStack, setFilterStack] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [viewMode, setViewMode] = useState<"binder" | "table">("binder");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<ContainerSummary | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Confirmações
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmRemoveBatch, setConfirmRemoveBatch] = useState(false);
  const [confirmRecreateId, setConfirmRecreateId] = useState<string | null>(null);
  const [removeVolumes, setRemoveVolumes] = useState(false);
  const [isCopiedJson, setIsCopiedJson] = useState(false);

  const {
    data: containers = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["containers"],
    queryFn: api.containers.list,
    refetchInterval: 5000,
  });

  // Query para obter dados do inspect quando o container estiver selecionado
  const { data: inspectData, isLoading: isInspectLoading } = useQuery({
    queryKey: ["containerInspect", selectedContainer?.id],
    queryFn: () => (selectedContainer ? api.containers.inspect(selectedContainer.id) : null),
    enabled: Boolean(selectedContainer?.id),
  });

  // Mutações de ação individual
  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ContainerAction }) =>
      api.containers.action(id, action),
    onSuccess: (_, vars) => {
      toast.success(`Ação "${vars.action}" executada com sucesso!`);
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao executar ação.");
    },
  });

  // Mutação para remoção
  const removeMutation = useMutation({
    mutationFn: ({ id, volumes }: { id: string; volumes: boolean }) =>
      api.containers.remove(id, { force: true, volumes }),
    onSuccess: () => {
      toast.success("Container removido com sucesso!");
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
      setConfirmRemoveId(null);
      if (selectedContainer) setSelectedContainer(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao remover container.");
    },
  });

  // Mutação para recriação
  const recreateMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => api.containers.recreate(id),
    onSuccess: () => {
      toast.success("Container recriado com sucesso!");
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
      setConfirmRecreateId(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao recriar container.");
    },
  });

  // Mutação para duplicação
  const duplicateMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => api.containers.duplicate(id),
    onSuccess: (data) => {
      toast.success(`Container duplicado com sucesso como "${data.name}"!`);
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao duplicar container.");
    },
  });

  // Mutação de lote
  const batchMutation = useMutation({
    mutationFn: (action: ContainerAction) =>
      api.containers.batch({
        ids: selectedIds,
        action,
        force: true,
        volumes: removeVolumes,
      }),
    onSuccess: (data, action) => {
      const successes = data.results.filter((r) => r.success).length;
      const failures = data.results.filter((r) => !r.success);

      if (failures.length === 0) {
        toast.success(`Ação "${action}" aplicada com sucesso a ${successes} containers.`);
      } else {
        toast.warning(
          `Ação "${action}": ${successes} tiveram sucesso, ${failures.length} falharam. (${failures[0]?.error})`,
        );
      }

      setSelectedIds([]);
      setConfirmRemoveBatch(false);
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha na ação em lote.");
    },
  });

  const stacks = useMemo(() => {
    const set = new Set<string>();
    containers.forEach((c) => {
      if (c.stack) set.add(c.stack);
    });
    return Array.from(set);
  }, [containers]);

  const filteredList = useMemo(() => {
    return containers.filter((c) => {
      const matchesStack = filterStack === "all" || c.stack === filterStack;
      const matchesState =
        filterState === "all" ||
        (filterState === "running" && c.state === "running") ||
        (filterState === "stopped" &&
          (c.state === "exited" || c.state === "stopped" || c.state === "created"));
      const term = search.toLowerCase().trim();
      const matchesSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.image.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term);
      return matchesStack && matchesState && matchesSearch;
    });
  }, [containers, filterStack, filterState, search]);

  const groupedByStack = useMemo<StackGroup[]>(() => {
    const stackMap = new Map<string, ContainerSummary[]>();
    const standalone: ContainerSummary[] = [];

    filteredList.forEach((c) => {
      if (c.stack) {
        const existing = stackMap.get(c.stack) || [];
        existing.push(c);
        stackMap.set(c.stack, existing);
      } else {
        standalone.push(c);
      }
    });

    const groups: StackGroup[] = [];
    const sortedStackNames = Array.from(stackMap.keys()).sort();
    sortedStackNames.forEach((stackName) => {
      const items = stackMap.get(stackName)!;
      groups.push({
        stackName,
        isStandalone: false,
        containers: items,
        runningCount: items.filter((c) => c.state === "running").length,
        stoppedCount: items.filter((c) => c.state !== "running").length,
      });
    });

    if (standalone.length > 0) {
      groups.push({
        stackName: "Containers Avulsos (Sem Stack)",
        isStandalone: true,
        containers: standalone,
        runningCount: standalone.filter((c) => c.state === "running").length,
        stoppedCount: standalone.filter((c) => c.state !== "running").length,
      });
    }

    return groups;
  }, [filteredList]);

  const handleStackAction = (containerIds: string[], action: ContainerAction) => {
    api.containers
      .batch({
        ids: containerIds,
        action,
        force: true,
      })
      .then((data) => {
        const successes = data.results.filter((r) => r.success).length;
        const failures = data.results.filter((r) => !r.success);

        if (failures.length === 0) {
          toast.success(
            `Ação "${action}" aplicada com sucesso a ${successes} container(s) da stack.`,
          );
        } else {
          toast.warning(
            `Ação "${action}": ${successes} com sucesso, ${failures.length} falha(s).`,
          );
        }
        void queryClient.invalidateQueries({ queryKey: ["containers"] });
        void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Falha ao executar ação na stack.");
      });
  };

  const allFilteredSelected =
    filteredList.length > 0 && filteredList.every((c) => selectedIds.includes(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const copyJson = (data: unknown) => {
    if (!data) return;
    void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setIsCopiedJson(true);
    toast.success("JSON copiado para a área de transferência!");
    setTimeout(() => setIsCopiedJson(false), 2000);
  };

  return (
    <>
      <PageHeader
        title="Containers"
        subtitle={`${containers.length} containers no host Docker`}
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
            {!isViewer && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" /> Novo container
              </Button>
            )}
          </div>
        }
      />

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Falha na conexão com o Docker</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Não foi possível carregar a lista de containers."}
          </AlertDescription>
        </Alert>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Alternador de Modo de Visualização */}
          <div className="flex items-center rounded-lg border border-border/80 bg-surface/60 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("binder")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "binder"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="size-3.5" />
              <span>Fichário de Stacks</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "table"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TableIcon className="size-3.5" />
              <span>Tabela</span>
            </button>
          </div>

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          <button
            onClick={() => {
              setFilterStack("all");
              setFilterState("all");
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-mono transition-colors",
              filterStack === "all" && filterState === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            todos ({containers.length})
          </button>
          <button
            onClick={() => setFilterState(filterState === "running" ? "all" : "running")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-mono transition-colors",
              filterState === "running"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            rodando ({containers.filter((c) => c.state === "running").length})
          </button>
          <button
            onClick={() => setFilterState(filterState === "stopped" ? "all" : "stopped")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-mono transition-colors",
              filterState === "stopped"
                ? "border-amber-500 bg-amber-500/10 text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            parados ({containers.filter((c) => c.state !== "running").length})
          </button>
          {stacks.map((stk) => (
            <button
              key={stk}
              onClick={() => setFilterStack(filterStack === stk ? "all" : stk)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-mono transition-colors",
                filterStack === stk
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              stack: {stk}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar por nome ou imagem…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {/* Barra de Ações em Lote */}
      {selectedIds.length > 0 && !isViewer && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <CheckSquare className="size-4" />
            <span>{selectedIds.length} container(s) selecionado(s)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => batchMutation.mutate("start")}
              disabled={batchMutation.isPending}
            >
              <Play className="size-3.5 mr-1 text-emerald-500" /> Iniciar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => batchMutation.mutate("stop")}
              disabled={batchMutation.isPending}
            >
              <Square className="size-3.5 mr-1 text-amber-500" /> Parar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => batchMutation.mutate("restart")}
              disabled={batchMutation.isPending}
            >
              <RotateCw className="size-3.5 mr-1 text-blue-400" /> Reiniciar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmRemoveBatch(true)}
              disabled={batchMutation.isPending}
            >
              <Trash2 className="size-3.5 mr-1" /> Remover selecionados
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {viewMode === "binder" ? (
        isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Panel key={i} className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-24 w-full" />
              </Panel>
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <Panel className="p-12 text-center text-muted-foreground">
            <Boxes className="mx-auto size-10 mb-3 opacity-40" />
            <p className="text-base font-medium">Nenhum container encontrado</p>
            <p className="text-sm mt-1">
              {search || filterStack !== "all" || filterState !== "all"
                ? "Tente ajustar os filtros ou a busca."
                : "Crie um container ou inicie uma stack com docker compose."}
            </p>
          </Panel>
        ) : (
          <StackBinderView
            groups={groupedByStack}
            selectedIds={selectedIds}
            toggleSelectOne={toggleSelectOne}
            onSelectContainer={(c) => setSelectedContainer(c)}
            onAction={(id, action) => actionMutation.mutate({ id, action })}
            onStackAction={handleStackAction}
            isViewer={isViewer}
            isActionPending={actionMutation.isPending || batchMutation.isPending}
            formatPorts={formatPorts}
            formatDate={formatDate}
          />
        )
      ) : (
        /* Tabela de Containers */
        <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {!isViewer && (
                <th className="w-10 px-4 py-3">
                  <button
                    onClick={toggleSelectAll}
                    className="grid size-4 place-items-center text-muted-foreground hover:text-foreground"
                    title={allFilteredSelected ? "Desmarcar todos" : "Selecionar todos"}
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="size-4 text-primary" />
                    ) : (
                      <SquareOutline className="size-4" />
                    )}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Imagem</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Stack</th>
              <th className="px-4 py-3 font-medium">Portas</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {!isViewer && (
                    <td className="px-4 py-3">
                      <Skeleton className="size-4" />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-36" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="h-8 w-24 ml-auto" />
                  </td>
                </tr>
              ))
            ) : filteredList.length === 0 ? (
              <tr>
                <td
                  colSpan={isViewer ? 7 : 8}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <Boxes className="mx-auto size-8 mb-2 opacity-50" />
                  {search || filterStack !== "all" || filterState !== "all"
                    ? "Nenhum container encontrado com os filtros aplicados."
                    : "Nenhum container Docker encontrado na sua máquina."}
                </td>
              </tr>
            ) : (
              filteredList.map((c) => {
                const isSelected = selectedIds.includes(c.id);
                const isRunning = c.state === "running";
                const isPaused = c.state === "paused";

                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b last:border-0 hover:bg-accent/40 transition-colors",
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
                        onClick={() => setSelectedContainer(c)}
                        className="font-medium hover:text-primary transition-colors text-left"
                      >
                        {c.name}
                      </button>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {c.id.slice(0, 12)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-xs truncate max-w-[200px] block"
                        title={c.image}
                      >
                        {c.image}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={c.state} />
                    </td>
                    <td className="px-4 py-3">
                      {c.stack ? (
                        <Badge variant="outline" className="font-mono text-[11px] gap-1">
                          <Layers className="size-3 text-primary" />
                          {c.stack}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatPorts(c.ports)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatDate(c.created)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!isViewer ? (
                          <>
                            {isRunning ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-amber-500 hover:text-amber-400"
                                title="Parar"
                                onClick={() => actionMutation.mutate({ id: c.id, action: "stop" })}
                                disabled={actionMutation.isPending}
                              >
                                <Square className="size-3.5" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-emerald-500 hover:text-emerald-400"
                                title="Iniciar"
                                onClick={() => actionMutation.mutate({ id: c.id, action: "start" })}
                                disabled={actionMutation.isPending}
                              >
                                <Play className="size-3.5" />
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-blue-400 hover:text-blue-300"
                              title="Reiniciar"
                              onClick={() => actionMutation.mutate({ id: c.id, action: "restart" })}
                              disabled={actionMutation.isPending}
                            >
                              <RotateCw className="size-3.5" />
                            </Button>

                            {isRunning && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:text-foreground"
                                title={isPaused ? "Retomar (unpause)" : "Pausar"}
                                onClick={() =>
                                  actionMutation.mutate({
                                    id: c.id,
                                    action: isPaused ? "unpause" : "pause",
                                  })
                                }
                                disabled={actionMutation.isPending}
                              >
                                <Pause className="size-3.5" />
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:text-destructive/80"
                              title="Remover"
                              onClick={() => setConfirmRemoveId(c.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Leitura
                          </Badge>
                        )}

                        <Button size="sm" variant="ghost" onClick={() => setSelectedContainer(c)}>
                          Detalhes
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>
      )}

      {/* Drawer de Detalhes com Abas */}
      <Sheet open={!!selectedContainer} onOpenChange={(o) => !o && setSelectedContainer(null)}>
        <SheetContent className="w-full sm:max-w-4xl lg:max-w-5xl overflow-y-auto">
          {selectedContainer && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <span className="truncate">{selectedContainer.name}</span>
                  <StatusPill status={selectedContainer.state} />
                </SheetTitle>
              </SheetHeader>

              <Tabs defaultValue="overview" className="mt-6 w-full">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                  <TabsTrigger value="inspect">Inspecionar</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="console">Console</TabsTrigger>
                  <TabsTrigger value="stats">Métricas</TabsTrigger>
                </TabsList>

                {/* Aba 1: Visão Geral */}
                <TabsContent value="overview" className="space-y-5 pt-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["ID do Container", selectedContainer.id.slice(0, 16)],
                      ["Imagem", selectedContainer.image],
                      ["Status", selectedContainer.status],
                      ["Stack Compose", selectedContainer.stack ?? "—"],
                      ["Portas", formatPorts(selectedContainer.ports)],
                      ["Criado em", formatDate(selectedContainer.created)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg border bg-surface p-3">
                        <dt className="text-xs text-muted-foreground">{k}</dt>
                        <dd className="mt-1 truncate font-mono text-xs" title={v}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <div>
                    <p className="text-xs font-medium mb-1.5 text-muted-foreground">
                      Comando de execução
                    </p>
                    <pre className="overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                      {selectedContainer.command || "Nenhum comando explícito"}
                    </pre>
                  </div>

                  {!isViewer && (
                    <div className="border-t pt-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Ações do Container
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedContainer.state === "running" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              actionMutation.mutate({ id: selectedContainer.id, action: "stop" })
                            }
                            disabled={actionMutation.isPending}
                          >
                            <Square className="size-3.5 mr-1 text-amber-500" /> Parar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              actionMutation.mutate({ id: selectedContainer.id, action: "start" })
                            }
                            disabled={actionMutation.isPending}
                          >
                            <Play className="size-3.5 mr-1 text-emerald-500" /> Iniciar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            actionMutation.mutate({ id: selectedContainer.id, action: "restart" })
                          }
                          disabled={actionMutation.isPending}
                        >
                          <RotateCw className="size-3.5 mr-1 text-blue-400" /> Reiniciar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => duplicateMutation.mutate({ id: selectedContainer.id })}
                          disabled={duplicateMutation.isPending}
                        >
                          <Copy className="size-3.5 mr-1" /> Duplicar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmRecreateId(selectedContainer.id)}
                          disabled={recreateMutation.isPending}
                        >
                          <RotateCw className="size-3.5 mr-1" /> Recriar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirmRemoveId(selectedContainer.id)}
                        >
                          <Trash2 className="size-3.5 mr-1" /> Remover
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Aba 2: Inspecionar JSON */}
                <TabsContent value="inspect" className="space-y-3 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Dados completos do `docker inspect`
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyJson(inspectData)}
                      disabled={!inspectData}
                    >
                      {isCopiedJson ? (
                        <Check className="size-3.5 mr-1 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5 mr-1" />
                      )}
                      {isCopiedJson ? "Copiado!" : "Copiar JSON"}
                    </Button>
                  </div>
                  {isInspectLoading ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      <Loader2 className="mx-auto size-5 animate-spin mb-2" />
                      Carregando inspect do container…
                    </div>
                  ) : (
                    <pre className="max-h-[500px] overflow-auto rounded-lg border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {inspectData ? JSON.stringify(inspectData, null, 2) : "Nenhum dado retornado"}
                    </pre>
                  )}
                </TabsContent>

                {/* Aba 3: Logs */}
                <TabsContent value="logs" className="space-y-4 pt-4">
                  <LogViewer
                    containerId={selectedContainer.id}
                    containerName={selectedContainer.name}
                    className="h-[620px]"
                  />
                </TabsContent>

                {/* Aba 4: Console */}
                <TabsContent value="console" className="space-y-4 pt-4">
                  <TerminalViewer
                    containerId={selectedContainer.id}
                    containerName={selectedContainer.name}
                    containerState={selectedContainer.state}
                  />
                </TabsContent>

                {/* Aba 5: Métricas */}
                <TabsContent value="stats" className="space-y-4 pt-4">
                  <ContainerStatsViewer
                    containerId={selectedContainer.id}
                    containerName={selectedContainer.name}
                    containerState={selectedContainer.state}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog de Criação de Container */}
      <CreateContainerDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {/* AlertDialog de Confirmação de Remoção Individual */}
      <AlertDialog open={!!confirmRemoveId} onOpenChange={(o) => !o && setConfirmRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Container</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este container? Esta ação não pode ser desfeita. Se o
              container estiver em execução, ele será forçadamente encerrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="remove-vols"
              checked={removeVolumes}
              onCheckedChange={(c) => setRemoveVolumes(Boolean(c))}
            />
            <label htmlFor="remove-vols" className="text-xs cursor-pointer">
              Remover também volumes anônimos associados
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemoveId) {
                  removeMutation.mutate({ id: confirmRemoveId, volumes: removeVolumes });
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Remoção em Lote */}
      <AlertDialog open={confirmRemoveBatch} onOpenChange={setConfirmRemoveBatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {selectedIds.length} Container(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover todos os containers selecionados? Esta ação é
              definitiva e forçará o encerramento dos containers em execução.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="batch-remove-vols"
              checked={removeVolumes}
              onCheckedChange={(c) => setRemoveVolumes(Boolean(c))}
            />
            <label htmlFor="batch-remove-vols" className="text-xs cursor-pointer">
              Remover também volumes anônimos associados
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchMutation.mutate("remove")}
            >
              Remover Selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Recriação */}
      <AlertDialog
        open={!!confirmRecreateId}
        onOpenChange={(o) => !o && setConfirmRecreateId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recriar Container</AlertDialogTitle>
            <AlertDialogDescription>
              O container atual será parado, removido e criado novamente preservando nome, portas,
              variáveis de ambiente, redes e volumes configurados. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRecreateId) {
                  recreateMutation.mutate({ id: confirmRecreateId });
                }
              }}
            >
              Recriar Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
