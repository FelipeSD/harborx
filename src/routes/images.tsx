import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { images } from "@/lib/mock-data";
import { PageHeader, Panel, SourceTag } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/images")({
  head: () => ({
    meta: [
      { title: "Imagens — HarborX" },
      { name: "description", content: "Faça pull de imagens do Docker Hub e do GitHub Container Registry." },
      { property: "og:title", content: "Imagens — HarborX" },
      { property: "og:description", content: "Faça pull de imagens do Docker Hub e do GitHub Container Registry." },
    ],
  }),
  component: ImagesPage,
});

function ImagesPage() {
  const [ref, setRef] = useState("");
  return (
    <>
      <PageHeader title="Imagens" subtitle="Docker Hub e GitHub Container Registry" />
      <Panel className="mb-6 p-5">
        <p className="mb-3 text-sm font-medium">Pull de imagem</p>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (ref) { toast.success(`Pull de ${ref} em todas as VMs`); setRef(""); } }}>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex.: nginx:latest ou ghcr.io/acme/web:main" className="font-mono" />
          <Button type="submit"><Download /> Pull</Button>
        </form>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((i) => (
          <Panel key={i.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <SourceTag source={i.source} />
              {!i.latest && <span className="text-xs text-primary">● update</span>}
            </div>
            <p className="mt-3 truncate font-mono text-sm">{i.repo}</p>
            <p className="font-mono text-xs text-muted-foreground">:{i.tag}</p>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{i.size} · {i.created}</span><span>{i.inUse ? `${i.inUse} em uso` : "sem uso"}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => toast.success(`Pull de ${i.repo}`)}><Download /> Pull</Button>
              <Button size="icon" variant="ghost" aria-label="Remover" disabled={i.inUse > 0} onClick={() => toast("Imagem removida")}><Trash2 /></Button>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
