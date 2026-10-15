import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Layers, AlertCircle, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/images")({
  head: () => ({
    meta: [
      { title: "Imagens — HarborX" },
      {
        name: "description",
        content: "Gerencie e visualize imagens Docker armazenadas localmente.",
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
  });
}

function ImagesPage() {
  const [ref, setRef] = useState("");

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

  return (
    <>
      <PageHeader
        title="Imagens"
        subtitle={`${images.length} imagens no host local`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      <Panel className="mb-6 p-5">
        <p className="mb-3 text-sm font-medium">Baixar imagem do registro</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (ref) {
              toast.info(
                `Download de ${ref} será implementado na Fase 6 com progresso em tempo real.`,
              );
              setRef("");
            }
          }}
        >
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="ex.: nginx:latest, redis:7 ou ghcr.io/org/app:v1"
            className="font-mono text-xs"
          />
          <Button type="submit">
            <Download className="size-4" /> Baixar
          </Button>
        </form>
      </Panel>

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
      ) : images.length === 0 ? (
        <Panel className="p-12 text-center text-muted-foreground">
          <Layers className="mx-auto size-10 mb-3 opacity-40" />
          <p className="text-base font-medium">Nenhuma imagem Docker encontrada</p>
          <p className="text-sm mt-1">Baixe uma imagem utilizando o campo acima para começar.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((i) => {
            const primaryTag = i.repoTags[0] || "<none>:<none>";
            const [repo, tag] = primaryTag.includes(":")
              ? [
                  primaryTag.slice(0, primaryTag.lastIndexOf(":")),
                  primaryTag.slice(primaryTag.lastIndexOf(":") + 1),
                ]
              : [primaryTag, "latest"];

            const isGhcr = repo.includes("ghcr.io");
            const isDockerHub = !isGhcr;

            return (
              <Panel key={i.id} className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {isGhcr ? "GHCR" : isDockerHub ? "Docker Hub" : "Registry"}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {i.id.slice(7, 19)}
                    </span>
                  </div>

                  <p className="mt-3 truncate font-mono text-sm font-semibold" title={repo}>
                    {repo}
                  </p>
                  <p className="font-mono text-xs text-primary">:{tag}</p>

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
                </div>

                <div className="mt-6 border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <HardDrive className="size-3.5" />
                    {formatBytes(i.size)}
                  </span>
                  <span>{formatDate(i.created)}</span>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
