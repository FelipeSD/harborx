import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, HardDrive, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/volumes")({
  head: () => ({
    meta: [
      { title: "Volumes Docker — HarborX" },
      { name: "description", content: "Acompanhe volumes de armazenamento persistente no Docker." },
      { property: "og:title", content: "Volumes Docker — HarborX" },
    ],
  }),
  component: VolumesPage,
});

function formatDate(isoString?: string): string {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

function VolumesPage() {
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
            <Button
              size="sm"
              onClick={() => toast.info("Criação de volumes será disponibilizada na Fase 6.")}
            >
              <Plus className="size-4" /> Novo volume
            </Button>
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
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 font-medium">Escopo</th>
              <th className="px-4 py-3 font-medium">Ponto de Montagem (Host)</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
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
                    <Skeleton className="h-4 w-14" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-64" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                </tr>
              ))
            ) : volumes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <HardDrive className="mx-auto size-8 mb-2 opacity-40" />
                  Nenhum volume persistente encontrado no Docker.
                </td>
              </tr>
            ) : (
              volumes.map((v) => (
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
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {v.scope || "local"}
                  </td>
                  <td
                    className="max-w-md truncate px-4 py-3 font-mono text-xs text-muted-foreground"
                    title={v.mountpoint}
                  >
                    {v.mountpoint}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatDate(v.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
