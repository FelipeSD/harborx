import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Eraser } from "lucide-react";
import { toast } from "sonner";
import { volumes as initial } from "@/lib/mock-data";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/volumes")({
  head: () => ({
    meta: [
      { title: "Volumes Docker — HarborX" },
      { name: "description", content: "Acompanhe volumes, tamanho em disco e quais containers os usam." },
      { property: "og:title", content: "Volumes Docker — HarborX" },
      { property: "og:description", content: "Acompanhe volumes, tamanho em disco e quais containers os usam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VolumesPage,
});

function VolumesPage() {
  const [items, setItems] = useState(initial);
  const unused = items.filter((v) => v.usedBy.length === 0);
  return (
    <>
      <PageHeader title="Volumes" subtitle={`${items.length} volumes · ${unused.length} sem uso`}
        actions={<>
          <Button variant="outline" disabled={!unused.length} onClick={() => { setItems((s) => s.filter((v) => v.usedBy.length)); toast.success(`${unused.length} volume(s) sem uso removido(s)`); }}><Eraser /> Limpar sem uso</Button>
          <Button onClick={() => toast("Criar volume (simulação)")}><Plus /> Novo volume</Button>
        </>} />
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>{["Nome", "Driver", "Tamanho", "VM", "Usado por", "Ponto de montagem", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className="border-b last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3 font-medium">{v.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{v.driver}</td>
                <td className="px-4 py-3 font-mono text-xs">{v.size}</td>
                <td className="px-4 py-3 font-mono text-xs">{v.host}</td>
                <td className="px-4 py-3 text-xs">{v.usedBy.length ? v.usedBy.join(", ") : <span className="text-primary">sem uso</span>}</td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-muted-foreground">{v.mount}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="icon" variant="ghost" aria-label="Remover" disabled={v.usedBy.length > 0}
                    onClick={() => { setItems((s) => s.filter((x) => x.id !== v.id)); toast.success(`Volume ${v.name} removido`); }}><Trash2 /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
