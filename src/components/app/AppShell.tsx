import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Boxes,
  LayoutDashboard,
  Layers,
  Github,
  Server,
  Search,
  Anchor,
  Bell,
  Network,
  HardDrive,
  Webhook,
  FileStack,
  LogOut,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const nav = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/stacks", label: "Stacks", icon: FileStack },
  { to: "/containers", label: "Containers", icon: Boxes },
  { to: "/images", label: "Imagens", icon: Layers },
  { to: "/networks", label: "Redes", icon: Network },
  { to: "/volumes", label: "Volumes", icon: HardDrive },
  { to: "/repositories", label: "Registros de imagens", icon: Github },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/hosts", label: "Host & Sistema", icon: Server },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    void navigate({ to: "/login" });
  };

  const roleLabel =
    user?.role === "admin"
      ? "Administrador"
      : user?.role === "operator"
        ? "Operador"
        : "Visualizador";

  const initials = (user?.username || "HX").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-surface p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground glow-primary">
            <Anchor className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Harbor<span className="text-primary">X</span>
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border bg-card p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Docker Engine local</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
            /var/run/docker.sock
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-6 backdrop-blur">
          <div className="flex flex-1 items-center gap-2 rounded-md border bg-surface px-3 py-1.5 text-sm text-muted-foreground md:max-w-md">
            <Search className="size-4" />
            <input
              placeholder="Buscar containers, imagens, stacks…"
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border px-1.5 font-mono text-[10px]">⌘K</kbd>
          </div>

          <button
            className="relative ml-auto rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Notificações"
          >
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
          </button>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full p-0.5 outline-none hover:ring-2 hover:ring-primary/40 focus:ring-2 focus:ring-primary"
                  aria-label="Menu do usuário"
                >
                  <div className="grid size-8 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                    {initials}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.username}</p>
                    <div className="pt-1">
                      <Badge variant="outline" className="text-[10px] font-normal gap-1">
                        <Shield className="size-3 text-primary" />
                        {roleLabel}
                      </Badge>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 size-4" />
                  <span>Sair da conta</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
