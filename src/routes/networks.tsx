import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { networks as initial } from "@/lib/mock-data";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/networks")({
  head: () => ({
    meta: [
      { title: "Redes Docker — HarborX" },
      { name: "description", content: "Veja e gerencie redes bridge, overlay e host em todas as VMs." },
      { property: "og:title", content: "Redes Docker — HarborX" },
      { property: "og:description", content: "Veja e gerencie redes bridge, overlay e host em todas as VMs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NetworksPage,
});

const builtin = ["bridge", "host", "none"];

function NetworksPage() {
  const [items, setItems] = useState(initial);
  return (
    <>
      <PageHeader title="Redes" subtitle={`${items.length} redes`} actions={<Button onClick={() => toast("Criar rede (simulação)")}><Plus /> Nova rede</Button>} />
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>{["Nome", "Driver", "Subnet", "Gateway", "VM", "Containers", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium">{n.name}{n.internal && <Lock className="size-3 text-muted-foreground" />}</span><p className="font-mono text-xs text-muted-foreground">{n.id}</p></td>
                <td className="px-4 py-3"><span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">{n.driver}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{n.subnet}</td>
                <td className="px-4 py-3 font-mono text-xs">{n.gateway}</td>
                <td className="px-4 py-3 font-mono text-xs">{n.host}</td>
                <td className="px-4 py-3 font-mono text-xs">{n.containers}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="icon" variant="ghost" aria-label="Remover" disabled={builtin.includes(n.name) || n.containers > 0}
                    onClick={() => { setItems((s) => s.filter((x) => x.id !== n.id)); toast.success(`Rede ${n.name} removida`); }}><Trash2 /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
