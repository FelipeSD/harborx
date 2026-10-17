import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/mock-data";

const statusMap: Record<string, { label: string; cls: string }> = {
  running: { label: "Rodando", cls: "bg-success/15 text-success" },
  stopped: { label: "Parado", cls: "bg-muted text-muted-foreground" },
  exited: { label: "Finalizado", cls: "bg-muted text-muted-foreground" },
  paused: { label: "Pausado", cls: "bg-amber-500/15 text-amber-500" },
  restarting: { label: "Reiniciando", cls: "bg-primary/15 text-primary" },
  dead: { label: "Falhou", cls: "bg-destructive/15 text-destructive" },
  created: { label: "Criado", cls: "bg-blue-500/15 text-blue-500" },
  updating: { label: "Atualizando", cls: "bg-primary/15 text-primary" },
  error: { label: "Erro", cls: "bg-destructive/15 text-destructive" },
};

export function StatusPill({ status }: { status: string }) {
  const s = statusMap[status.toLowerCase()] || {
    label: status,
    cls: "bg-muted text-muted-foreground",
  };
  const isStopped = status === "stopped" || status === "exited";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.cls,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", !isStopped && "pulse-dot")} />
      {s.label}
    </span>
  );
}

export function SourceTag({ source }: { source: "dockerhub" | "ghcr" }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        source === "ghcr" ? "border-foreground/20 text-foreground" : "border-info/40 text-info",
      )}
    >
      {source === "ghcr" ? "GHCR" : "Hub"}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Meter({ value, className }: { value: number; className?: string }) {
  const tone = value > 80 ? "bg-destructive" : value > 60 ? "bg-primary" : "bg-success";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", tone)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function Panel({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border bg-card", className)} {...props}>
      {children}
    </div>
  );
}
