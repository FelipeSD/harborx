import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Plus, Zap, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { webhooks as initial, webhookEvents } from "@/lib/mock-data";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks GitHub Actions — HarborX" },
      {
        name: "description",
        content: "Redeploy automático de imagens quando um workflow do GitHub Actions termina.",
      },
      { property: "og:title", content: "Webhooks GitHub Actions — HarborX" },
      {
        property: "og:description",
        content: "Redeploy automático de imagens quando um workflow do GitHub Actions termina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebhooksPage,
});

const yaml = (id: string) => `# .github/workflows/build-and-push.yml (passo final)
- name: Redeploy no HarborX
  if: success()
  run: |
    curl -fsS -X POST https://harborx.seudominio.com/api/public/hooks/${id} \\
      -H "X-HarborX-Token: \${{ secrets.HARBORX_TOKEN }}" \\
      -d '{"image":"ghcr.io/\${{ github.repository }}:\${{ github.sha }}"}'`;

function WebhooksPage() {
  const [items, setItems] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id ?? "");
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    toast.success("Copiado");
  };

  return (
    <>
      <PageHeader
        title="Webhooks"
        subtitle="Redeploy automático quando o GitHub Actions termina o build"
        actions={
          <Button onClick={() => toast("Novo webhook (simulação)")}>
            <Plus /> Novo webhook
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          {items.map((w) => (
            <Panel
              key={w.id}
              className={cn(
                "cursor-pointer p-5 transition-colors",
                sel === w.id && "border-primary/60",
              )}
            >
              <div
                onClick={() => setSel(w.id)}
                className="flex flex-wrap items-start justify-between gap-4"
              >
                <div>
                  <p className="font-medium">{w.repo}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    workflow_run · {w.workflow} · {w.branch}
                  </p>
                  <p className="mt-2 text-xs">
                    Redeploy de:{" "}
                    <span className="font-mono text-primary">{w.targets.join(", ")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      w.lastStatus === "success" ? "text-success" : "text-destructive",
                    )}
                  >
                    {w.lastStatus === "success" ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    {w.lastRun}
                  </span>
                  <Switch
                    checked={w.enabled}
                    onCheckedChange={(v) => {
                      setItems((s) => s.map((x) => (x.id === w.id ? { ...x, enabled: v } : x)));
                      toast(v ? "Webhook ativado" : "Webhook pausado");
                    }}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="flex-1 truncate rounded border bg-surface px-2 py-1.5 font-mono text-xs">
                  https://harborx.seudominio.com/api/public/hooks/{w.id}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copiar URL"
                  onClick={() => copy(`https://harborx.seudominio.com/api/public/hooks/${w.id}`)}
                >
                  <Copy />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast.success(`Teste enviado → redeploy de ${w.targets.join(", ")}`)
                  }
                >
                  <Zap /> Testar
                </Button>
              </div>
            </Panel>
          ))}
        </div>
        <div className="space-y-6">
          <Panel className="p-5">
            <p className="mb-2 text-sm font-medium">Como conectar ao GitHub Actions</p>
            <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>
                Salve o token como secret <span className="font-mono">HARBORX_TOKEN</span> no
                repositório.
              </li>
              <li>Adicione o passo abaixo ao final do workflow que publica a imagem.</li>
              <li>
                Ou cadastre a URL como webhook do evento{" "}
                <span className="font-mono">workflow_run</span>.
              </li>
            </ol>
            <pre className="overflow-x-auto rounded-lg border bg-background p-3 font-mono text-[11px] leading-relaxed">
              {yaml(sel)}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => copy(yaml(sel))}
            >
              <Copy /> Copiar trecho
            </Button>
          </Panel>
          <Panel className="p-5">
            <p className="mb-3 text-sm font-medium">Entregas recentes</p>
            <ul className="space-y-3">
              {webhookEvents.map((e, i) => (
                <li key={i} className="flex gap-3 text-xs">
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      e.ok ? "bg-success" : "bg-destructive",
                    )}
                  />
                  <div>
                    <p>{e.result}</p>
                    <p className="font-mono text-muted-foreground">
                      {e.t} · {e.repo} {e.run}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
