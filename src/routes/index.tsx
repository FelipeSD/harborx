import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowUpCircle, Boxes, Server, Github, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { activity, containers, cpuSeries, hosts, repos } from "@/lib/mock-data";
import { Meter, PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — HarborX" },
      { name: "description", content: "Painel de containers Docker em todas as suas máquinas virtuais." },
      { property: "og:title", content: "Visão geral — HarborX" },
      { property: "og:description", content: "Painel de containers Docker em todas as suas máquinas virtuais." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const running = containers.filter((c) => c.status === "running").length;
  const updates = containers.filter((c) => c.updateAvailable);
  const stats = [
    { label: "Containers ativos", value: `${running}/${containers.length}`, icon: Boxes },
    { label: "VMs online", value: `${hosts.filter((h) => h.online).length}/${hosts.length}`, icon: Server },
    { label: "Repositórios", value: repos.length, icon: Github },
    { label: "Atualizações", value: updates.length, icon: ArrowUpCircle, hl: true },
  ];
  return (
    <>
      <PageHeader title="Bom dia, Felipe" subtitle="Tudo que está rodando na sua infraestrutura, em um lugar."
        actions={<Button onClick={() => toast.success(`Atualizando ${updates.length} containers…`)}><ArrowUpCircle /> Atualizar tudo</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label} className={cn("p-5", s.hl && "border-primary/40 glow-primary")}>
            <div className="flex items-center justify-between text-sm text-muted-foreground">{s.label}<s.icon className={cn("size-4", s.hl && "text-primary")} /></div>
            <p className="mt-3 font-mono text-3xl font-semibold">{s.value}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Uso do cluster · 24h</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-1" />CPU</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-2" />Memória</span>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={cpuSeries}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-2)" stopOpacity={0.25} /><stop offset="1" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="h" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} interval={3} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Area dataKey="mem" stroke="var(--chart-2)" fill="url(#g2)" strokeWidth={2} />
                <Area dataKey="cpu" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 font-medium">Atividade</h2>
          <ul className="space-y-3">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{a.t}</span>
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", a.kind === "error" ? "bg-destructive" : a.kind === "warn" ? "bg-primary" : a.kind === "ok" ? "bg-success" : "bg-info")} />
                <span className="text-foreground/90">{a.msg}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Máquinas virtuais</h2><Link to="/hosts" className="text-xs text-primary">Ver todas</Link></div>
          <div className="space-y-4">
            {hosts.map((h) => (
              <div key={h.id} className="grid grid-cols-[1fr_120px] items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn("size-2 rounded-full", h.online ? "bg-success" : "bg-destructive")} />
                  <span className="font-mono">{h.name}</span><span className="text-xs text-muted-foreground">{h.containers} containers</span>
                </div>
                <Meter value={h.cpu} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Atualizações pendentes</h2><Link to="/containers" className="text-xs text-primary">Gerenciar</Link></div>
          <div className="space-y-2">
            {updates.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-2">
                <div className="text-sm"><p className="font-medium">{c.name}</p><p className="font-mono text-xs text-muted-foreground">{c.image}:{c.tag}</p></div>
                <Button size="sm" variant="outline" onClick={() => toast.success(`Pull + recreate de ${c.name} iniciado`)}>Atualizar</Button>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> edge-cache em erro (OOM) na vm-edge-sp
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
