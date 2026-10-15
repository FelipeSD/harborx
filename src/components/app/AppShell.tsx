import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Boxes, LayoutDashboard, Layers, Github, Server, Search, Anchor, Bell, Network, HardDrive, Webhook } from "lucide-react";

const nav = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/containers", label: "Containers", icon: Boxes },
  { to: "/images", label: "Imagens", icon: Layers },
  { to: "/networks", label: "Redes", icon: Network },
  { to: "/volumes", label: "Volumes", icon: HardDrive },
  { to: "/repositories", label: "Repositórios", icon: Github },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/hosts", label: "Máquinas virtuais", icon: Server },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-surface p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground glow-primary">
            <Anchor className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Harbor<span className="text-primary">X</span></span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary">
              <n.icon className="size-4" />{n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border bg-card p-3 text-xs">
          <p className="font-medium">3 de 4 VMs online</p>
          <p className="mt-1 text-muted-foreground">vm-edge-sp sem resposta há 18 min</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-6 backdrop-blur">
          <div className="flex flex-1 items-center gap-2 rounded-md border bg-surface px-3 py-1.5 text-sm text-muted-foreground md:max-w-md">
            <Search className="size-4" />
            <input placeholder="Buscar containers, imagens, repositórios…" className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
            <kbd className="rounded border px-1.5 font-mono text-[10px]">⌘K</kbd>
          </div>
          <button className="relative ml-auto rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Notificações">
            <Bell className="size-4" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
          </button>
          <div className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold">FD</div>
        </header>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
