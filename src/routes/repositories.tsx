import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GitBranch, GitCommit, Rocket, Github, Plus } from "lucide-react";
import { toast } from "sonner";
import { repos as initial } from "@/lib/mock-data";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/repositories")({
  head: () => ({
    meta: [
      { title: "Repositórios GitHub — HarborX" },
      {
        name: "description",
        content: "Conecte repositórios GitHub e faça deploy automático das suas stacks.",
      },
      { property: "og:title", content: "Repositórios GitHub — HarborX" },
      {
        property: "og:description",
        content: "Conecte repositórios GitHub e faça deploy automático das suas stacks.",
      },
    ],
  }),
  component: ReposPage,
});

const statusCls = {
  synced: "text-success",
  behind: "text-primary",
  deploying: "text-info",
} as const;
const statusLabel = {
  synced: "Sincronizado",
  behind: "Atrás do branch",
  deploying: "Fazendo deploy",
} as const;

function ReposPage() {
  const [items, setItems] = useState(initial);
  return (
    <>
      <PageHeader
        title="Repositórios"
        subtitle="Stacks conectadas ao GitHub com deploy por push"
        actions={
          <Button onClick={() => toast("Conexão com GitHub (simulação)")}>
            <Plus /> Conectar repositório
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((r) => (
          <Panel key={r.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-secondary">
                  <Github className="size-4" />
                </div>
                <div>
                  <p className="font-mono text-sm font-medium">{r.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="size-3" />
                    {r.branch} · {r.stack}
                  </p>
                </div>
              </div>
              <span className={cn("flex items-center gap-1.5 text-xs", statusCls[r.status])}>
                <span className="size-1.5 rounded-full bg-current pulse-dot" />
                {statusLabel[r.status]}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm">
              <GitCommit className="size-4 text-muted-foreground" />
              <span className="truncate">{r.lastCommit}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {r.author} · {r.ago}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={r.autoDeploy}
                  onCheckedChange={(v) =>
                    setItems((s) => s.map((x) => (x.id === r.id ? { ...x, autoDeploy: v } : x)))
                  }
                />
                Deploy automático
              </label>
              <Button
                size="sm"
                variant={r.status === "behind" ? "default" : "outline"}
                disabled={r.status === "deploying"}
                onClick={() => {
                  setItems((s) =>
                    s.map((x) => (x.id === r.id ? { ...x, status: "deploying" } : x)),
                  );
                  toast.success(`Deploy de ${r.name} iniciado`);
                  setTimeout(
                    () =>
                      setItems((s) =>
                        s.map((x) => (x.id === r.id ? { ...x, status: "synced" } : x)),
                      ),
                    2500,
                  );
                }}
              >
                <Rocket /> Deploy agora
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
