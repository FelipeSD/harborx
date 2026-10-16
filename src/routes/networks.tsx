import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Lock,
  Network as NetworkIcon,
  AlertCircle,
  Trash2,
  Eye,
  Link as LinkIcon,
  Unlink,
  Loader2,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { CreateNetworkRequest, NetworkSummary } from "../../shared/types";

export const Route = createFileRoute("/networks")({
  head: () => ({
    meta: [
      { title: "Redes Docker — HarborX" },
      {
        name: "description",
        content: "Crie, gerencie e conecte containers a redes Docker bridge, macvlan e overlay.",
      },
      { property: "og:title", content: "Redes Docker — HarborX" },
    ],
  }),
  component: NetworksPage,
});

const BUILTIN_NETWORKS = ["bridge", "host", "none"];

function NetworksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOperator = user?.role === "admin" || user?.role === "operator";

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState<"bridge" | "overlay" | "macvlan" | "ipvlan">("bridge");
  const [newSubnet, setNewSubnet] = useState("");
  const [newGateway, setNewGateway] = useState("");
  const [newInternal, setNewInternal] = useState(false);

  const [inspectNetwork, setInspectNetwork] = useState<NetworkSummary | null>(null);
  const [inspectData, setInspectData] = useState<Record<string, unknown> | null>(null);
  const [isLoadingInspect, setIsLoadingInspect] = useState(false);

  const [connectNetwork, setConnectNetwork] = useState<NetworkSummary | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [customIp, setCustomIp] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<NetworkSummary | null>(null);
  const [search, setSearch] = useState("");
  const [filterUsage, setFilterUsage] = useState<"all" | "in_use" | "unused">("all");

  const {
    data: networks = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["networks"],
    queryFn: api.networks.list,
  });

  const { data: containers = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: api.containers.list,
    enabled: Boolean(connectNetwork),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateNetworkRequest) => api.networks.create(data),
    onSuccess: (res) => {
      toast.success(`Rede '${res.name}' criada com sucesso!`);
      setIsCreateOpen(false);
      setNewName("");
      setNewSubnet("");
      setNewGateway("");
      setNewInternal(false);
      void queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao criar rede: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.networks.remove(id),
    onSuccess: (res, id) => {
      toast.success(`Rede '${res.name || id}' removida.`);
      queryClient.setQueryData<NetworkSummary[]>(["networks"], (old) =>
        old ? old.filter((n) => n.id !== id) : [],
      );
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao remover rede: ${err.message}`);
    },
  });

  const connectMutation = useMutation({
    mutationFn: ({ netId, container, ip }: { netId: string; container: string; ip?: string }) =>
      api.networks.connect(netId, { container, ipv4Address: ip || undefined }),
    onSuccess: () => {
      toast.success("Container conectado à rede com sucesso!");
      setConnectNetwork(null);
      setSelectedContainerId("");
      setCustomIp("");
      void queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao conectar container: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: ({ netId, container }: { netId: string; container: string }) =>
      api.networks.disconnect(netId, { container, force: true }),
    onSuccess: () => {
      toast.success("Container desconectado da rede.");
      void queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao desconectar: ${err.message}`);
    },
  });

  const handleOpenInspect = async (net: NetworkSummary) => {
    setInspectNetwork(net);
    setIsLoadingInspect(true);
    setInspectData(null);
    try {
      const data = await api.networks.inspect(net.id);
      setInspectData(data);
    } catch {
      toast.error("Falha ao carregar detalhes da rede");
    } finally {
      setIsLoadingInspect(false);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Informe o nome da rede");
      return;
    }
    createMutation.mutate({
      name: newName.trim(),
      driver: newDriver,
      subnet: newSubnet.trim() || undefined,
      gateway: newGateway.trim() || undefined,
      internal: newInternal,
    });
  };

  const inUseCount = useMemo(
    () =>
      networks.filter((n) => {
        const hasInUse = n.inUseBy && n.inUseBy.length > 0;
        const hasContainers = n.containers && Object.keys(n.containers).length > 0;
        return hasInUse || hasContainers;
      }).length,
    [networks],
  );

  const unusedCount = useMemo(
    () =>
      networks.filter((n) => {
        const hasInUse = n.inUseBy && n.inUseBy.length > 0;
        const hasContainers = n.containers && Object.keys(n.containers).length > 0;
        return !hasInUse && !hasContainers;
      }).length,
    [networks],
  );

  const filteredNetworks = useMemo(() => {
    return networks.filter((n) => {
      const hasInUse = Boolean(
        (n.inUseBy && n.inUseBy.length > 0) ||
        (n.containers && Object.keys(n.containers).length > 0),
      );
      if (filterUsage === "in_use" && !hasInUse) return false;
      if (filterUsage === "unused" && hasInUse) return false;

      const term = search.toLowerCase().trim();
      if (!term) return true;

      const matchesSubnet =
        n.ipam?.config?.some(
          (c) =>
            (c.subnet && c.subnet.toLowerCase().includes(term)) ||
            (c.gateway && c.gateway.toLowerCase().includes(term)),
        ) || false;

      const matchesContainers =
        (n.inUseBy && n.inUseBy.some((c) => c.name.toLowerCase().includes(term))) ||
        (n.containers &&
          Object.values(n.containers).some((c) => c.name.toLowerCase().includes(term)));

      return (
        n.name.toLowerCase().includes(term) ||
        n.driver.toLowerCase().includes(term) ||
        n.id.toLowerCase().includes(term) ||
        matchesSubnet ||
        matchesContainers
      );
    });
  }, [networks, filterUsage, search]);

  return (
    <>
      <PageHeader
        title="Redes"
        subtitle={`${networks.length} redes configuradas no Docker Engine`}
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
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" /> Nova rede
              </Button>
            )}
          </div>
        }
      />

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
            <span>Todas as Redes</span>
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[10px] font-mono",
                filterUsage === "all"
                  ? "border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground"
                  : "bg-surface text-muted-foreground",
              )}
            >
              {networks.length}
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
              Com Containers
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
              Vazias / Desconectadas
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
            placeholder="Filtrar por nome, subnet ou container..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro ao carregar redes</AlertTitle>
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
              <th className="px-4 py-3 font-medium">Nome / ID</th>
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 font-medium">Escopo</th>
              <th className="px-4 py-3 font-medium">Subnet / Gateway</th>
              <th className="px-4 py-3 font-medium">Containers Conectados</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-14" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-12" />
                  </td>
                </tr>
              ))
            ) : filteredNetworks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <NetworkIcon className="mx-auto size-8 mb-2 opacity-40" />
                  Nenhuma rede Docker encontrada.
                  {search || filterUsage !== "all" ? (
                    <p className="text-xs mt-1">Tente ajustar os filtros ou a busca acima.</p>
                  ) : null}
                </td>
              </tr>
            ) : (
              filteredNetworks.map((n) => {
                const isBuiltin = BUILTIN_NETWORKS.includes(n.name.toLowerCase());
                const subnets =
                  n.ipam?.config
                    ?.map((c) => c.subnet)
                    .filter(Boolean)
                    .join(", ") || "—";
                const gateways =
                  n.ipam?.config
                    ?.map((c) => c.gateway)
                    .filter(Boolean)
                    .join(", ") || "—";

                const inUseItems =
                  n.inUseBy && n.inUseBy.length > 0
                    ? n.inUseBy.map((c) => ({ id: c.id, name: c.name, ipv4: c.ipv4 }))
                    : n.containers
                      ? Object.entries(n.containers).map(([cid, info]) => ({
                          id: cid,
                          name: info.name,
                          ipv4: info.ipv4Address ? info.ipv4Address.split("/")[0] : undefined,
                        }))
                      : [];

                return (
                  <tr
                    key={n.id}
                    className="border-b last:border-0 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span>{n.name}</span>
                        {n.internal && (
                          <span title="Rede interna isolada">
                            <Lock className="size-3 text-muted-foreground" />
                          </span>
                        )}
                        {isBuiltin && (
                          <Badge variant="secondary" className="text-[10px] py-0 font-normal">
                            padrão
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {n.id.slice(0, 12)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                        {n.driver}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{n.scope}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div>{subnets}</div>
                      {gateways !== "—" && (
                        <div className="text-[11px] text-muted-foreground">GW: {gateways}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {inUseItems.length === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] font-mono"
                        >
                          Vazia (0 containers)
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-w-sm">
                          {inUseItems.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 group"
                            >
                              <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span className="font-medium text-foreground">{item.name}</span>
                              {item.ipv4 && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  ({item.ipv4})
                                </span>
                              )}
                              {isOperator && !isBuiltin && (
                                <button
                                  type="button"
                                  title="Desconectar da rede"
                                  className="text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                                  onClick={() =>
                                    disconnectMutation.mutate({ netId: n.id, container: item.id })
                                  }
                                >
                                  <Unlink className="size-2.5" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isOperator && !isBuiltin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Conectar Container"
                            onClick={() => {
                              setConnectNetwork(n);
                              setSelectedContainerId("");
                              setCustomIp("");
                            }}
                          >
                            <LinkIcon className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Inspecionar"
                          onClick={() => handleOpenInspect(n)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {isOperator && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isBuiltin}
                            title={
                              isBuiltin ? "Redes padrão não podem ser removidas" : "Remover rede"
                            }
                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                            onClick={() => setDeleteTarget(n)}
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

      {/* Create Network Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar nova rede Docker</DialogTitle>
            <DialogDescription>
              Configure o driver de rede e faixas de IP isoladas para seus containers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium">Nome da Rede *</label>
              <Input
                placeholder="ex.: app-network"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 font-mono text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Driver</label>
                <Select
                  value={newDriver}
                  onValueChange={(v) =>
                    setNewDriver(v as "bridge" | "overlay" | "macvlan" | "ipvlan")
                  }
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bridge">bridge (padrão)</SelectItem>
                    <SelectItem value="overlay">overlay (swarm)</SelectItem>
                    <SelectItem value="macvlan">macvlan</SelectItem>
                    <SelectItem value="ipvlan">ipvlan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium">Subnet (CIDR)</label>
                <Input
                  placeholder="ex.: 172.28.0.0/16"
                  value={newSubnet}
                  onChange={(e) => setNewSubnet(e.target.value)}
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Gateway (opcional)</label>
              <Input
                placeholder="ex.: 172.28.0.1"
                value={newGateway}
                onChange={(e) => setNewGateway(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="internal-net"
                checked={newInternal}
                onCheckedChange={(v) => setNewInternal(Boolean(v))}
              />
              <label
                htmlFor="internal-net"
                className="text-xs font-medium text-muted-foreground cursor-pointer"
              >
                Isolar rede interna (bloquear saída para internet)
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !newName.trim()}>
                {createMutation.isPending ? "Criando..." : "Criar rede"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Connect Container Dialog */}
      <Dialog
        open={Boolean(connectNetwork)}
        onOpenChange={(open) => !open && setConnectNetwork(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar container à rede</DialogTitle>
            <DialogDescription>
              Selecione o container que deseja associar à rede{" "}
              <strong className="font-mono text-foreground">{connectNetwork?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium">Container</label>
              <Select value={selectedContainerId} onValueChange={setSelectedContainerId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Selecione um container..." />
                </SelectTrigger>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.image})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium">IP Fixo na rede (opcional)</label>
              <Input
                placeholder="ex.: 172.28.0.50"
                value={customIp}
                onChange={(e) => setCustomIp(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectNetwork(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!selectedContainerId || connectMutation.isPending}
              onClick={() => {
                if (connectNetwork && selectedContainerId) {
                  connectMutation.mutate({
                    netId: connectNetwork.id,
                    container: selectedContainerId,
                    ip: customIp.trim() || undefined,
                  });
                }
              }}
            >
              {connectMutation.isPending ? "Conectando..." : "Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspect Dialog */}
      <Dialog
        open={Boolean(inspectNetwork)}
        onOpenChange={(open) => !open && setInspectNetwork(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">Rede: {inspectNetwork?.name}</DialogTitle>
            <DialogDescription>
              Configurações completas de IPAM e endpoints do Docker
            </DialogDescription>
          </DialogHeader>

          {isLoadingInspect ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto size-6 animate-spin mb-2 text-primary" />
              Carregando detalhes da rede...
            </div>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-surface p-3 font-mono text-[11px]">
              {JSON.stringify(inspectData, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Network Alert */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover rede Docker?</AlertDialogTitle>
            <AlertDialogDescription>
              A rede <strong className="font-mono text-foreground">{deleteTarget?.name}</strong>{" "}
              será excluída. Containers conectados serão desvinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
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
    </>
  );
}
