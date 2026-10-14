import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Play, Square, RotateCw, ArrowUpCircle, Terminal, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { containers as initial, hosts, type Container } from "@/lib/mock-data";
import { PageHeader, Panel, SourceTag, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/containers")({
  head: () => ({
    meta: [
      { title: "Containers — HarborX" },
      { name: "description", content: "Inicie, pare, reinicie e atualize containers em todas as VMs." },
      { property: "og:title", content: "Containers — HarborX" },
      { property: "og:description", content: "Inicie, pare, reinicie e atualize containers em todas as VMs." },
    ],
  }),
  component: ContainersPage,
});

const logLines = [
  "[info] listening on :8443",
  "[info] connected to postgres@10.0.1.12:5432",
  "[warn] slow request GET /v1/orders 812ms",
  "[info] health check ok",
  "[info] reloaded config (3 routes)",
];

function ContainersPage() {
  const [items, setItems] = useState(initial);
  const [host, setHost] = useState("all");
  const [sel, setSel] = useState<Container | null>(null);
  const list = useMemo(() => items.filter((c) => host === "all" || c.host === host), [items, host]);

  const act = (id: string, patch: Partial<Container>, msg: string) => {
    setItems((s) => s.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    toast.success(msg);
  };
  const update = (c: Container) => {
    act(c.id, { status: "updating" }, `Pull de ${c.image} iniciado`);
    setTimeout(() => setItems((s) => s.map((x) => (x.id === c.id ? { ...x, status: "running", updateAvailable: false } : x))), 2200);
  };

  return (
    <>
      <PageHeader title="Containers" subtitle={`${list.length} containers`} actions={<Button><Plus /> Novo container</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", ...hosts.map((h) => h.name)].map((h) => (
          <button key={h} onClick={() => setHost(h)}
            className={cn("rounded-full border px-3 py-1 text-xs font-mono transition-colors", host === h ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {h === "all" ? "todas as VMs" : h}
          </button>
        ))}
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>{["Nome", "Imagem", "Status", "VM", "CPU", "Mem", "Portas", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3"><button onClick={() => setSel(c)} className="font-medium hover:text-primary">{c.name}</button><p className="font-mono text-xs text-muted-foreground">{c.id}</p></td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><SourceTag source={c.source} /><span className="font-mono text-xs">{c.image}:{c.tag}</span></div>
                  {c.updateAvailable && <p className="mt-1 text-xs text-primary">● nova versão disponível</p>}</td>
                <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                <td className="px-4 py-3 font-mono text-xs">{c.host}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.cpu}%</td>
                <td className="px-4 py-3 font-mono text-xs">{c.mem}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.ports}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {c.status === "running"
                      ? <Button size="icon" variant="ghost" aria-label="Parar" onClick={() => act(c.id, { status: "stopped", cpu: 0 }, `${c.name} parado`)}><Square /></Button>
                      : <Button size="icon" variant="ghost" aria-label="Iniciar" onClick={() => act(c.id, { status: "running" }, `${c.name} iniciado`)}><Play /></Button>}
                    <Button size="icon" variant="ghost" aria-label="Reiniciar" onClick={() => toast(`${c.name} reiniciando…`)}><RotateCw /></Button>
                    <Button size="sm" variant={c.updateAvailable ? "default" : "outline"} onClick={() => update(c)} disabled={c.status === "updating"}><ArrowUpCircle /> Pull</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {sel && (
            <>
              <SheetHeader><SheetTitle className="flex items-center gap-3">{sel.name} <StatusPill status={sel.status} /></SheetTitle></SheetHeader>
              <div className="space-y-5 px-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[["Imagem", `${sel.image}:${sel.tag}`], ["VM", sel.host], ["Uptime", sel.uptime], ["Portas", sel.ports], ["Repositório", sel.repo ?? "—"], ["Origem", sel.source === "ghcr" ? "GitHub Registry" : "Docker Hub"]].map(([k, v]) => (
                    <div key={k} className="rounded-lg border bg-surface p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 truncate font-mono text-xs">{v}</dd></div>
                  ))}
                </dl>
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium"><FileText className="size-4" /> Logs ao vivo</div>
                  <pre className="h-48 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                    {logLines.map((l, i) => <div key={i}><span className="text-primary/70">10:0{i} </span>{l}</div>)}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => toast("Console aberto (simulação)")}><Terminal /> Console</Button>
                  <Button className="flex-1" onClick={() => { update(sel); setSel(null); }}><ArrowUpCircle /> Pull & recriar</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
