import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  FileStack,
  Terminal,
  ExternalLink,
  Play,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { WebhookItem } from "../../shared/types";

export const Route = createFileRoute("/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks GitOps — HarborX" },
      {
        name: "description",
        content:
          "Redeploy automático de stacks quando um workflow do GitHub Actions ou CI/CD termina.",
      },
      { property: "og:title", content: "Webhooks GitOps — HarborX" },
    ],
  }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const [selectedId, setSelectedId] = useState<string>("");
  const [isTesting, setIsTesting] = useState(false);

  const {
    data: webhooks = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["webhooks"],
    queryFn: api.webhooks.list,
  });

  const activeWebhook = webhooks.find((w) => w.id === selectedId) || webhooks[0];

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência");
  };

  const testWebhook = async (url: string) => {
    setIsTesting(true);
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      toast.success("Webhook disparado com sucesso! O deploy foi iniciado.");
      void refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao disparar webhook: ${msg}`);
    } finally {
      setIsTesting(false);
    }
  };

  const githubSnippet = activeWebhook
    ? `# .github/workflows/deploy.yml (passo final)
name: Deploy to HarborX VM

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger HarborX Redeploy
        run: |
          curl -fsS -X POST "${activeWebhook.webhookUrl}"`
    : "";

  return (
    <>
      <PageHeader
        title="Webhooks GitOps"
        subtitle="Redeploy automático das stacks quando o GitHub Actions ou CI/CD finaliza o build"
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro ao carregar webhooks</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Falha ao obter lista de webhooks."}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-4 min-w-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <Panel key={i} className="p-4 sm:p-5">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-60 max-w-full" />
              </Panel>
            ))}
          </div>
          <Panel className="p-4 sm:p-5">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-40 w-full" />
          </Panel>
        </div>
      ) : webhooks.length === 0 ? (
        <Panel className="p-8 sm:p-12 text-center text-muted-foreground">
          <Zap className="mx-auto size-10 mb-3 opacity-40" />
          <p className="text-base font-medium">Nenhum webhook disponível</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Cada stack criada no HarborX gera automaticamente uma URL de webhook GitOps única para
            redeploy contínuo. Crie sua primeira stack na aba Stacks.
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_440px]">
          <div className="space-y-4 min-w-0">
            {webhooks.map((w) => {
              const isSelected = activeWebhook?.id === w.id;
              const isSuccess = w.recentDeployment?.status === "success";

              return (
                <Panel
                  key={w.id}
                  className={cn(
                    "p-4 sm:p-5 cursor-pointer transition-all overflow-hidden",
                    isSelected
                      ? "border-primary ring-1 ring-primary/30"
                      : "hover:border-foreground/20",
                  )}
                  onClick={() => setSelectedId(w.id)}
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3 min-w-0">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground shrink-0">
                        <FileStack className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <p className="font-semibold text-sm text-foreground truncate max-w-full">
                            {w.stackName}
                          </p>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] py-0 uppercase shrink-0"
                          >
                            {w.stackType}
                          </Badge>
                        </div>
                        <p
                          className="font-mono text-xs text-muted-foreground mt-0.5 truncate max-w-full"
                          title={w.webhookUrl}
                        >
                          {w.webhookUrl}
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono shrink-0",
                        w.status === "deployed"
                          ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                          : "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {w.status}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-mono min-w-0">
                      {w.recentDeployment ? (
                        <>
                          {isSuccess ? (
                            <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="size-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className="truncate">
                            Último deploy: {w.recentDeployment.triggeredBy} (
                            {w.recentDeployment.status})
                          </span>
                        </>
                      ) : (
                        <span>Nenhum deploy registrado</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          copy(w.webhookUrl);
                        }}
                      >
                        <Copy className="size-3" /> Copiar URL
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        disabled={isTesting}
                        onClick={(e) => {
                          e.stopPropagation();
                          void testWebhook(w.webhookUrl);
                        }}
                      >
                        {isTesting ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Play className="size-3" />
                        )}
                        Disparar
                      </Button>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>

          {activeWebhook && (
            <Panel className="p-4 sm:p-5 flex flex-col justify-between overflow-hidden">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                    <Zap className="size-4 text-primary shrink-0" />
                    <span>Integração GitHub Actions</span>
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => copy(githubSnippet)}
                  >
                    <Copy className="size-3" /> Copiar YAML
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Adicione este step ao final do seu pipeline no GitHub para fazer deploy automático
                  no HarborX sempre que uma nova tag ou commit for enviado:
                </p>
                <pre className="rounded-lg border bg-surface p-3 font-mono text-[11px] leading-relaxed overflow-x-auto overscroll-x-contain text-foreground whitespace-pre-wrap break-all sm:break-normal sm:whitespace-pre max-w-full">
                  {githubSnippet}
                </pre>
              </div>

              <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Como funciona:</p>
                <p>
                  O HarborX valida o token criptografado da URL, executa um <code>git pull</code> no
                  repositório associado e orquestra <code>docker compose up -d</code> sem
                  interrupção de serviço.
                </p>
              </div>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
