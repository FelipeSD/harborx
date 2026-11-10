import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Layers,
  FileStack,
  Folder,
  HardDrive,
  LayoutDashboard,
  Network,
  Github,
  Webhook,
  Server,
  ArrowRight,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { buildFolderMap, getFolderFullPath } from "@/components/stacks/folder-utils";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface GlobalSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function GlobalSearchCommand({ open, onOpenChange }: GlobalSearchCommandProps) {
  const navigate = useNavigate();

  // Listen for Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Fetch all resources with lightweight stale time
  const { data: containers = [] } = useQuery({
    queryKey: ["containers"],
    queryFn: () => api.containers.list(),
    enabled: open,
    staleTime: 10_000,
  });

  const { data: images = [] } = useQuery({
    queryKey: ["images"],
    queryFn: () => api.images.list(),
    enabled: open,
    staleTime: 15_000,
  });

  const { data: stacks = [] } = useQuery({
    queryKey: ["stacks"],
    queryFn: () => api.stacks.list(),
    enabled: open,
    staleTime: 15_000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["stack-folders"],
    queryFn: () => api.stackFolders.list(),
    enabled: open,
    staleTime: 15_000,
  });

  const folderMap = useMemo(() => buildFolderMap(folders), [folders]);

  const { data: volumes = [] } = useQuery({
    queryKey: ["volumes"],
    queryFn: () => api.volumes.list(),
    enabled: open,
    staleTime: 15_000,
  });

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar containers, imagens, stacks, volumes ou páginas…" />
      <CommandList className="max-h-[380px] overflow-y-auto">
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        {/* Containers */}
        {containers.length > 0 && (
          <CommandGroup heading={`Containers (${containers.length})`}>
            {containers.slice(0, 15).map((c) => {
              const isRunning = c.state === "running";
              return (
                <CommandItem
                  key={c.id}
                  value={`container ${c.name} ${c.image} ${c.id}`}
                  onSelect={() =>
                    handleSelect(() => {
                      void navigate({ to: "/containers" });
                    })
                  }
                  className="flex items-center justify-between py-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        isRunning ? "bg-emerald-500 animate-pulse" : "bg-zinc-500",
                      )}
                    />
                    <Boxes className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {c.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate font-mono">
                      ({c.image})
                    </span>
                    {c.stack && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary shrink-0">
                        stack:{c.stack}
                      </span>
                    )}
                  </div>
                  <ArrowRight className="size-3 text-muted-foreground opacity-50 shrink-0 ml-2" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Imagens */}
        {images.length > 0 && (
          <CommandGroup heading={`Imagens Docker (${images.length})`}>
            {images.slice(0, 15).map((img) => {
              const primaryTag = img.repoTags[0] || img.id.slice(0, 16);
              const inUse = Boolean(img.inUseBy && img.inUseBy.length > 0);
              return (
                <CommandItem
                  key={img.id}
                  value={`imagem ${primaryTag} ${img.id}`}
                  onSelect={() =>
                    handleSelect(() => {
                      void navigate({ to: "/images" });
                    })
                  }
                  className="flex items-center justify-between py-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Layers className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-xs text-foreground truncate font-medium">
                      {primaryTag}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatBytes(img.size)}
                    </span>
                    {inUse && (
                      <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 text-[9px] text-emerald-400 shrink-0 font-medium">
                        em uso
                      </span>
                    )}
                  </div>
                  <ArrowRight className="size-3 text-muted-foreground opacity-50 shrink-0 ml-2" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Stacks */}
        {stacks.length > 0 && (
          <CommandGroup heading={`Stacks Compose (${stacks.length})`}>
            {stacks.map((s) => {
              const folderPath = s.folderId ? getFolderFullPath(s.folderId, folderMap) : "";
              return (
                <CommandItem
                  key={s.id}
                  value={`stack ${s.name} ${s.type} ${s.status} ${folderPath}`}
                  onSelect={() =>
                    handleSelect(() => {
                      void navigate({ to: "/stacks" });
                    })
                  }
                  className="flex items-center justify-between py-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <FileStack className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-semibold text-xs text-foreground truncate">{s.name}</span>
                    {folderPath && (
                      <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/60 shrink-0 max-w-[160px] truncate">
                        <Folder className="size-2.5 shrink-0" />
                        <span className="truncate">{folderPath}</span>
                      </span>
                    )}
                    <span className="rounded border px-1.5 py-0.2 text-[10px] uppercase font-mono text-muted-foreground">
                      {s.type}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] capitalize font-medium",
                        s.status === "deployed"
                          ? "text-emerald-400"
                          : s.status === "failed"
                            ? "text-rose-400"
                            : "text-amber-400",
                      )}
                    >
                      {s.status}
                    </span>
                  </div>
                  <ArrowRight className="size-3 text-muted-foreground opacity-50 shrink-0 ml-2" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Volumes */}
        {volumes.length > 0 && (
          <CommandGroup heading={`Volumes (${volumes.length})`}>
            {volumes.slice(0, 10).map((v) => (
              <CommandItem
                key={v.name}
                value={`volume ${v.name} ${v.driver}`}
                onSelect={() =>
                  handleSelect(() => {
                    void navigate({ to: "/volumes" });
                  })
                }
                className="flex items-center justify-between py-2 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-xs text-foreground truncate">{v.name}</span>
                  <span className="text-[10px] text-muted-foreground">driver: {v.driver}</span>
                </div>
                <ArrowRight className="size-3 text-muted-foreground opacity-50 shrink-0 ml-2" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Navegação Rápida */}
        <CommandGroup heading="Navegação Rápida">
          <CommandItem
            value="painel visao geral dashboard"
            onSelect={() => handleSelect(() => void navigate({ to: "/" }))}
            className="cursor-pointer"
          >
            <LayoutDashboard className="mr-2 size-4 text-muted-foreground" />
            <span>Visão Geral</span>
          </CommandItem>
          <CommandItem
            value="stacks compose orquestracao"
            onSelect={() => handleSelect(() => void navigate({ to: "/stacks" }))}
            className="cursor-pointer"
          >
            <FileStack className="mr-2 size-4 text-muted-foreground" />
            <span>Stacks Compose</span>
          </CommandItem>
          <CommandItem
            value="containers docker gerenciamento"
            onSelect={() => handleSelect(() => void navigate({ to: "/containers" }))}
            className="cursor-pointer"
          >
            <Boxes className="mr-2 size-4 text-muted-foreground" />
            <span>Containers</span>
          </CommandItem>
          <CommandItem
            value="imagens docker registry pull"
            onSelect={() => handleSelect(() => void navigate({ to: "/images" }))}
            className="cursor-pointer"
          >
            <Layers className="mr-2 size-4 text-muted-foreground" />
            <span>Imagens</span>
          </CommandItem>
          <CommandItem
            value="redes networks docker bridge"
            onSelect={() => handleSelect(() => void navigate({ to: "/networks" }))}
            className="cursor-pointer"
          >
            <Network className="mr-2 size-4 text-muted-foreground" />
            <span>Redes</span>
          </CommandItem>
          <CommandItem
            value="volumes armazenamento persistente"
            onSelect={() => handleSelect(() => void navigate({ to: "/volumes" }))}
            className="cursor-pointer"
          >
            <HardDrive className="mr-2 size-4 text-muted-foreground" />
            <span>Volumes</span>
          </CommandItem>
          <CommandItem
            value="registros repositories dockerhub ghcr"
            onSelect={() => handleSelect(() => void navigate({ to: "/repositories" }))}
            className="cursor-pointer"
          >
            <Github className="mr-2 size-4 text-muted-foreground" />
            <span>Registros de Imagens</span>
          </CommandItem>
          <CommandItem
            value="webhooks ci cd deploy trigger"
            onSelect={() => handleSelect(() => void navigate({ to: "/webhooks" }))}
            className="cursor-pointer"
          >
            <Webhook className="mr-2 size-4 text-muted-foreground" />
            <span>Webhooks</span>
          </CommandItem>
          <CommandItem
            value="host sistema docker engine configuracoes rbac"
            onSelect={() => handleSelect(() => void navigate({ to: "/hosts" }))}
            className="cursor-pointer"
          >
            <Server className="mr-2 size-4 text-muted-foreground" />
            <span>Host & Sistema</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
