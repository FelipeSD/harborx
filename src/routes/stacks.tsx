import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileStack,
  GitBranch,
  Plus,
  Rocket,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  Square,
  RotateCw,
  RefreshCw,
  AlertCircle,
  Boxes,
  Terminal,
  ExternalLink,
  Code2,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  CreateStackRequest,
  StackEnvVar,
  StackSummary,
  UpdateStackRequest,
} from "../../shared/types";

export const Route = createFileRoute("/stacks")({
  head: () => ({
    meta: [
      { title: "Stacks Compose — HarborX" },
      {
        name: "description",
        content: "Gerencie stacks Docker Compose direto de arquivos YAML ou repositórios Git.",
      },
      { property: "og:title", content: "Stacks Compose — HarborX" },
    ],
  }),
  component: StacksPage,
});

const TEMPLATES: Record<string, { label: string; yaml: string }> = {
  custom: {
    label: "Em branco (Personalizado)",
    yaml: `services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "80:80"\n    restart: unless-stopped\n`,
  },
  postgres: {
    label: "PostgreSQL 16 + pgAdmin",
    yaml: `services:\n  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_USER: \${POSTGRES_USER:-app}\n      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-secret}\n      POSTGRES_DB: \${POSTGRES_DB:-app_production}\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    ports:\n      - "5432:5432"\n    restart: unless-stopped\n\nvolumes:\n  pgdata:\n`,
  },
  redis: {
    label: "Redis Cache + Persistence",
    yaml: `services:\n  redis:\n    image: redis:7-alpine\n    command: redis-server --appendonly yes\n    ports:\n      - "6379:6379"\n    volumes:\n      - redisdata:/data\n    restart: unless-stopped\n\nvolumes:\n  redisdata:\n`,
  },
  wordpress: {
    label: "WordPress + MySQL 8",
    yaml: `services:\n  wordpress:\n    image: wordpress:latest\n    ports:\n      - "8080:80"\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: wp_user\n      WORDPRESS_DB_PASSWORD: \${DB_PASS:-secret}\n      WORDPRESS_DB_NAME: wordpress\n    volumes:\n      - wpdata:/var/www/html\n    restart: unless-stopped\n\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_DATABASE: wordpress\n      MYSQL_USER: wp_user\n      MYSQL_PASSWORD: \${DB_PASS:-secret}\n      MYSQL_RANDOM_ROOT_PASSWORD: "1"\n    volumes:\n      - dbdata:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  wpdata:\n  dbdata:\n`,
  },
};

export function parseEnv(text: string): StackEnvVar[] {
  const out: StackEnvVar[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else {
      v = v.replace(/\s+#.*$/, "");
    }
    const key = m[1] ?? "";
    out.push({ key, value: v, secret: /SECRET|PASS|TOKEN|KEY|URL/i.test(key) });
  }
  return out;
}

const toText = (env: StackEnvVar[]) =>
  env.map((e) => `${e.key}=${/\s|#/.test(e.value) ? `"${e.value}"` : e.value}`).join("\n");

function EnvEditor({
  env,
  onChange,
}: {
  env: StackEnvVar[];
  onChange: (e: StackEnvVar[]) => void;
}) {
  const [text, setText] = useState(toText(env));
  const [show, setShow] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const merge = (incoming: StackEnvVar[]) => {
    const map = new Map(env.map((e) => [e.key, e]));
    incoming.forEach((e) => map.set(e.key, e));
    const next = [...map.values()];
    onChange(next);
    setText(toText(next));
    toast.success(`${incoming.length} variáveis importadas`);
  };

  const update = (i: number, patch: Partial<StackEnvVar>) => {
    const next = env.map((e, j) => (j === i ? { ...e, ...patch } : e));
    onChange(next);
    setText(toText(next));
  };

  return (
    <Tabs defaultValue="form" onValueChange={(v) => v === "text" && setText(toText(env))}>
      <div className="flex items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="form">Campos</TabsTrigger>
          <TabsTrigger value="text">Texto (.env)</TabsTrigger>
        </TabsList>
        <input
          ref={fileRef}
          type="file"
          accept=".env,text/plain,*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) merge(parseEnv(await f.text()));
            e.target.value = "";
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" /> Importar .env
        </Button>
      </div>

      <TabsContent value="form" className="mt-3 space-y-2">
        {env.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhuma variável de ambiente definida.
          </p>
        )}
        {env.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={e.key}
              placeholder="CHAVE"
              className="w-2/5 font-mono text-xs"
              onChange={(ev) =>
                update(i, {
                  key: ev.target.value.toUpperCase().replace(/[^A-Z0-9_.]/g, "_"),
                })
              }
            />
            <Input
              value={e.value}
              placeholder="valor"
              type={e.secret && !show[i] ? "password" : "text"}
              className="flex-1 font-mono text-xs"
              onChange={(ev) => update(i, { value: ev.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => setShow((s) => ({ ...s, [i]: !s[i] }))}
            >
              {show[i] || !e.secret ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 text-destructive"
              onClick={() => {
                const next = env.filter((_, j) => j !== i);
                onChange(next);
                setText(toText(next));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => onChange([...env, { key: "", value: "", secret: false }])}
        >
          <Plus className="size-3.5" /> Adicionar variável
        </Button>
      </TabsContent>

      <TabsContent value="text" className="mt-3 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={"# formato CHAVE=valor\nNODE_ENV=production\nDATABASE_URL=postgres://..."}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="text-xs"
            onClick={() => {
              const p = parseEnv(text);
              onChange(p);
              toast.success(`${p.length} variáveis aplicadas`);
            }}
          >
            Aplicar texto
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function StacksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOperator = user?.role === "admin" || user?.role === "operator";

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"compose" | "git">("compose");

  const [name, setName] = useState("");
  const [composeYaml, setComposeYaml] = useState(TEMPLATES["custom"]!.yaml);
  const [envVars, setEnvVars] = useState<StackEnvVar[]>([]);
  const [gitRepo, setGitRepo] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitPath, setGitPath] = useState("compose.yaml");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [deployNow, setDeployNow] = useState(true);

  const [editStack, setEditStack] = useState<StackSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editMode, setEditMode] = useState<"compose" | "git">("compose");
  const [editYaml, setEditYaml] = useState("");
  const [editEnv, setEditEnv] = useState<StackEnvVar[]>([]);
  const [editGitRepo, setEditGitRepo] = useState("");
  const [editGitBranch, setEditGitBranch] = useState("main");
  const [editGitPath, setEditGitPath] = useState("compose.yaml");
  const [editAutoDeploy, setEditAutoDeploy] = useState(false);
  const [editRedeploy, setEditRedeploy] = useState(true);

  const [logStack, setLogStack] = useState<StackSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StackSummary | null>(null);
  const [removeVolumes, setRemoveVolumes] = useState(false);

  const {
    data: stacks = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["stacks"],
    queryFn: api.stacks.list,
  });

  const handleOpenEdit = (s: StackSummary) => {
    setEditStack(s);
    setEditName(s.name);
    setEditMode(s.type);
    setEditYaml(s.composeYaml || TEMPLATES["custom"]!.yaml);
    setEditEnv(s.env || []);
    setEditGitRepo(s.gitRepo || "");
    setEditGitBranch(s.gitBranch || "main");
    setEditGitPath(s.gitPath || "compose.yaml");
    setEditAutoDeploy(Boolean(s.autoDeploy));
    setEditRedeploy(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateStackRequest) => api.stacks.create(data),
    onSuccess: (res) => {
      toast.success(`Stack '${res.name}' criada com sucesso!`);
      setIsCreateOpen(false);
      setName("");
      setComposeYaml(TEMPLATES["custom"]!.yaml);
      setEnvVars([]);
      setGitRepo("");
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao criar stack: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateStackRequest }) =>
      api.stacks.update(id, payload),
    onSuccess: (res) => {
      toast.success(
        editRedeploy
          ? `Stack '${res.name}' atualizada e redeploy iniciado!`
          : `Stack '${res.name}' atualizada com sucesso!`,
      );
      setEditStack(null);
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao atualizar stack: ${err.message}`);
    },
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStack) return;
    if (!editName.trim()) {
      toast.error("Informe o nome da stack");
      return;
    }
    if (editMode === "compose" && !editYaml.trim()) {
      toast.error("O arquivo docker-compose.yml é obrigatório");
      return;
    }
    if (editMode === "git" && !editGitRepo.trim()) {
      toast.error("A URL do repositório Git é obrigatória");
      return;
    }

    updateMutation.mutate({
      id: editStack.id,
      payload: {
        name: editName.trim().toLowerCase(),
        type: editMode,
        composeYaml: editMode === "compose" ? editYaml : editYaml || undefined,
        gitRepo: editMode === "git" ? editGitRepo.trim() : undefined,
        gitBranch: editMode === "git" ? editGitBranch.trim() : undefined,
        gitPath: editMode === "git" ? editGitPath.trim() : undefined,
        autoDeploy: editMode === "git" ? editAutoDeploy : false,
        env: editEnv.filter((v) => v.key.trim().length > 0),
        redeploy: editRedeploy,
      },
    });
  };

  const deployMutation = useMutation({
    mutationFn: (id: string) => api.stacks.deploy(id),
    onSuccess: () => {
      toast.success("Deploy concluído com sucesso!");
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro no deploy: ${err.message}`);
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.stacks.stop(id),
    onSuccess: () => {
      toast.success("Stack parada.");
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao parar stack: ${err.message}`);
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.stacks.start(id),
    onSuccess: () => {
      toast.success("Stack iniciada.");
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao iniciar stack: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, vols }: { id: string; vols: boolean }) => api.stacks.remove(id, vols),
    onSuccess: (_, vars) => {
      toast.success("Stack removida.");
      queryClient.setQueryData<StackSummary[]>(["stacks"], (old) =>
        old ? old.filter((s) => s.id !== vars.id) : [],
      );
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao remover stack: ${err.message}`);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Informe o nome da stack");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      type: createMode,
      composeYaml: createMode === "compose" ? composeYaml : undefined,
      gitRepo: createMode === "git" ? gitRepo.trim() : undefined,
      gitBranch: createMode === "git" ? gitBranch.trim() : undefined,
      gitPath: createMode === "git" ? gitPath.trim() : undefined,
      env: envVars.filter((v) => v.key.trim().length > 0),
      autoDeploy,
      deployNow,
    });
  };

  return (
    <>
      <PageHeader
        title="Stacks"
        subtitle={`${stacks.length} stacks Docker Compose orquestradas no host`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              Atualizar
            </Button>
            {isOperator && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" /> Nova stack
              </Button>
            )}
          </div>
        }
      />

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro ao carregar stacks</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Falha ao obter stacks orquestradas."}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Panel key={i} className="p-5">
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-60 mb-4" />
              <Skeleton className="h-3 w-28" />
            </Panel>
          ))}
        </div>
      ) : stacks.length === 0 ? (
        <Panel className="p-12 text-center text-muted-foreground">
          <FileStack className="mx-auto size-10 mb-3 opacity-40" />
          <p className="text-base font-medium">Nenhuma stack Docker Compose configurada</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Crie stacks declarativas com múltiplos containers, redes e volumes via editor Compose ou
            sincronizando repositórios Git.
          </p>
          {isOperator && (
            <Button className="mt-4" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" /> Criar Primeira Stack
            </Button>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {stacks.map((s) => {
            const isRunning = s.status === "deployed" || s.runningContainersCount > 0;
            const isDeploying = s.status === "deploying" || deployMutation.isPending;

            return (
              <Panel
                key={s.id}
                className="p-5 flex flex-col justify-between hover:border-foreground/20 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                        <FileStack className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-base text-foreground">{s.name}</p>
                          <Badge variant="outline" className="font-mono text-[10px] py-0 uppercase">
                            {s.type}
                          </Badge>
                        </div>
                        {s.type === "git" ? (
                          <p className="truncate font-mono text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <GitBranch className="size-3 shrink-0" />
                            {s.gitRepo} ({s.gitBranch})
                          </p>
                        ) : (
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">
                            compose.yaml local
                          </p>
                        )}
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium text-xs capitalize",
                        isRunning
                          ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                          : s.status === "deploying"
                            ? "border-sky-500/30 text-sky-500 bg-sky-500/5"
                            : s.status === "failed"
                              ? "border-rose-500/30 text-rose-500 bg-rose-500/5"
                              : "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {s.status === "deployed"
                        ? "Ativa"
                        : s.status === "deploying"
                          ? "Fazendo deploy"
                          : s.status === "failed"
                            ? "Falha"
                            : "Parada"}
                    </Badge>
                  </div>

                  {/* Containers list in stack */}
                  <div className="mt-4 rounded-lg border bg-surface p-3 text-xs font-mono">
                    <div className="flex items-center justify-between text-muted-foreground mb-2">
                      <span className="flex items-center gap-1.5 font-sans font-medium text-foreground">
                        <Boxes className="size-3.5" />
                        Containers ({s.runningContainersCount}/{s.containersCount} rodando)
                      </span>
                      {s.recentDeployment && (
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline flex items-center gap-1"
                          onClick={() => setLogStack(s)}
                        >
                          <Terminal className="size-3" /> Logs de deploy
                        </button>
                      )}
                    </div>

                    {s.containers.length === 0 ? (
                      <p className="text-muted-foreground text-[11px]">
                        Nenhum container ativo associado a esta stack no momento.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {s.containers.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 border-b pb-1 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  c.state === "running"
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground/50",
                                )}
                              />
                              <span className="text-foreground font-semibold truncate">
                                {c.name}
                              </span>
                              <span className="text-muted-foreground text-[10px] truncate">
                                ({c.image})
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground shrink-0">
                              {c.ports.length > 0
                                ? c.ports
                                    .map(
                                      (p) =>
                                        `${p.hostPort ? `${p.hostPort}:` : ""}${p.containerPort}`,
                                    )
                                    .join(", ")
                                : "sem portas"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t pt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isOperator && (
                      <Button
                        size="sm"
                        disabled={isDeploying}
                        onClick={() => deployMutation.mutate(s.id)}
                      >
                        {isDeploying ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Rocket className="size-3.5" />
                        )}
                        Redeploy
                      </Button>
                    )}
                    {isOperator && (
                      <Button size="sm" variant="outline" onClick={() => handleOpenEdit(s)}>
                        <Code2 className="size-3.5" /> Editar Stack
                      </Button>
                    )}
                    {isOperator && isRunning ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => stopMutation.mutate(s.id)}
                        disabled={stopMutation.isPending}
                      >
                        <Square className="size-3.5" /> Parar
                      </Button>
                    ) : isOperator ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startMutation.mutate(s.id)}
                        disabled={startMutation.isPending}
                      >
                        <RotateCw className="size-3.5" /> Iniciar
                      </Button>
                    ) : null}
                  </div>

                  {isOperator && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setDeleteTarget(s);
                        setRemoveVolumes(false);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Create Stack Wizard */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Criar nova stack Docker Compose</DialogTitle>
            <DialogDescription>
              Escreva diretamente um arquivo docker-compose.yml ou aponte para um repositório Git.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome da Stack *</Label>
                <Input
                  placeholder="ex.: web-app"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                  }
                  className="mt-1 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Origem da Stack</Label>
                <Select
                  value={createMode}
                  onValueChange={(v) => setCreateMode(v as "compose" | "git")}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compose">Editor Web (docker-compose.yml)</SelectItem>
                    <SelectItem value="git">Repositório Git (GitHub, GitLab...)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {createMode === "compose" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Modelo Pronto (Opcional)</Label>
                  <Select
                    onValueChange={(v) => {
                      if (TEMPLATES[v]) setComposeYaml(TEMPLATES[v]!.yaml);
                    }}
                  >
                    <SelectTrigger className="w-56 h-8 text-xs">
                      <SelectValue placeholder="Selecione um modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATES).map(([k, t]) => (
                        <SelectItem key={k} value={k}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">docker-compose.yml *</Label>
                  <Textarea
                    value={composeYaml}
                    onChange={(e) => setComposeYaml(e.target.value)}
                    rows={12}
                    className="mt-1 font-mono text-xs leading-relaxed"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">URL do Repositório Git *</Label>
                  <Input
                    placeholder="https://github.com/org/meu-projeto.git"
                    value={gitRepo}
                    onChange={(e) => setGitRepo(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Branch</Label>
                    <Input
                      placeholder="main"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Caminho do Compose no Repo</Label>
                    <Input
                      placeholder="compose.yaml ou docker-compose.yml"
                      value={gitPath}
                      onChange={(e) => setGitPath(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="auto-deploy"
                    checked={autoDeploy}
                    onCheckedChange={(v) => setAutoDeploy(Boolean(v))}
                  />
                  <label
                    htmlFor="auto-deploy"
                    className="text-xs font-medium text-muted-foreground cursor-pointer"
                  >
                    Ativar Webhook para auto-deploy no push do GitHub Actions
                  </label>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Variáveis de Ambiente (.env)
              </Label>
              <EnvEditor env={envVars} onChange={setEnvVars} />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="deploy-now"
                checked={deployNow}
                onCheckedChange={(v) => setDeployNow(Boolean(v))}
              />
              <label
                htmlFor="deploy-now"
                className="text-xs font-medium text-foreground cursor-pointer"
              >
                Executar deploy imediatamente após salvar
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
                {createMutation.isPending ? "Criando stack..." : "Salvar Stack"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Stack Dialog */}
      <Dialog open={Boolean(editStack)} onOpenChange={(open) => !open && setEditStack(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Editar stack: {editStack?.name}</DialogTitle>
            <DialogDescription>
              Altere qualquer configuração da stack, variáveis de ambiente ou repositório Git.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome da Stack *</Label>
                <Input
                  placeholder="ex.: web-app"
                  value={editName}
                  onChange={(e) =>
                    setEditName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                  }
                  className="mt-1 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Origem da Stack</Label>
                <Select value={editMode} onValueChange={(v) => setEditMode(v as "compose" | "git")}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compose">Editor Web (docker-compose.yml)</SelectItem>
                    <SelectItem value="git">Repositório Git (GitHub, GitLab...)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editMode === "compose" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Modelo Pronto (Opcional)</Label>
                  <Select
                    onValueChange={(v) => {
                      if (TEMPLATES[v]) setEditYaml(TEMPLATES[v]!.yaml);
                    }}
                  >
                    <SelectTrigger className="w-56 h-8 text-xs">
                      <SelectValue placeholder="Aplicar modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATES).map(([k, t]) => (
                        <SelectItem key={k} value={k}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">docker-compose.yml *</Label>
                  <Textarea
                    value={editYaml}
                    onChange={(e) => setEditYaml(e.target.value)}
                    rows={12}
                    className="mt-1 font-mono text-xs leading-relaxed"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">URL do Repositório Git *</Label>
                  <Input
                    placeholder="https://github.com/org/meu-projeto.git"
                    value={editGitRepo}
                    onChange={(e) => setEditGitRepo(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Branch</Label>
                    <Input
                      placeholder="main"
                      value={editGitBranch}
                      onChange={(e) => setEditGitBranch(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Caminho do Compose no Repo</Label>
                    <Input
                      placeholder="compose.yaml ou docker-compose.yml"
                      value={editGitPath}
                      onChange={(e) => setEditGitPath(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="edit-auto-deploy"
                    checked={editAutoDeploy}
                    onCheckedChange={(v) => setEditAutoDeploy(Boolean(v))}
                  />
                  <label
                    htmlFor="edit-auto-deploy"
                    className="text-xs font-medium text-muted-foreground cursor-pointer"
                  >
                    Ativar Webhook para auto-deploy no push do GitHub Actions
                  </label>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Variáveis de Ambiente (.env)
              </Label>
              <EnvEditor env={editEnv} onChange={setEditEnv} />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="edit-redeploy"
                checked={editRedeploy}
                onCheckedChange={(v) => setEditRedeploy(Boolean(v))}
              />
              <label
                htmlFor="edit-redeploy"
                className="text-xs font-medium text-foreground cursor-pointer"
              >
                Executar deploy imediatamente após salvar (Redeploy)
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditStack(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending || !editName.trim()}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Salvando alterações...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deployment Log Dialog */}
      <Dialog open={Boolean(logStack)} onOpenChange={(open) => !open && setLogStack(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">
              Logs de Deploy: {logStack?.name}
            </DialogTitle>
            <DialogDescription>
              Saída do terminal durante o último deploy ({logStack?.recentDeployment?.triggeredBy})
            </DialogDescription>
          </DialogHeader>

          <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-surface p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {logStack?.recentDeployment?.outputLog || "Nenhum log registrado para este deploy."}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Delete Stack Alert */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover stack Docker Compose?</AlertDialogTitle>
            <AlertDialogDescription>
              A stack <strong className="font-mono text-foreground">{deleteTarget?.name}</strong> e
              todos os seus containers serão parados e removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="remove-vols"
              checked={removeVolumes}
              onCheckedChange={(v) => setRemoveVolumes(Boolean(v))}
            />
            <label
              htmlFor="remove-vols"
              className="text-xs font-medium leading-none text-muted-foreground cursor-pointer"
            >
              Remover também os volumes nomeados declarados na stack (-v)
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate({ id: deleteTarget.id, vols: removeVolumes });
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                "Sim, remover stack"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
