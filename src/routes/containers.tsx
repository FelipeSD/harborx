import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Plus,
  RefreshCw,
  Terminal,
  FileText,
  Search,
  AlertCircle,
  ExternalLink,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ContainerSummary } from "../../shared/types";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  const [search, setSearch] = useState("");
  const [filterStack, setFilterStack] = useState("all");
  const [selectedContainer, setSelectedContainer] = useState<ContainerSummary | null>(null);

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
      const term = search.toLowerCase().trim();
      const matchesSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.image.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term);
      return matchesStack && matchesSearch;
    });
  }, [containers, filterStack, search]);

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
            <Button size="sm">
              <Plus className="size-4" /> Novo container
            </Button>
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterStack("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-mono transition-colors",
              filterStack === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            todos ({containers.length})
          </button>
          {stacks.map((stk) => (
            <button
              key={stk}
              onClick={() => setFilterStack(stk)}
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

      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
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
                    <Skeleton className="h-8 w-16 ml-auto" />
                  </td>
                </tr>
              ))
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Boxes className="mx-auto size-8 mb-2 opacity-50" />
                  {search || filterStack !== "all"
                    ? "Nenhum container encontrado com os filtros aplicados."
                    : "Nenhum container Docker encontrado na sua máquina."}
                </td>
              </tr>
            ) : (
              filteredList.map((c) => (
                <tr
                  key={c.id}
                  className="border-b last:border-0 hover:bg-accent/40 transition-colors"
                >
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
                      className="font-mono text-xs truncate max-w-[220px] block"
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
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedContainer(c)}>
                        Inspecionar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>

      {/* Inspect & Actions Sheet */}
      <Sheet open={!!selectedContainer} onOpenChange={(o) => !o && setSelectedContainer(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedContainer && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <span className="truncate">{selectedContainer.name}</span>
                  <StatusPill status={selectedContainer.state} />
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 mt-6">
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
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <FileText className="size-4" /> Comando de execução
                    </span>
                  </div>
                  <pre className="overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                    {selectedContainer.command || "Nenhum comando explícito"}
                  </pre>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      toast.info("Console interativo via WebSocket será ativado na Fase 4.")
                    }
                  >
                    <Terminal className="size-4 mr-2" /> Console (exec)
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      toast.info("Streaming de logs em tempo real será ativado na Fase 3.")
                    }
                  >
                    <FileText className="size-4 mr-2" /> Logs ao vivo
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
