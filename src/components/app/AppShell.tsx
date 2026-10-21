import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
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
  Menu,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/app/Logo";
import { NotificationCenter } from "@/components/app/NotificationCenter";
import { GlobalSearchCommand } from "@/components/app/GlobalSearchCommand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
    <div className="flex min-h-dvh w-full max-w-full overflow-x-clip">
      {/* Sidebar Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-surface p-4 md:flex">
        <Logo size="sm" className="mb-8 px-2" />
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

      {/* Drawer de Navegação Mobile */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex flex-col w-72 max-w-[85dvw] p-4">
          <SheetHeader className="text-left px-2 mb-4">
            <SheetTitle className="sr-only">Navegação HarborX</SheetTitle>
            <Logo size="sm" />
          </SheetHeader>

          <nav className="flex flex-col gap-1 overflow-y-auto">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMobileNavOpen(false)}
                activeOptions={{ exact: n.to === "/" }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-primary/15 data-[status=active]:text-primary"
              >
                <n.icon className="size-4 shrink-0" />
                <span>{n.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t border-border/60 space-y-3">
            <div className="rounded-lg border bg-card p-2.5 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Docker Engine</span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
                /var/run/docker.sock
              </p>
            </div>

            {user && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface/50 border border-border/50 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <div className="grid size-7 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary shrink-0">
                    {initials}
                  </div>
                  <div className="truncate">
                    <p className="font-medium text-foreground truncate">{user.username}</p>
                    <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => {
                    setMobileNavOpen(false);
                    void handleLogout();
                  }}
                  title="Sair"
                  aria-label="Sair da conta"
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col max-w-full">
        {/* Header Superior Responsivo */}
        <header className="sticky top-0 z-30 flex h-14 w-full max-w-full items-center justify-between gap-2 sm:gap-3 border-b bg-background/80 px-3 sm:px-6 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Botão Hambúrguer Mobile */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden size-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="size-5" />
            </Button>

            {/* Mini Logo em telas pequenas */}
            <div className="flex items-center gap-2 md:hidden shrink-0">
              <Logo size="sm" iconOnly />
              <span className="font-bold text-sm tracking-tight text-foreground">
                Harbor<span className="text-primary">X</span>
              </span>
            </div>

            {/* Campo de Busca Interativo (desktop) */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="hidden sm:flex flex-1 min-w-0 items-center gap-2 rounded-md border bg-surface/80 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface md:max-w-md text-left cursor-pointer"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-xs text-muted-foreground truncate">
                Buscar containers, imagens, stacks…
              </span>
              <kbd className="hidden lg:inline rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shrink-0">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Botão de Busca Mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden size-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Buscar no HarborX"
            >
              <Search className="size-4" />
            </Button>

            {/* Centro de Notificações Ativo */}
            <NotificationCenter />

            {user && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-2 rounded-full p-0.5 outline-none hover:ring-2 hover:ring-primary/40 focus:ring-2 focus:ring-primary"
                    aria-label="Menu do usuário"
                  >
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                      {initials}
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-w-[calc(100dvw-1.5rem)]">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">{user.username}</p>
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
          </div>
        </header>

        <main className="flex-1 w-full min-w-0 max-w-full overflow-x-clip p-3 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <GlobalSearchCommand open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
}
