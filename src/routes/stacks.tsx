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
  AlertTriangle,
  Boxes,
  Terminal,
  ExternalLink,
  Code2,
  Copy,
  Loader2,
  ShieldCheck,
  ChevronDown,
  Zap,
  Play,
  CheckCircle2,
  HelpCircle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { BackupToolkitInjectorDialog } from "@/components/stacks/BackupToolkitInjectorDialog";
import type {
  CreateStackRequest,
  StackEnvVar,
  StackSummary,
  TestGitRepoRequest,
  UpdateStackRequest,
} from "../../shared/types";

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

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
  postgres_backup: {
    label: "🛡️ PostgreSQL 16 + Backup Toolkit (Cloudflare R2)",
    yaml: `services:
  postgres:
    image: postgres:16-alpine
    container_name: \${CONTAINER_PREFIX:-app}-postgres
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-secret}
      POSTGRES_DB: \${POSTGRES_DB:-app_production}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-app} -d \${POSTGRES_DB:-app_production}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  database-backup:
    image: \${BACKUP_TOOLKIT_IMAGE:-felipesdam496/backup-toolkit:latest-postgres}
    container_name: \${CONTAINER_PREFIX:-app}-database-backup
    restart: unless-stopped
    environment:
      DB_TYPE: postgres
      DB_HOST: postgres
      DB_PORT: "5432"
      DB_NAME: \${POSTGRES_DB:-app_production}
      DB_USER: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-secret}
      R2_BUCKET: \${BACKUP_R2_BUCKET:-app-backups}
      R2_ENDPOINT: \${R2_ENDPOINT:-}
      AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: \${AWS_SECRET_ACCESS_KEY:-}
      RESTIC_PASSWORD: \${BACKUP_RESTIC_PASSWORD:-}
      BACKUP_INTERVAL_SECONDS: \${BACKUP_INTERVAL_SECONDS:-86400}
      BACKUP_KEEP_DAILY: \${BACKUP_KEEP_DAILY:-7}
      BACKUP_KEEP_WEEKLY: \${BACKUP_KEEP_WEEKLY:-4}
      BACKUP_KEEP_MONTHLY: \${BACKUP_KEEP_MONTHLY:-12}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - backend
      - backup-egress

volumes:
  postgres_data:

networks:
  backend:
    internal: true
  backup-egress:
`,
  },
  mysql_backup: {
    label: "🛡️ MySQL 8.0 + Backup Toolkit (Cloudflare R2)",
    yaml: `services:
  mysql:
    image: mysql:8.0
    container_name: \${CONTAINER_PREFIX:-app}-mysql
    environment:
      MYSQL_DATABASE: \${MYSQL_DATABASE:-app_production}
      MYSQL_USER: \${MYSQL_USER:-app}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD:-secret}
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD:-supersecret}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  database-backup:
    image: \${BACKUP_TOOLKIT_IMAGE:-felipesdam496/backup-toolkit:latest-mysql}
    container_name: \${CONTAINER_PREFIX:-app}-database-backup
    restart: unless-stopped
    environment:
      DB_TYPE: mysql
      DB_HOST: mysql
      DB_PORT: "3306"
      DB_NAME: \${MYSQL_DATABASE:-app_production}
      DB_USER: \${MYSQL_USER:-app}
      DB_PASSWORD: \${MYSQL_PASSWORD:-secret}
      R2_BUCKET: \${BACKUP_R2_BUCKET:-app-backups}
      R2_ENDPOINT: \${R2_ENDPOINT:-}
      AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: \${AWS_SECRET_ACCESS_KEY:-}
      RESTIC_PASSWORD: \${BACKUP_RESTIC_PASSWORD:-}
      BACKUP_INTERVAL_SECONDS: \${BACKUP_INTERVAL_SECONDS:-86400}
      BACKUP_KEEP_DAILY: \${BACKUP_KEEP_DAILY:-7}
      BACKUP_KEEP_WEEKLY: \${BACKUP_KEEP_WEEKLY:-4}
      BACKUP_KEEP_MONTHLY: \${BACKUP_KEEP_MONTHLY:-12}
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - backend
      - backup-egress

volumes:
  mysql_data:

networks:
  backend:
    internal: true
  backup-egress:
`,
  },
  mongo_backup: {
    label: "🛡️ MongoDB 7.0 + Backup Toolkit (Cloudflare R2)",
    yaml: `services:
  mongo:
    image: mongo:7.0
    container_name: \${CONTAINER_PREFIX:-app}-mongo
    environment:
      MONGO_INITDB_ROOT_USERNAME: \${MONGO_USER:-app}
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD:-secret}
      MONGO_INITDB_DATABASE: \${MONGO_DB:-app_production}
    volumes:
      - mongodata:/data/db
    ports:
      - "27017:27017"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  database-backup:
    image: \${BACKUP_TOOLKIT_IMAGE:-felipesdam496/backup-toolkit:latest-mongodb}
    container_name: \${CONTAINER_PREFIX:-app}-database-backup
    restart: unless-stopped
    environment:
      DB_TYPE: mongodb
      DB_HOST: mongo
      DB_PORT: "27017"
      DB_NAME: \${MONGO_DB:-app_production}
      DB_USER: \${MONGO_USER:-app}
      DB_PASSWORD: \${MONGO_PASSWORD:-secret}
      R2_BUCKET: \${BACKUP_R2_BUCKET:-app-backups}
      R2_ENDPOINT: \${R2_ENDPOINT:-}
      AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: \${AWS_SECRET_ACCESS_KEY:-}
      RESTIC_PASSWORD: \${BACKUP_RESTIC_PASSWORD:-}
      BACKUP_INTERVAL_SECONDS: \${BACKUP_INTERVAL_SECONDS:-86400}
      BACKUP_KEEP_DAILY: \${BACKUP_KEEP_DAILY:-7}
      BACKUP_KEEP_WEEKLY: \${BACKUP_KEEP_WEEKLY:-4}
      BACKUP_KEEP_MONTHLY: \${BACKUP_KEEP_MONTHLY:-12}
    depends_on:
      mongo:
        condition: service_healthy
    networks:
      - backend
      - backup-egress

volumes:
  mongodata:

networks:
  backend:
    internal: true
  backup-egress:
`,
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
          <div
            key={i}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0 p-2 sm:p-0 rounded-lg sm:rounded-none border sm:border-0 bg-surface/40 sm:bg-transparent"
          >
            <Input
              value={e.key}
              placeholder="CHAVE"
              className="w-full sm:w-2/5 min-w-0 font-mono text-xs"
              onChange={(ev) =>
                update(i, {
                  key: ev.target.value.toUpperCase().replace(/[^A-Z0-9_.]/g, "_"),
                })
              }
            />
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Input
                value={e.value}
                placeholder="valor"
                type={e.secret && !show[i] ? "password" : "text"}
                className="flex-1 min-w-0 font-mono text-xs"
                onChange={(ev) => update(i, { value: ev.target.value })}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
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
                className="size-8 shrink-0 text-destructive"
                onClick={() => {
                  const next = env.filter((_, j) => j !== i);
                  onChange(next);
                  setText(toText(next));
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
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
  const [gitRegistryId, setGitRegistryId] = useState<string>("auto");
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
  const [editGitRegistryId, setEditGitRegistryId] = useState<string>("auto");
  const [editAutoDeploy, setEditAutoDeploy] = useState(false);
  const [editRedeploy, setEditRedeploy] = useState(true);
  const [editPull, setEditPull] = useState(false);

  const [logStack, setLogStack] = useState<StackSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StackSummary | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [removeVolumes, setRemoveVolumes] = useState(false);
  const [isInjectorOpen, setIsInjectorOpen] = useState(false);
  const [injectorTarget, setInjectorTarget] = useState<"create" | "edit">("create");
  const [isTestingHook, setIsTestingHook] = useState<string | null>(null);
  const [webhookGuideStack, setWebhookGuideStack] = useState<StackSummary | null>(null);

  const [gitTestResult, setGitTestResult] = useState<{
    success: boolean;
    message: string;
    warning?: string | undefined;
  } | null>(null);

  const [editGitTestResult, setEditGitTestResult] = useState<{
    success: boolean;
    message: string;
    warning?: string | undefined;
  } | null>(null);

  const testGitMutation = useMutation({
    mutationFn: (data: TestGitRepoRequest) => api.stacks.testGit(data),
    onSuccess: (res) => {
      if (res.success) {
        if (res.warning) {
          toast.warning(res.warning);
        } else {
          toast.success(res.status || "Conexão com Git validada com sucesso!");
        }
        setGitTestResult({
          success: true,
          message: res.status || "Conexão com repositório Git bem-sucedida!",
          warning: res.warning,
        });
      } else {
        toast.error(res.error || "Falha ao validar repositório Git");
        setGitTestResult({
          success: false,
          message: res.error || "Falha ao validar repositório Git",
        });
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao testar Git: ${err.message}`);
      setGitTestResult({
        success: false,
        message: err.message,
      });
    },
  });

  const editTestGitMutation = useMutation({
    mutationFn: (data: TestGitRepoRequest) => api.stacks.testGit(data),
    onSuccess: (res) => {
      if (res.success) {
        if (res.warning) {
          toast.warning(res.warning);
        } else {
          toast.success(res.status || "Conexão com Git validada com sucesso!");
        }
        setEditGitTestResult({
          success: true,
          message: res.status || "Conexão com repositório Git bem-sucedida!",
          warning: res.warning,
        });
      } else {
        toast.error(res.error || "Falha ao validar repositório Git");
        setEditGitTestResult({
          success: false,
          message: res.error || "Falha ao validar repositório Git",
        });
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao testar Git: ${err.message}`);
      setEditGitTestResult({
        success: false,
        message: err.message,
      });
    },
  });

  const { data: registries = [] } = useQuery({
    queryKey: ["registries"],
    queryFn: api.registries.list,
  });

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleTestWebhook = async (stack: StackSummary) => {
    setIsTestingHook(stack.id);
    try {
      const webhookUrl = `${window.location.origin}/api/public/hooks/${stack.webhookToken}`;
      const res = await fetch(webhookUrl, { method: "POST" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      toast.success(`Webhook disparado! O deploy da stack '${stack.name}' foi iniciado.`);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao disparar webhook: ${msg}`);
    } finally {
      setIsTestingHook(null);
    }
  };

  const handleInjectBackup = (newYaml: string, newEnv: StackEnvVar[]) => {
    if (injectorTarget === "create") {
      setComposeYaml(newYaml);
      setEnvVars(newEnv);
    } else {
      setEditYaml(newYaml);
      setEditEnv(newEnv);
    }
  };

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
    refetchInterval: (query) =>
      query.state.data?.some((s) => s.status === "deploying") ? 2000 : false,
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
    setEditGitRegistryId(s.gitRegistryId || "auto");
    setEditAutoDeploy(Boolean(s.autoDeploy));
    setEditRedeploy(true);
    setEditPull(false);
    setEditGitTestResult(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateStackRequest) => api.stacks.create(data),
    onSuccess: (res) => {
      toast.success(
        deployNow
          ? `Stack '${res.name}' criada! Acompanhando deploy...`
          : `Stack '${res.name}' criada com sucesso!`,
      );
      setIsCreateOpen(false);
      setName("");
      setComposeYaml(TEMPLATES["custom"]!.yaml);
      setEnvVars([]);
      setGitRepo("");
      setGitRegistryId("auto");
      setGitTestResult(null);
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      if (deployNow) {
        setLogStack(res);
      }
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
          ? editPull
            ? `Stack '${res.name}' atualizada e redeploy com repull iniciado!`
            : `Stack '${res.name}' atualizada e redeploy iniciado!`
          : `Stack '${res.name}' atualizada com sucesso!`,
      );
      setEditStack(null);
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      if (editRedeploy) {
        setLogStack(res);
      }
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
        gitRegistryId:
          editMode === "git"
            ? editGitRegistryId === "auto" || editGitRegistryId === "none"
              ? null
              : editGitRegistryId
            : undefined,
        autoDeploy: editMode === "git" ? editAutoDeploy : false,
        env: editEnv.filter((v) => v.key.trim().length > 0),
        redeploy: editRedeploy,
        pull: editRedeploy ? editPull : false,
      },
    });
  };

  const deployMutation = useMutation({
    mutationFn: (args: string | { id: string; pull?: boolean }) => {
      const id = typeof args === "string" ? args : args.id;
      const pull = typeof args === "string" ? false : Boolean(args.pull);
      return api.stacks.deploy(id, { pull });
    },
    onSuccess: (_, args) => {
      const isPull = typeof args !== "string" && Boolean(args.pull);
      toast.success(
        isPull
          ? "Deploy e Repull concluídos com imagens atualizadas!"
          : "Deploy concluído com sucesso!",
      );
      void queryClient.invalidateQueries({ queryKey: ["stacks"] });
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
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
    mutationFn: ({ id, vols, confirmName }: { id: string; vols: boolean; confirmName: string }) =>
      api.stacks.remove(id, vols, confirmName),
    onSuccess: (_, vars) => {
      toast.success("Stack removida.");
      queryClient.setQueryData<StackSummary[]>(["stacks"], (old) =>
        old ? old.filter((s) => s.id !== vars.id) : [],
      );
      setDeleteTarget(null);
      setDeleteConfirmName("");
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
      gitRegistryId:
        createMode === "git"
          ? gitRegistryId === "auto" || gitRegistryId === "none"
            ? null
            : gitRegistryId
          : undefined,
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
            const total = s.containersCount;
            const running = s.runningContainersCount;
            const isRunning = s.status === "deployed" || running > 0;
            const isDeploying =
              s.status === "deploying" ||
              (deployMutation.isPending &&
                (typeof deployMutation.variables === "string"
                  ? deployMutation.variables === s.id
                  : deployMutation.variables?.id === s.id));
            const hasFailed =
              s.status === "failed" ||
              s.containers.some(
                (c) => c.state === "dead" || c.status?.toLowerCase().includes("unhealthy"),
              );

            let cardBorder = "border-border/80 bg-card/60 hover:border-primary/40";
            let iconBoxStyle = "bg-secondary text-secondary-foreground";
            let statusBadge = (
              <Badge
                variant="outline"
                className="font-medium text-xs border-muted-foreground/30 text-muted-foreground shrink-0 capitalize"
              >
                Totalmente Parada
              </Badge>
            );

            if (isDeploying) {
              cardBorder =
                "border-sky-500/50 bg-sky-500/[0.03] shadow-sm shadow-sky-500/10 ring-1 ring-sky-500/20";
              iconBoxStyle = "bg-sky-500/10 text-sky-500 animate-pulse";
              statusBadge = (
                <Badge
                  variant="outline"
                  className="font-medium text-xs border-sky-500/40 text-sky-500 bg-sky-500/10 flex items-center gap-1.5 shrink-0"
                >
                  <Loader2 className="size-3 animate-spin" />
                  Em Deploy
                </Badge>
              );
            } else if (hasFailed) {
              cardBorder =
                "border-rose-500/40 bg-rose-500/[0.02] shadow-sm shadow-rose-500/5 hover:border-rose-500/60";
              iconBoxStyle = "bg-rose-500/10 text-rose-500";
              statusBadge = (
                <Badge
                  variant="outline"
                  className="font-medium text-xs border-rose-500/40 text-rose-500 bg-rose-500/10 flex items-center gap-1.5 shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Falha Crítica
                </Badge>
              );
            } else if (total > 0 && running === total) {
              cardBorder =
                "border-emerald-500/40 bg-emerald-500/[0.02] shadow-sm shadow-emerald-500/5 hover:border-emerald-500/60";
              iconBoxStyle = "bg-emerald-500/10 text-emerald-500";
              statusBadge = (
                <Badge
                  variant="outline"
                  className="font-medium text-xs border-emerald-500/40 text-emerald-500 bg-emerald-500/10 flex items-center gap-1.5 shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  100% Operacional
                </Badge>
              );
            } else if (running > 0 && running < total) {
              cardBorder =
                "border-amber-500/40 bg-amber-500/[0.02] shadow-sm shadow-amber-500/5 hover:border-amber-500/60";
              iconBoxStyle = "bg-amber-500/10 text-amber-500";
              statusBadge = (
                <Badge
                  variant="outline"
                  className="font-medium text-xs border-amber-500/40 text-amber-500 bg-amber-500/10 flex items-center gap-1.5 shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  {running}/{total} Rodando
                </Badge>
              );
            }

            return (
              <Panel
                key={s.id}
                className={cn(
                  "p-5 flex flex-col justify-between transition-all duration-200",
                  cardBorder,
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3 flex-1">
                      <div
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                          iconBoxStyle,
                        )}
                      >
                        <FileStack className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold text-base text-foreground truncate max-w-[170px] sm:max-w-none">
                            {s.name}
                          </p>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] py-0 uppercase shrink-0"
                          >
                            {s.type}
                          </Badge>
                        </div>
                        {s.type === "git" ? (
                          <p className="truncate font-mono text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <GitBranch className="size-3 shrink-0" />
                            <span className="truncate">
                              {s.gitRepo} ({s.gitBranch})
                            </span>
                          </p>
                        ) : (
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">
                            compose.yaml local
                          </p>
                        )}
                      </div>
                    </div>

                    {statusBadge}
                  </div>

                  {s.status === "failed" && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="size-4 shrink-0 text-rose-500" />
                        <div className="min-w-0">
                          <span className="font-semibold block truncate">
                            Falha no deploy da stack
                          </span>
                          <span className="text-[11px] text-rose-400/90 truncate block">
                            O último deploy falhou. Inspecione a saída do terminal para identificar
                            o problema.
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-rose-500/40 text-rose-500 hover:bg-rose-500/15 shrink-0 gap-1 bg-background"
                        onClick={() => setLogStack(s)}
                      >
                        <Terminal className="size-3" /> Ver erro
                      </Button>
                    </div>
                  )}

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
                          className="text-[11px] hover:underline flex items-center gap-1 font-sans text-primary"
                          onClick={() => setLogStack(s)}
                        >
                          <Terminal className="size-3" />
                          Logs de deploy
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

                  {/* Webhook GitOps Bar */}
                  <div className="mt-3 rounded-lg border bg-surface/80 p-2.5 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="grid size-6 place-items-center rounded bg-primary/10 text-primary shrink-0">
                        <Zap className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground text-[11px]">
                            Webhook GitOps
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] py-0 px-1.5 font-medium shrink-0",
                              s.autoDeploy
                                ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5"
                                : "text-muted-foreground",
                            )}
                          >
                            {s.autoDeploy ? "Auto-deploy Ativo" : "Disponível"}
                          </Badge>
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground truncate break-all max-w-full">
                          {typeof window !== "undefined"
                            ? `${window.location.origin}/api/public/hooks/${s.webhookToken}`
                            : `/api/public/hooks/${s.webhookToken}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 self-start sm:self-auto flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => {
                          const url = `${window.location.origin}/api/public/hooks/${s.webhookToken}`;
                          copyToClipboard(url, "URL do Webhook");
                        }}
                      >
                        <Copy className="size-2.5" /> Copiar URL
                      </Button>
                      {isOperator && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1"
                          disabled={isTestingHook === s.id}
                          onClick={() => void handleTestWebhook(s)}
                        >
                          {isTestingHook === s.id ? (
                            <Loader2 className="size-2.5 animate-spin" />
                          ) : (
                            <Play className="size-2.5 text-emerald-500" />
                          )}
                          Disparar
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-primary gap-1"
                        onClick={() => setWebhookGuideStack(s)}
                      >
                        <ExternalLink className="size-2.5" /> CI/CD
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t pt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isOperator && (
                      <div className="inline-flex rounded-md shadow-xs">
                        <Button
                          size="sm"
                          className="rounded-r-none border-r border-primary-foreground/20"
                          disabled={isDeploying}
                          onClick={() => deployMutation.mutate({ id: s.id, pull: false })}
                          title="Redeploy simples usando as imagens já existentes"
                        >
                          {isDeploying ? (
                            <Loader2 className="size-3.5 animate-spin mr-1" />
                          ) : (
                            <Rocket className="size-3.5 mr-1" />
                          )}
                          Redeploy
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              className="rounded-l-none px-1.5"
                              disabled={isDeploying}
                              title="Opções de deploy"
                            >
                              <ChevronDown className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-64">
                            <DropdownMenuItem
                              onClick={() => deployMutation.mutate({ id: s.id, pull: false })}
                              disabled={isDeploying}
                              className="cursor-pointer"
                            >
                              <Rocket className="mr-2 size-3.5 text-blue-500" />
                              <div className="flex flex-col">
                                <span className="font-medium">Redeploy Padrão</span>
                                <span className="text-[11px] text-muted-foreground">
                                  Usa imagens locais / em cache
                                </span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deployMutation.mutate({ id: s.id, pull: true })}
                              disabled={isDeploying}
                              className="cursor-pointer"
                            >
                              <RefreshCw className="mr-2 size-3.5 text-emerald-500" />
                              <div className="flex flex-col">
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                  Redeploy com Repull
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  Busca imagens atualizadas no hub (--pull always)
                                </span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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
                        setDeleteConfirmName("");
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
        <DialogContent className="sm:max-w-4xl md:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-3 shrink-0 border-b">
            <DialogTitle>Criar nova stack Docker Compose</DialogTitle>
            <DialogDescription>
              Escreva diretamente um arquivo docker-compose.yml ou aponte para um repositório Git.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleCreateSubmit}
            className="space-y-4 overflow-y-auto flex-1 min-w-0 p-4 sm:p-6 py-3 sm:py-4 max-w-full"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
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
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">docker-compose.yml *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                      onClick={() => {
                        setInjectorTarget("create");
                        setIsInjectorOpen(true);
                      }}
                    >
                      <ShieldCheck className="size-3.5 text-primary" />
                      Anexar Backup Toolkit (R2)
                    </Button>
                  </div>
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

                <div>
                  <Label className="text-xs">Autenticação Git (para repositórios privados)</Label>
                  <Select value={gitRegistryId} onValueChange={setGitRegistryId}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Selecione a credencial..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Auto-detectar (usar token do GitHub/GitLab cadastrado em Registros)
                      </SelectItem>
                      <SelectItem value="none">Público (sem autenticação)</SelectItem>
                      {registries.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.username} @ {r.url})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    O HarborX usará o token salvo com segurança para autenticar o{" "}
                    <code>git clone</code>. Você não precisa colocar tokens na URL.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
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

                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Validar permissões e branch antes de salvar:
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      disabled={testGitMutation.isPending || !gitRepo.trim()}
                      onClick={() => {
                        testGitMutation.mutate({
                          gitRepo: gitRepo.trim(),
                          gitBranch: gitBranch.trim() || "main",
                          gitRegistryId: gitRegistryId === "auto" ? null : gitRegistryId,
                        });
                      }}
                    >
                      {testGitMutation.isPending ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          Testando Git...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-3.5 text-primary" />
                          Testar Acesso Git
                        </>
                      )}
                    </Button>
                  </div>

                  {gitTestResult && (
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-relaxed",
                        gitTestResult.success && !gitTestResult.warning
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300"
                          : gitTestResult.warning
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                      )}
                    >
                      {gitTestResult.success && !gitTestResult.warning ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                      ) : gitTestResult.warning ? (
                        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                      ) : (
                        <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">
                          {gitTestResult.success && !gitTestResult.warning
                            ? "Repositório acessível!"
                            : gitTestResult.warning
                              ? "Aviso de branch"
                              : "Falha de acesso ao repositório"}
                        </p>
                        <p className="text-[11px] opacity-90 mt-0.5 whitespace-pre-wrap break-words">
                          {gitTestResult.message}
                        </p>
                        {gitTestResult.warning && (
                          <p className="text-[11px] text-amber-500 font-medium mt-1">
                            {gitTestResult.warning}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
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

            <DialogFooter className="p-3 sm:p-4 px-4 sm:px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 -mx-4 sm:-mx-6 -mb-3 sm:-mb-4 mt-4 bg-background">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createMutation.isPending || !name.trim()}
              >
                {createMutation.isPending ? "Criando stack..." : "Salvar Stack"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Stack Dialog */}
      <Dialog open={Boolean(editStack)} onOpenChange={(open) => !open && setEditStack(null)}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 sm:p-6 pb-2 sm:pb-3 shrink-0 border-b">
            <DialogTitle>Editar stack: {editStack?.name}</DialogTitle>
            <DialogDescription>
              Altere qualquer configuração da stack, variáveis de ambiente ou repositório Git.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleEditSubmit}
            className="space-y-4 overflow-y-auto flex-1 min-w-0 p-4 sm:p-6 py-3 sm:py-4 max-w-full"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
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
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">docker-compose.yml *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                      onClick={() => {
                        setInjectorTarget("edit");
                        setIsInjectorOpen(true);
                      }}
                    >
                      <ShieldCheck className="size-3.5 text-primary" />
                      Anexar Backup Toolkit (R2)
                    </Button>
                  </div>
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

                <div>
                  <Label className="text-xs">Autenticação Git (para repositórios privados)</Label>
                  <Select value={editGitRegistryId} onValueChange={setEditGitRegistryId}>
                    <SelectTrigger className="mt-1 text-xs">
                      <SelectValue placeholder="Selecione a credencial..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Auto-detectar (usar token do GitHub/GitLab cadastrado em Registros)
                      </SelectItem>
                      <SelectItem value="none">Público (sem autenticação)</SelectItem>
                      {registries.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.username} @ {r.url})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    O HarborX usará o token salvo com segurança para autenticar o{" "}
                    <code>git clone</code> / <code>pull</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
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

                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Validar permissões e branch antes de atualizar:
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      disabled={editTestGitMutation.isPending || !editGitRepo.trim()}
                      onClick={() => {
                        editTestGitMutation.mutate({
                          gitRepo: editGitRepo.trim(),
                          gitBranch: editGitBranch.trim() || "main",
                          gitRegistryId: editGitRegistryId === "auto" ? null : editGitRegistryId,
                        });
                      }}
                    >
                      {editTestGitMutation.isPending ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          Testando Git...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-3.5 text-primary" />
                          Testar Acesso Git
                        </>
                      )}
                    </Button>
                  </div>

                  {editGitTestResult && (
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-relaxed",
                        editGitTestResult.success && !editGitTestResult.warning
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300"
                          : editGitTestResult.warning
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                      )}
                    >
                      {editGitTestResult.success && !editGitTestResult.warning ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                      ) : editGitTestResult.warning ? (
                        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                      ) : (
                        <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">
                          {editGitTestResult.success && !editGitTestResult.warning
                            ? "Repositório acessível!"
                            : editGitTestResult.warning
                              ? "Aviso de branch"
                              : "Falha de acesso ao repositório"}
                        </p>
                        <p className="text-[11px] opacity-90 mt-0.5 whitespace-pre-wrap break-words">
                          {editGitTestResult.message}
                        </p>
                        {editGitTestResult.warning && (
                          <p className="text-[11px] text-amber-500 font-medium mt-1">
                            {editGitTestResult.warning}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {editStack && (
                  <div className="rounded-lg border bg-surface/50 p-2.5 text-xs space-y-1">
                    <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="size-3 text-primary" /> Webhook da Stack:
                    </span>
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-mono bg-muted p-1 rounded flex-1 truncate select-all">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}/api/public/hooks/${editStack.webhookToken}`
                          : `/api/public/hooks/${editStack.webhookToken}`}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => {
                          const url = `${window.location.origin}/api/public/hooks/${editStack.webhookToken}`;
                          copyToClipboard(url, "URL do Webhook");
                        }}
                      >
                        <Copy className="size-2.5" /> Copiar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Variáveis de Ambiente (.env)
              </Label>
              <EnvEditor env={editEnv} onChange={setEditEnv} />
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-redeploy"
                  checked={editRedeploy}
                  onCheckedChange={(v) => {
                    const checked = Boolean(v);
                    setEditRedeploy(checked);
                    if (!checked) setEditPull(false);
                  }}
                />
                <label
                  htmlFor="edit-redeploy"
                  className="text-xs font-medium text-foreground cursor-pointer"
                >
                  Executar deploy imediatamente após salvar (Redeploy)
                </label>
              </div>

              {editRedeploy && (
                <div className="flex items-center space-x-2 pl-6">
                  <Checkbox
                    id="edit-pull"
                    checked={editPull}
                    onCheckedChange={(v) => setEditPull(Boolean(v))}
                  />
                  <label
                    htmlFor="edit-pull"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Buscar imagens atualizadas do registro no redeploy (Repull)
                  </label>
                </div>
              )}
            </div>

            <DialogFooter className="p-3 sm:p-4 px-4 sm:px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 -mx-4 sm:-mx-6 -mb-3 sm:-mb-4 mt-4 bg-background">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setEditStack(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={updateMutation.isPending || !editName.trim()}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
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
        <DialogContent className="sm:max-w-4xl md:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {(() => {
            const activeLogStack =
              (logStack ? stacks.find((s) => s.id === logStack.id) : null) || logStack;
            const isDeploying = activeLogStack?.status === "deploying";
            const isFailed =
              activeLogStack?.status === "failed" ||
              activeLogStack?.recentDeployment?.status === "failed";

            return (
              <>
                <DialogHeader className="p-6 pb-3 shrink-0 border-b">
                  <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="font-mono text-base flex items-center gap-2 min-w-0">
                      <Terminal className="size-4 text-primary shrink-0" />
                      <span className="truncate">Logs de Deploy: {activeLogStack?.name}</span>
                    </DialogTitle>
                    {activeLogStack && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-medium shrink-0",
                          isDeploying
                            ? "border-amber-500/40 text-amber-500 bg-amber-500/10 flex items-center gap-1.5"
                            : isFailed
                              ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
                              : "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
                        )}
                      >
                        {isDeploying ? (
                          <>
                            <Loader2 className="size-3 animate-spin" />
                            Deploy em andamento
                          </>
                        ) : isFailed ? (
                          "Falha no Deploy"
                        ) : (
                          "Deploy Concluído"
                        )}
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    Disparado por{" "}
                    <strong className="text-foreground">
                      {activeLogStack?.recentDeployment?.triggeredBy || "usuário"}
                    </strong>
                    {activeLogStack?.recentDeployment?.createdAt && (
                      <> em {formatDate(activeLogStack.recentDeployment.createdAt)}</>
                    )}
                  </DialogDescription>
                </DialogHeader>

                {isDeploying && (
                  <div className="flex items-center gap-2 px-6 py-2.5 bg-sky-500/10 border-b text-xs text-sky-500 font-medium animate-pulse">
                    <Loader2 className="size-3.5 animate-spin shrink-0" />
                    <span>
                      Executando processo de deploy (git clone & docker compose)... Os logs
                      anteriores foram limpos e a saída completa será gravada ao término da
                      execução.
                    </span>
                  </div>
                )}

                <div className="p-4 sm:p-6 py-3 sm:py-4 overflow-y-auto overscroll-contain flex-1 min-w-0 bg-muted/20">
                  <pre className="rounded-lg border bg-zinc-950 p-3 sm:p-4 font-mono text-xs leading-relaxed text-zinc-100 whitespace-pre-wrap break-all sm:break-normal select-all">
                    {isDeploying
                      ? "Iniciando o processo de deploy e orquestração dos containers...\nOs logs antigos foram limpos.\nAguarde a conclusão da execução para visualizar o relatório completo."
                      : activeLogStack?.recentDeployment?.outputLog ||
                        "Nenhum log registrado para este deploy ou a saída ainda não foi gravada."}
                  </pre>
                </div>

                <DialogFooter className="p-3 sm:p-4 px-4 sm:px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 w-full sm:w-auto"
                    disabled={!activeLogStack?.recentDeployment?.outputLog || isDeploying}
                    onClick={() => {
                      if (activeLogStack?.recentDeployment?.outputLog) {
                        copyToClipboard(
                          activeLogStack.recentDeployment.outputLog,
                          "Logs de Deploy",
                        );
                      }
                    }}
                  >
                    <Copy className="size-3.5" /> Copiar Saída do Terminal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setLogStack(null)}
                  >
                    Fechar
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Stack Alert */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5 shrink-0" />
              Remover stack Docker Compose?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A stack <strong className="font-mono text-foreground">{deleteTarget?.name}</strong> e
              todos os seus containers serão parados e removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(() => {
            const hasDatabase = deleteTarget?.containers?.some(
              (c) =>
                /postgres|mysql|mariadb|mongo|redis|mssql|clickhouse/i.test(c.image || "") ||
                /db|database/i.test(c.name || ""),
            );

            return (
              <div className="space-y-3.5 py-1">
                {hasDatabase && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-start gap-2.5">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Atenção: Banco de dados detectado nesta stack!
                      </p>
                      <p className="text-amber-400/90 text-[11px] leading-relaxed">
                        Esta stack contém containers de banco de dados. Certifique-se de que possui
                        backups atualizados antes de prosseguir com a remoção.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
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

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs text-muted-foreground block font-medium">
                    Para confirmar a remoção, digite o nome da stack{" "}
                    <strong className="text-foreground font-mono select-all">
                      {deleteTarget?.name}
                    </strong>
                    :
                  </label>
                  <Input
                    placeholder={deleteTarget?.name}
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    className="font-mono text-xs h-9"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            );
          })()}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmName("");
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteMutation.isPending ||
                !deleteTarget ||
                deleteConfirmName.trim() !== deleteTarget.name
              }
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget && deleteConfirmName.trim() === deleteTarget.name) {
                  deleteMutation.mutate({
                    id: deleteTarget.id,
                    vols: removeVolumes,
                    confirmName: deleteConfirmName.trim(),
                  });
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

      {/* Backup Toolkit R2 Injector Dialog */}
      <BackupToolkitInjectorDialog
        open={isInjectorOpen}
        onOpenChange={setIsInjectorOpen}
        currentYaml={injectorTarget === "create" ? composeYaml : editYaml}
        currentEnv={injectorTarget === "create" ? envVars : editEnv}
        stackName={injectorTarget === "create" ? name || "app" : editName || "app"}
        onInject={handleInjectBackup}
      />

      {/* CI/CD & Webhook Guide Dialog */}
      <Dialog
        open={Boolean(webhookGuideStack)}
        onOpenChange={(open) => !open && setWebhookGuideStack(null)}
      >
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2 text-base min-w-0">
              <Zap className="size-4 text-primary shrink-0" />
              <span className="truncate">
                Integração CI/CD & Webhook — {webhookGuideStack?.name}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dispare o redeploy automático desta stack sempre que seu pipeline de CI/CD ou push no
              GitHub terminar.
            </DialogDescription>
          </DialogHeader>

          {webhookGuideStack && (
            <div className="space-y-4 p-6 py-4 text-xs overflow-y-auto flex-1 min-w-0">
              <div className="rounded-lg border bg-surface p-3 space-y-1.5 min-w-0">
                <span className="font-semibold text-foreground block">URL do Webhook</span>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="font-mono text-[11px] bg-muted px-2 py-1.5 rounded flex-1 min-w-0 truncate select-all">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/api/public/hooks/${webhookGuideStack.webhookToken}`
                      : `/api/public/hooks/${webhookGuideStack.webhookToken}`}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs gap-1 shrink-0"
                    onClick={() => {
                      const url = `${window.location.origin}/api/public/hooks/${webhookGuideStack.webhookToken}`;
                      copyToClipboard(url, "URL do Webhook");
                    }}
                  >
                    <Copy className="size-3" /> Copiar
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-foreground truncate">
                    Exemplo no GitHub Actions (.github/workflows/deploy.yml)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] gap-1 shrink-0"
                    onClick={() => {
                      const snippet = `# .github/workflows/deploy.yml (passo final)
name: Deploy to HarborX
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger HarborX Redeploy
        run: |
          curl -fsS -X POST "${window.location.origin}/api/public/hooks/${webhookGuideStack.webhookToken}"`;
                      copyToClipboard(snippet, "Passo do GitHub Actions");
                    }}
                  >
                    <Copy className="size-2.5" /> Copiar YAML
                  </Button>
                </div>
                <pre className="rounded-lg border bg-muted/60 p-3 font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap break-all sm:break-normal sm:whitespace-pre max-w-full">
                  {`- name: Trigger HarborX Redeploy
  run: |
    curl -fsS -X POST "${typeof window !== "undefined" ? window.location.origin : ""}/api/public/hooks/${webhookGuideStack.webhookToken}"`}
                </pre>
              </div>

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-foreground truncate">
                    Disparo manual via Terminal / cURL
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] gap-1 shrink-0"
                    onClick={() => {
                      const cmd = `curl -X POST "${window.location.origin}/api/public/hooks/${webhookGuideStack.webhookToken}"`;
                      copyToClipboard(cmd, "Comando curl");
                    }}
                  >
                    <Copy className="size-2.5" /> Copiar comando
                  </Button>
                </div>
                <pre className="rounded-lg border bg-muted/60 p-2.5 font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap break-all sm:break-normal sm:whitespace-pre max-w-full">
                  {`curl -X POST "${typeof window !== "undefined" ? window.location.origin : ""}/api/public/hooks/${webhookGuideStack.webhookToken}"`}
                </pre>
              </div>
            </div>
          )}

          <DialogFooter className="p-4 px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
            {webhookGuideStack && isOperator && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={isTestingHook === webhookGuideStack.id}
                onClick={() => void handleTestWebhook(webhookGuideStack)}
              >
                {isTestingHook === webhookGuideStack.id ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Disparando...
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 text-emerald-500" />
                    Testar Disparo Agora
                  </>
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWebhookGuideStack(null)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
