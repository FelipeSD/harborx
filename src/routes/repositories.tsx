import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Server,
  Lock,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import type {
  CreateRegistryRequest,
  RegistrySummary,
  TestRegistryRequest,
} from "../../shared/types";

export const Route = createFileRoute("/repositories")({
  head: () => ({
    meta: [
      { title: "Registros de Containers — HarborX" },
      {
        name: "description",
        content: "Gerencie credenciais autenticadas para Docker Hub, GHCR e registros privados.",
      },
      { property: "og:title", content: "Registros de Containers — HarborX" },
    ],
  }),
  component: RegistriesPage,
});

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

const REGISTRY_PRESETS = [
  {
    id: "dockerhub",
    label: "Docker Hub",
    domain: "docker.io",
    defaultName: "Docker Hub",
  },
  {
    id: "ghcr",
    label: "GitHub (GHCR)",
    domain: "ghcr.io",
    defaultName: "GitHub Packages",
  },
  {
    id: "gitlab",
    label: "GitLab",
    domain: "registry.gitlab.com",
    defaultName: "GitLab Registry",
  },
  {
    id: "custom",
    label: "Personalizado",
    domain: "",
    defaultName: "",
  },
] as const;

function RegistriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOperator = user?.role === "admin" || user?.role === "operator";

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RegistrySummary | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const {
    data: registries = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["registries"],
    queryFn: api.registries.list,
  });

  const testMutation = useMutation({
    mutationFn: (data: TestRegistryRequest) => api.registries.test(data),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.status || "Credenciais validadas com sucesso!");
        setTestResult({
          success: true,
          message: res.status || "Autenticação bem-sucedida!",
        });
      } else {
        toast.error(res.error || "Falha na validação das credenciais");
        setTestResult({
          success: false,
          message: res.error || "Falha na validação das credenciais",
        });
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao testar credenciais: ${err.message}`);
      setTestResult({
        success: false,
        message: err.message,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateRegistryRequest) => api.registries.create(data),
    onSuccess: (item) => {
      toast.success(`Registro '${item.name}' adicionado com sucesso!`);
      setIsAddOpen(false);
      setName("");
      setUrl("");
      setUsername("");
      setSecret("");
      setTestResult(null);
      void queryClient.invalidateQueries({ queryKey: ["registries"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao salvar registro: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.registries.remove(id),
    onSuccess: () => {
      toast.success("Registro removido.");
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["registries"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao remover registro: ${err.message}`);
    },
  });

  const applyPreset = (preset: (typeof REGISTRY_PRESETS)[number]) => {
    if (preset.domain) {
      setUrl(preset.domain);
      if (!name || REGISTRY_PRESETS.some((p) => p.defaultName === name)) {
        setName(preset.defaultName);
      }
    } else {
      if (REGISTRY_PRESETS.some((p) => p.domain === url)) {
        setUrl("");
      }
    }
    setTestResult(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || !username.trim() || !secret.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      url: url.trim(),
      username: username.trim(),
      secret: secret.trim(),
    });
  };

  return (
    <>
      <PageHeader
        title="Registros & Autenticação"
        subtitle="Credenciais de autenticação para Docker Hub, GHCR e registros privados (criptografia AES-256-GCM)"
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
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus className="size-4" /> Conectar registro
              </Button>
            )}
          </div>
        }
      />

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro ao carregar registros</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Falha ao obter lista de registros."}
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
      ) : registries.length === 0 ? (
        <Panel className="p-12 text-center text-muted-foreground">
          <Server className="mx-auto size-10 mb-3 opacity-40" />
          <p className="text-base font-medium">Nenhum registro autenticado configurado</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Por padrão, imagens públicas do Docker Hub são baixadas sem autenticação. Adicione seu
            Docker Hub Pro ou GitHub Container Registry (ghcr.io) para baixar imagens privadas e
            evitar rate limits.
          </p>
          {isOperator && (
            <Button className="mt-4" size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" /> Adicionar Primeiro Registro
            </Button>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {registries.map((r) => {
            const isGhcr = r.url.includes("ghcr.io");
            const isDockerHub = r.url.includes("docker.io");

            return (
              <Panel
                key={r.id}
                className="p-5 flex flex-col justify-between hover:border-foreground/20 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                        <Server className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground">{r.name}</p>
                          <Badge variant="outline" className="font-mono text-[10px] py-0">
                            {isGhcr ? "GHCR" : isDockerHub ? "Docker Hub" : "Privado"}
                          </Badge>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">{r.url}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                      <ShieldCheck className="size-4" /> Ativo
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg border bg-surface px-3 py-2 text-xs flex items-center justify-between font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Usuário:</span>
                      <span className="font-semibold text-foreground">{r.username}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Lock className="size-3" />
                      <span>Criptografado (AES-256)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Conectado em {formatDate(r.createdAt)}</span>
                  {isOperator && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Trash2 className="size-3.5" /> Remover
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* Add Registry Dialog */}
      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) setTestResult(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar registro de containers</DialogTitle>
            <DialogDescription>
              As credenciais são armazenadas de forma segura com criptografia AES-256-GCM.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Predefinições Rápidas
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {REGISTRY_PRESETS.map((p) => {
                  const isSelected =
                    (p.domain && url.toLowerCase() === p.domain.toLowerCase()) ||
                    (!p.domain &&
                      url &&
                      !["docker.io", "ghcr.io", "registry.gitlab.com"].includes(url.toLowerCase()));
                  return (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant={isSelected ? "secondary" : "outline"}
                      className={cn(
                        "h-8 text-xs px-2 justify-center",
                        isSelected &&
                          "border-primary/50 text-foreground font-semibold bg-primary/10",
                      )}
                      onClick={() => applyPreset(p)}
                    >
                      {p.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Nome Amigável *</label>
              <Input
                placeholder="ex.: GitHub Registry ou Meu Docker Hub"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium">Domínio / URL do Registro *</label>
              <Input
                placeholder="ex.: docker.io ou ghcr.io ou registry.meudominio.com"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                }}
                className="mt-1 font-mono text-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {url.toLowerCase().includes("ghcr.io")
                  ? "Para GitHub Container Registry, utilize 'ghcr.io'."
                  : url.toLowerCase().includes("gitlab")
                    ? "Para GitLab Container Registry, utilize 'registry.gitlab.com'."
                    : url.toLowerCase().includes("docker.io")
                      ? "Para Docker Hub, utilize 'docker.io'."
                      : "Domínio ou IP do registro privado (ex.: registry.empresa.com ou host:5000)."}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium">Usuário / Organização *</label>
              <Input
                placeholder="ex.: usuario ou org"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setTestResult(null);
                }}
                className="mt-1 font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium">Senha ou Personal Access Token (PAT) *</label>
              <Input
                type="password"
                placeholder="••••••••••••••••"
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setTestResult(null);
                }}
                className="mt-1 font-mono text-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {url.toLowerCase().includes("ghcr.io")
                  ? "Para GitHub (GHCR), utilize um Personal Access Token com escopo 'read:packages' (e 'write:packages' para push)."
                  : url.toLowerCase().includes("gitlab")
                    ? "Para GitLab, utilize um Deploy Token ou PAT com o escopo 'read_registry'."
                    : url.toLowerCase().includes("docker.io")
                      ? "Para Docker Hub, utilize a senha da conta ou um Access Token gerado nas configurações de segurança."
                      : "Senha da conta do registro ou token de acesso com permissão de pull/push."}
              </p>
            </div>

            {testResult && (
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed transition-all",
                  testResult.success
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold">
                    {testResult.success
                      ? "Conexão e autenticação bem-sucedidas!"
                      : "Falha na conexão / autenticação"}
                  </p>
                  <p className="text-[11px] opacity-90 mt-0.5">{testResult.message}</p>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                disabled={
                  testMutation.isPending || !url.trim() || !username.trim() || !secret.trim()
                }
                onClick={() => {
                  testMutation.mutate({
                    url: url.trim(),
                    username: username.trim(),
                    secret: secret.trim(),
                  });
                }}
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Testando conexão...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5 text-primary" />
                    Testar Conexão
                  </>
                )}
              </Button>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setIsAddOpen(false);
                    setTestResult(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="h-9" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Registro"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Registry Alert */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registro autenticado?</AlertDialogTitle>
            <AlertDialogDescription>
              As credenciais salvas para{" "}
              <strong className="font-mono text-foreground">
                {deleteTarget?.name} ({deleteTarget?.url})
              </strong>{" "}
              serão removidas. Downloads futuros de imagens privadas desse registro não terão
              autenticação automática.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Removendo..." : "Sim, remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
