import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Lock, Network as NetworkIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/networks")({
  head: () => ({
    meta: [
      { title: "Redes Docker — HarborX" },
      { name: "description", content: "Veja e gerencie redes Docker na sua infraestrutura." },
      { property: "og:title", content: "Redes Docker — HarborX" },
    ],
  }),
  component: NetworksPage,
});

const builtin = ["bridge", "host", "none"];

function NetworksPage() {
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

  return (
    <>
      <PageHeader
        title="Redes"
        subtitle={`${networks.length} redes configuradas no Docker`}
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
            <Button
              size="sm"
              onClick={() => toast.info("Criação de redes será disponibilizada na Fase 6.")}
            >
              <Plus className="size-4" /> Nova rede
            </Button>
          </div>
        }
      />

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
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 font-medium">Escopo</th>
              <th className="px-4 py-3 font-medium">Subnet</th>
              <th className="px-4 py-3 font-medium">Gateway</th>
              <th className="px-4 py-3 font-medium">Containers Conectados</th>
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
            ) : networks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <NetworkIcon className="mx-auto size-8 mb-2 opacity-40" />
                  Nenhuma rede Docker encontrada.
                </td>
              </tr>
            ) : (
              networks.map((n) => {
                const isBuiltin = builtin.includes(n.name);
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
                const containerCount = n.containers ? Object.keys(n.containers).length : 0;

                return (
                  <tr
                    key={n.id}
                    className="border-b last:border-0 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
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
                    <td className="px-4 py-3 font-mono text-xs">{subnets}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {gateways}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {containerCount} {containerCount === 1 ? "container" : "containers"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
