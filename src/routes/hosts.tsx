import { createFileRoute } from "@tanstack/react-router";
import { Plus, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { hosts } from "@/lib/mock-data";
import { Meter, PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hosts")({
  head: () => ({
    meta: [
      { title: "Máquinas virtuais — HarborX" },
      { name: "description", content: "Monitore CPU, memória e disco das VMs que rodam Docker." },
      { property: "og:title", content: "Máquinas virtuais — HarborX" },
      {
        property: "og:description",
        content: "Monitore CPU, memória e disco das VMs que rodam Docker.",
      },
    ],
  }),
  component: HostsPage,
});

function HostsPage() {
  return (
    <>
      <PageHeader
        title="Máquinas virtuais"
        subtitle="Hosts Docker conectados"
        actions={
          <Button onClick={() => toast("Comando de instalação do agente copiado (simulação)")}>
            <Plus /> Adicionar VM
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {hosts.map((h) => (
          <Panel key={h.id} className={cn("p-5", !h.online && "opacity-70")}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono font-medium">{h.name}</p>
                <p className="text-xs text-muted-foreground">
                  {h.ip} · {h.os} · Docker {h.docker}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  h.online ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                )}
              >
                {h.online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["CPU", h.cpu, Cpu],
                ["Memória", h.mem, MemoryStick],
                ["Disco", h.disk, HardDrive],
              ].map(([l, v, I]) => {
                const Icon = I as typeof Cpu;
                return (
                  <div
                    key={l as string}
                    className="grid grid-cols-[90px_1fr_40px] items-center gap-3 text-sm"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="size-3.5" />
                      {l as string}
                    </span>
                    <Meter value={v as number} />
                    <span className="text-right font-mono text-xs">{v as number}%</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              {h.containers} containers
            </p>
          </Panel>
        ))}
      </div>
    </>
  );
}
