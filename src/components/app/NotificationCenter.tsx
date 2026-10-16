import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Check,
  Trash2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDockerEvents } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
  read: boolean;
}

const STORAGE_KEY = "harborx_notifications_v1";

function formatRelativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 10) return "agora";
  if (diffSec < 60) return `há ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function NotificationCenter() {
  const { events } = useDockerEvents();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: "initial-welcome",
        title: "HarborX Conectado",
        description: "Comunicação com o Docker Engine estabelecida.",
        type: "success",
        timestamp: Date.now(),
        read: false,
      },
    ];
  });

  // Salvar no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 30)));
    } catch {
      // ignore
    }
  }, [notifications]);

  // Monitorar novos eventos do Docker e criar notificações automáticas
  useEffect(() => {
    if (!events || events.length === 0) return;
    const latest = events[0];
    if (!latest || !latest.timeNano) return;

    const eventKey = `${latest.type}_${latest.action}_${latest.actorId}_${latest.timeNano}`;

    setNotifications((prev) => {
      if (prev.some((n) => n.id === eventKey)) return prev;

      const actorName =
        latest.actorAttributes?.["name"] ||
        latest.actorAttributes?.["image"] ||
        (latest.actorId ? latest.actorId.slice(0, 12) : "");

      let title = "Evento Docker";
      let desc = actorName || "Ação do daemon registrada";
      let type: NotificationItem["type"] = "info";

      if (latest.type === "container") {
        if (latest.action === "start") {
          title = "Container Iniciado";
          desc = actorName
            ? `Container "${actorName}" está rodando.`
            : "Container iniciado com sucesso.";
          type = "success";
        } else if (latest.action === "die" || latest.action === "stop") {
          title = "Container Finalizado";
          desc = actorName
            ? `Container "${actorName}" foi parado.`
            : "Container finalizou execução.";
          type = "warning";
        } else if (latest.action === "kill" || latest.action === "destroy") {
          title = "Container Removido";
          desc = actorName
            ? `Container "${actorName}" foi destruído.`
            : "Container removido do host.";
          type = "error";
        } else if (latest.action === "restart") {
          title = "Container Reiniciado";
          desc = actorName ? `Container "${actorName}" reiniciado.` : "Container em reinício.";
          type = "info";
        }
      } else if (latest.type === "image") {
        if (latest.action === "pull") {
          title = "Imagem Baixada";
          desc = actorName ? `Imagem "${actorName}" disponível.` : "Download de imagem concluído.";
          type = "success";
        } else if (latest.action === "untag" || latest.action === "delete") {
          title = "Imagem Excluída";
          desc = actorName ? `Imagem "${actorName}" removida.` : "Imagem excluída do host.";
          type = "info";
        }
      } else if (latest.type === "volume" || latest.type === "network") {
        const noun = latest.type === "volume" ? "Volume" : "Rede";
        title = `${noun} ${latest.action === "destroy" ? "Removido(a)" : "Atualizado(a)"}`;
        desc = actorName || `Ação ${latest.action} concluída.`;
        type = latest.action === "destroy" ? "warning" : "info";
      }

      const newNotif: NotificationItem = {
        id: eventKey,
        title,
        description: desc,
        type,
        timestamp: Date.now(),
        read: false,
      };

      return [newNotif, ...prev.slice(0, 29)];
    });
  }, [events]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const markOneAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const getIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />;
      case "warning":
        return <AlertTriangle className="size-4 text-amber-500 shrink-0" />;
      case "error":
        return <XCircle className="size-4 text-destructive shrink-0" />;
      default:
        return <Info className="size-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Abrir centro de notificações"
          title={
            unreadCount > 0 ? `${unreadCount} nova(s) notificação(ões)` : "Centro de notificações"
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-bold text-primary-foreground shadow-sm animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-2rem)] sm:w-96 p-0 shadow-2xl border-border/80 bg-card/95 backdrop-blur-md"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">Notificações</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
                {unreadCount} nova{unreadCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
                title="Marcar todas como lidas"
              >
                <Check className="size-3.5 mr-1" />
                Lidas
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={clearAll}
                title="Limpar todas as notificações"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Lista de Notificações */}
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <div className="grid size-10 place-items-center rounded-full bg-surface mb-2 border border-border/60">
              <BellOff className="size-5 opacity-40" />
            </div>
            <p className="text-xs font-medium text-foreground">Tudo tranquilo!</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Nenhuma notificação recente do Docker.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y divide-border/40">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markOneAsRead(n.id)}
                  className={cn(
                    "flex items-start gap-3 p-3.5 text-xs transition-colors cursor-pointer hover:bg-accent/40",
                    !n.read && "bg-primary/[0.04]",
                  )}
                >
                  <div className="mt-0.5">{getIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "truncate font-medium text-foreground text-xs",
                          !n.read && "font-semibold",
                        )}
                      >
                        {n.title}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {formatRelativeTime(n.timestamp)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground text-[11px] leading-relaxed">
                      {n.description}
                    </p>
                  </div>
                  {!n.read && (
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                      title="Não lida"
                    />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
