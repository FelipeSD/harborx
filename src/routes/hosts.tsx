import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Plus,
  Users,
  Shield,
  FileText,
  Download,
  Trash2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Scissors,
  UserCheck,
  UserX,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Panel, Meter } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import type { User, UserRole } from "../../shared/types";

export const Route = createFileRoute("/hosts")({
  head: () => ({
    meta: [
      { title: "Host & Sistema — HarborX" },
      {
        name: "description",
        content: "Gerencie recursos do host Docker, usuários RBAC, auditoria e backups.",
      },
      { property: "og:title", content: "Host & Sistema — HarborX" },
    ],
  }),
  component: HostsPage,
});

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoOrTs: string): string {
  try {
    return new Date(isoOrTs).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoOrTs;
  }
}

function HostsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const isOperator = isAdmin || user?.role === "operator";

  const [activeTab, setActiveTab] = useState("host");

  // User management state
  const [isNewUserOpen, setIsNewUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("operator");
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);

  // Maintenance state
  const [isPruneOpen, setIsPruneOpen] = useState(false);

  // Queries
  const {
    data: hostInfo,
    isLoading: hostLoading,
    refetch: refetchHost,
  } = useQuery({
    queryKey: ["system-host"],
    queryFn: api.system.host,
  });

  const { data: dockerInfo, refetch: refetchDocker } = useQuery({
    queryKey: ["system-info"],
    queryFn: api.system.info,
  });

  const { data: diskDf, refetch: refetchDf } = useQuery({
    queryKey: ["system-df"],
    queryFn: api.system.df,
  });

  const {
    data: users = [],
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["users"],
    queryFn: api.users.list,
    enabled: isAdmin,
  });

  const {
    data: auditData,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.auditLogs.list({ limit: 50, offset: 0 }),
    enabled: isOperator,
  });

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: (data: { username: string; password: string; role: UserRole }) =>
      api.users.create(data),
    onSuccess: (u) => {
      toast.success(`Usuário '${u.username}' criado com sucesso!`);
      setIsNewUserOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("operator");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao criar usuário: ${err.message}`);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: UserRole; disabled?: boolean } }) =>
      api.users.update(id, patch),
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao atualizar usuário: ${err.message}`);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.users.remove(id),
    onSuccess: () => {
      toast.success("Usuário removido");
      setDeleteUserTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao remover usuário: ${err.message}`);
    },
  });

  const pruneSystemMutation = useMutation({
    mutationFn: () => api.system.prune(),
    onSuccess: (res) => {
      toast.success(`Limpeza concluída! ${formatBytes(res.spaceReclaimed)} liberados em disco.`);
      setIsPruneOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["system-df"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["images"] });
      void queryClient.invalidateQueries({ queryKey: ["volumes"] });
      void queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao limpar sistema: ${err.message}`);
    },
  });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência");
  };

  const vmInstallCmd = `docker run -d \\
  --name harborx \\
  --restart always \\
  -p 3000:3000 \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v harborx-data:/data \\
  felip/harborx:latest`;

  const memPercent =
    hostInfo && hostInfo.totalMem > 0
      ? Math.round((hostInfo.usedMem / hostInfo.totalMem) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title="Host & Configurações"
        subtitle="Gerencie o Docker Engine local, usuários RBAC, trilha de auditoria e backups do sistema"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchHost();
                void refetchDocker();
                void refetchDf();
                if (isAdmin) void refetchUsers();
                if (isOperator) void refetchAudit();
              }}
            >
              <RefreshCw className="size-4" /> Atualizar
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 min-w-0">
        <TabsList className="bg-surface border w-full sm:w-auto h-auto flex flex-wrap justify-start sm:justify-center p-1 gap-1 max-w-full">
          <TabsTrigger value="host" className="text-xs px-2.5 py-1.5">
            Host & Engine
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="text-xs px-2.5 py-1.5">
              Usuários & RBAC
            </TabsTrigger>
          )}
          {isOperator && (
            <TabsTrigger value="audit" className="text-xs px-2.5 py-1.5">
              Log de Auditoria
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="maintenance" className="text-xs px-2.5 py-1.5">
              Manutenção & Backup
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: Host & Docker Engine */}
        <TabsContent value="host" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel className="p-4 sm:p-5 overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-base font-semibold text-foreground truncate">
                    {hostInfo?.hostname || "Docker Host"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {hostInfo?.platform} ({hostInfo?.arch}) · Kernel {hostInfo?.release}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5 shrink-0"
                >
                  Online
                </Badge>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between text-xs gap-1 mb-1.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                      <Cpu className="size-3.5" /> Processador
                    </span>
                    <span className="font-mono text-xs font-medium truncate max-w-full sm:max-w-xs text-right">
                      {hostInfo?.cpusCount} núcleos ({hostInfo?.cpuModel})
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap justify-between gap-1 text-xs mb-1.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <HardDrive className="size-3.5" /> Memória RAM
                    </span>
                    <span className="font-mono text-xs font-medium">
                      {formatBytes(hostInfo?.usedMem || 0)} / {formatBytes(hostInfo?.totalMem || 0)}{" "}
                      ({memPercent}%)
                    </span>
                  </div>
                  <Meter value={memPercent} />
                </div>

                <div>
                  <div className="flex flex-wrap justify-between gap-1 text-xs mb-1.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Server className="size-3.5" /> Armazenamento Docker
                    </span>
                    <span className="font-mono text-xs font-medium">
                      {formatBytes(diskDf?.layersSize || 0)} em uso
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t pt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Containers</p>
                  <p className="font-mono text-base font-semibold mt-1">
                    {dockerInfo?.containersRunning}/{dockerInfo?.containers}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Imagens</p>
                  <p className="font-mono text-base font-semibold mt-1">{dockerInfo?.images}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Versão Engine</p>
                  <p className="font-mono text-xs font-semibold mt-2 truncate">
                    v{dockerInfo?.serverVersion}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel className="p-4 sm:p-5 flex flex-col justify-between overflow-hidden">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-foreground mb-1">
                  Adicionar HarborX em novas VMs
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Instale o container do HarborX em qualquer máquina virtual Linux ou servidor
                  conectado com Docker em 1 comando:
                </p>

                <div className="relative rounded-lg border bg-surface p-3 font-mono text-[11px] leading-relaxed text-foreground min-w-0">
                  <pre className="whitespace-pre overflow-x-auto overscroll-x-contain pr-8 max-w-full">
                    {vmInstallCmd}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 size-7 text-muted-foreground"
                    onClick={() => copy(vmInstallCmd)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Distribuição Portátil:</p>
                <p>
                  O HarborX é auto-contido. O volume persistente <code>/data</code> armazena o banco
                  SQLite WAL, os arquivos de stacks e as chaves de criptografia.
                </p>
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* Tab 2: Users & RBAC */}
        {isAdmin && (
          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Controle de Acesso Baseado em Papéis (RBAC)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Administre quem pode gerenciar containers, executar comandos e visualizar
                  recursos.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setIsNewUserOpen(true)}
                className="self-start sm:self-auto"
              >
                <Plus className="size-4" /> Novo Usuário
              </Button>
            </div>

            <Panel className="overflow-hidden">
              {/* Mobile Card View (< 768px) */}
              <div className="block md:hidden p-3 space-y-3">
                {usersLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    ))
                  : users.map((u) => {
                      const isSelf = user?.id === u.id;
                      return (
                        <div
                          key={u.id}
                          className="rounded-lg border bg-card/60 p-3 text-xs space-y-2.5 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-mono text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {isSelf && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] py-0 px-1 font-sans"
                                >
                                  você
                                </Badge>
                              )}
                            </div>
                            {u.disabled ? (
                              <Badge
                                variant="outline"
                                className="border-rose-500/30 text-rose-500 bg-rose-500/5 text-[10px]"
                              >
                                Desativado
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-[10px]"
                              >
                                Ativo
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">Papel (Role):</span>
                            <Select
                              value={u.role}
                              disabled={isSelf}
                              onValueChange={(newR) =>
                                updateUserMutation.mutate({
                                  id: u.id,
                                  patch: { role: newR as UserRole },
                                })
                              }
                            >
                              <SelectTrigger className="w-32 h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Administrador</SelectItem>
                                <SelectItem value="operator">Operador</SelectItem>
                                <SelectItem value="viewer">Visualizador</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground pt-1 border-t">
                            <span>Criado em {formatDate(u.createdAt)}</span>
                            {!isSelf && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  aria-label={u.disabled ? `Ativar usuário ${u.username}` : `Desativar usuário ${u.username}`}
                                  onClick={() =>
                                    updateUserMutation.mutate({
                                      id: u.id,
                                      patch: { disabled: !u.disabled },
                                    })
                                  }
                                >
                                  {u.disabled ? (
                                    <UserCheck className="size-3 text-emerald-500 mr-1" />
                                  ) : (
                                    <UserX className="size-3 text-amber-500 mr-1" />
                                  )}
                                  {u.disabled ? "Ativar" : "Desativar"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Remover usuário ${u.username}`}
                                  onClick={() => setDeleteUserTarget(u)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
              </div>

              {/* Desktop Multi-column Table (>= 768px) */}
              <div className="hidden md:block overflow-x-auto overscroll-x-contain">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Usuário</th>
                      <th className="px-4 py-3 font-medium">Papel (Role)</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Criado em</th>
                      <th className="px-4 py-3 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading
                      ? Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-28" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-20" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-16" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-24" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-12" />
                            </td>
                          </tr>
                        ))
                      : users.map((u) => {
                          const isSelf = user?.id === u.id;

                          return (
                            <tr
                              key={u.id}
                              className="border-b last:border-0 hover:bg-accent/40 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                                {u.username}{" "}
                                {isSelf && <span className="text-[10px] text-primary">(você)</span>}
                              </td>
                              <td className="px-4 py-3">
                                <Select
                                  value={u.role}
                                  disabled={isSelf}
                                  onValueChange={(newR) =>
                                    updateUserMutation.mutate({
                                      id: u.id,
                                      patch: { role: newR as UserRole },
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-32 h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Administrador</SelectItem>
                                    <SelectItem value="operator">Operador</SelectItem>
                                    <SelectItem value="viewer">Visualizador</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-4 py-3">
                                {u.disabled ? (
                                  <Badge
                                    variant="outline"
                                    className="border-rose-500/30 text-rose-500 bg-rose-500/5 text-[10px]"
                                  >
                                    Desativado
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-[10px]"
                                  >
                                    Ativo
                                  </Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                {formatDate(u.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {!isSelf && (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() =>
                                        updateUserMutation.mutate({
                                          id: u.id,
                                          patch: { disabled: !u.disabled },
                                        })
                                      }
                                    >
                                      {u.disabled ? (
                                        <UserCheck className="size-3 text-emerald-500" />
                                      ) : (
                                        <UserX className="size-3 text-amber-500" />
                                      )}
                                      {u.disabled ? "Ativar" : "Desativar"}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => setDeleteUserTarget(u)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>
        )}

        {/* Tab 3: Audit Log */}
        {isOperator && (
          <TabsContent value="audit" className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Trilha de Auditoria do Sistema
              </h3>
              <p className="text-xs text-muted-foreground">
                Registro imutável de todas as ações de ciclo de vida de containers, imagens, stacks
                e autenticação.
              </p>
            </div>

            <Panel className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-xs font-mono">
                <thead className="border-b text-left uppercase tracking-wider text-muted-foreground text-[11px] font-sans">
                  <tr>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Data / Hora</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Ação</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Usuário</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Alvo</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">IP</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <Skeleton className="h-3 w-28" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-3 w-20" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-3 w-16" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-3 w-20" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-3 w-16" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-3 w-32" />
                        </td>
                      </tr>
                    ))
                  ) : auditData?.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhum evento registrado.
                      </td>
                    </tr>
                  ) : (
                    auditData?.items.map((log) => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {formatDate(log.ts)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-foreground font-semibold">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-foreground font-medium whitespace-nowrap">
                          {log.username || "sistema"}
                        </td>
                        <td className="px-4 py-2.5 truncate max-w-[140px] sm:max-w-xs">
                          {log.target || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {log.ip || "—"}
                        </td>
                        <td
                          className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px] sm:max-w-sm"
                          title={log.details ? JSON.stringify(log.details) : undefined}
                        >
                          {log.details ? JSON.stringify(log.details) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Panel>
          </TabsContent>
        )}

        {/* Tab 4: Maintenance & Backup */}
        {isAdmin && (
          <TabsContent value="maintenance" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Panel className="p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="size-4 text-primary" />
                    <h3 className="font-semibold text-sm text-foreground">
                      Backup do Banco de Dados
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Faça download de um snapshot consistente do banco SQLite WAL contendo todos os
                    usuários, stacks, registros e histórico de auditoria.
                  </p>
                </div>

                <a
                  href="/api/system/backup"
                  download
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Download className="size-3.5" /> Baixar Backup (.db)
                </a>
              </Panel>

              <Panel className="p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-rose-500">
                    <Scissors className="size-4" />
                    <h3 className="font-semibold text-sm text-foreground">
                      Limpeza Geral do Docker (Prune)
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Remove todos os containers parados, redes não utilizadas, imagens suspensas e
                    caches de build do Docker Engine.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive text-xs"
                  onClick={() => setIsPruneOpen(true)}
                  disabled={pruneSystemMutation.isPending}
                  aria-label="Executar limpeza do sistema Docker"
                >
                  {pruneSystemMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Scissors className="size-3.5" />
                  )}
                  {pruneSystemMutation.isPending ? "Limpando sistema..." : "Executar Limpeza Geral"}
                </Button>
              </Panel>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* New User Dialog */}
      <Dialog open={isNewUserOpen} onOpenChange={setIsNewUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar novo usuário</DialogTitle>
            <DialogDescription>
              Defina o nome de usuário, senha e nível de privilégio no HarborX.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newUsername.trim() || !newPassword) return;
              createUserMutation.mutate({
                username: newUsername.trim(),
                password: newPassword,
                role: newRole,
              });
            }}
            className="space-y-4 py-2"
          >
            <div>
              <label className="text-xs font-medium">Nome de usuário *</label>
              <Input
                placeholder="ex.: joao"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium">Senha * (mínimo 8 caracteres)</label>
              <Input
                type="password"
                placeholder="••••••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium">Papel (Nível de Acesso) *</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">
                    Operador (Containers, Logs, Exec, Stacks)
                  </SelectItem>
                  <SelectItem value="viewer">Visualizador (Somente leitura e logs)</SelectItem>
                  <SelectItem value="admin">Administrador (Controle total do sistema)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setIsNewUserOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? "Criando..." : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Alert */}
      <AlertDialog
        open={Boolean(deleteUserTarget)}
        onOpenChange={(open) => !open && setDeleteUserTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário <strong className="text-foreground">{deleteUserTarget?.username}</strong>{" "}
              perderá o acesso imediatamente e todas as suas sessões ativas serão invalidadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUserMutation.isPending}
              onClick={() => {
                if (deleteUserTarget) {
                  deleteUserMutation.mutate(deleteUserTarget.id);
                }
              }}
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* System Prune Alert */}
      <AlertDialog open={isPruneOpen} onOpenChange={setIsPruneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpeza geral do Docker Engine?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá containers parados, redes vazias, imagens sem uso e volumes não
              montados. Containers em execução não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel
              className="w-full sm:w-auto"
              disabled={pruneSystemMutation.isPending}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pruneSystemMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                pruneSystemMutation.mutate();
              }}
            >
              {pruneSystemMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Limpando sistema...
                </>
              ) : (
                "Confirmar Limpeza"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
