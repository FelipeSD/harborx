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
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Pencil,
  Copy,
  Code,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
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
  UpdateRegistryRequest,
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
    warning?: string | undefined;
    scopes?: string[] | undefined;
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
        if (res.warning) {
          toast.warning(res.warning);
        } else {
          toast.success(res.status || "Credenciais e permissões validadas com sucesso!");
        }
        setTestResult({
          success: true,
          message: res.status || "Autenticação bem-sucedida!",
          warning: res.warning,
          scopes: res.scopes,
        });
      } else {
        toast.error(res.error || "Falha na validação das credenciais");
        setTestResult({
          success: false,
          message: res.error || "Falha na validação das credenciais",
          warning: res.warning,
          scopes: res.scopes,
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

  const [editTarget, setEditTarget] = useState<RegistrySummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editSecret, setEditSecret] = useState("");
  const [editTestResult, setEditTestResult] = useState<{
    success: boolean;
    message: string;
    warning?: string | undefined;
    scopes?: string[] | undefined;
  } | null>(null);

  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const handleOpenEdit = (r: RegistrySummary) => {
    setEditTarget(r);
    setEditName(r.name);
    setEditUrl(r.url);
    setEditUsername(r.username);
    setEditSecret("");
    setEditTestResult(null);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRegistryRequest }) =>
      api.registries.update(id, data),
    onSuccess: (item) => {
      toast.success(`Registro '${item.name}' atualizado com sucesso!`);
      setEditTarget(null);
      setEditTestResult(null);
      void queryClient.invalidateQueries({ queryKey: ["registries"] });
    },
    onError: (err: Error) => {
      toast.error(`Falha ao atualizar registro: ${err.message}`);
    },
  });

  const editTestMutation = useMutation({
    mutationFn: (data: TestRegistryRequest) => api.registries.test(data),
    onSuccess: (res) => {
      if (res.success) {
        if (res.warning) {
          toast.warning(res.warning);
        } else {
          toast.success(res.status || "Credenciais e permissões validadas com sucesso!");
        }
        setEditTestResult({
          success: true,
          message: res.status || "Autenticação bem-sucedida!",
          warning: res.warning,
          scopes: res.scopes,
        });
      } else {
        toast.error(res.error || "Falha na validação das credenciais");
        setEditTestResult({
          success: false,
          message: res.error || "Falha na validação das credenciais",
          warning: res.warning,
          scopes: res.scopes,
        });
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao testar credenciais: ${err.message}`);
      setEditTestResult({
        success: false,
        message: err.message,
      });
    },
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName.trim() || !editUrl.trim() || !editUsername.trim()) {
      toast.error("Preencha o nome, URL e usuário");
      return;
    }
    updateMutation.mutate({
      id: editTarget.id,
      data: {
        name: editName.trim(),
        url: editUrl.trim(),
        username: editUsername.trim(),
        secret: editSecret.trim() ? editSecret.trim() : undefined,
      },
    });
  };

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

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
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

      {/* Educational Guide Card */}
      <Panel className="mb-6 border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <HelpCircle className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                Como funciona a integração com Stacks e Compose?
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Entenda como o HarborX autentica e como você referencia imagens privadas nos seus
                arquivos compose.yaml.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs shrink-0"
            onClick={() => setIsGuideOpen(!isGuideOpen)}
          >
            {isGuideOpen ? (
              <>
                Ocultar guia <ChevronUp className="size-3.5" />
              </>
            ) : (
              <>
                Ver guia prático <ChevronDown className="size-3.5" />
              </>
            )}
          </Button>
        </div>

        {isGuideOpen && (
          <div className="mt-4 pt-4 border-t border-primary/10 space-y-4 text-xs">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-surface/80 p-3 space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" /> 1. Autenticação Global
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Ao salvar um registro aqui, o HarborX sincroniza as credenciais seguras no{" "}
                  <code>config.json</code> do Docker daemon.
                </p>
              </div>
              <div className="rounded-lg border bg-surface/80 p-3 space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="size-3.5 text-primary" /> 2. Deploy Automático
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Quando você sobe ou atualiza uma Stack no HarborX, o{" "}
                  <code>docker compose pull</code> lê essas credenciais automaticamente.
                </p>
              </div>
              <div className="rounded-lg border bg-surface/80 p-3 space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <RefreshCw className="size-3.5 text-primary" /> 3. Atualizar Imagens
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Se você atualizou a tag no GitHub/DockerHub, use a ação de{" "}
                  <strong>Re-pull / Recriar</strong> na Stack para puxar a nova versão.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-surface/80 p-3 space-y-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Code className="size-3.5 text-primary" /> Exemplos de sintaxe no compose.yaml:
              </span>
              <div className="grid gap-2 sm:grid-cols-2 font-mono text-[11px]">
                <div className="rounded bg-muted/50 p-2 border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-sans font-medium">
                    GitHub Container Registry (GHCR)
                  </span>
                  <code className="text-primary">image: ghcr.io/seu-usuario/app:latest</code>
                </div>
                <div className="rounded bg-muted/50 p-2 border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-sans font-medium">
                    Docker Hub (Privado ou Pró)
                  </span>
                  <code className="text-primary">image: seu-usuario/app:latest</code>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

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
            const cleanDomain = r.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
            const exampleImage = isGhcr
              ? `ghcr.io/${r.username}/meu-projeto:latest`
              : isDockerHub
                ? `${r.username}/meu-projeto:latest`
                : `${cleanDomain}/${r.username}/meu-projeto:latest`;

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

                  <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span className="flex items-center gap-1">
                        <Code className="size-3" /> Exemplo no compose.yaml:
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] gap-1 hover:text-foreground"
                        onClick={() =>
                          copyToClipboard(`image: ${exampleImage}`, "Exemplo de compose")
                        }
                      >
                        <Copy className="size-2.5" /> Copiar
                      </Button>
                    </div>
                    <code className="font-mono text-[11px] text-foreground select-all">
                      image: {exampleImage}
                    </code>
                  </div>
                </div>

                <div className="mt-5 border-t pt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Conectado em {formatDate(r.createdAt)}</span>
                  {isOperator && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-foreground hover:bg-muted"
                        onClick={() => handleOpenEdit(r)}
                      >
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="size-3.5" /> Remover
                      </Button>
                    </div>
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
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0 border-b">
            <DialogTitle>Conectar registro de containers</DialogTitle>
            <DialogDescription>
              As credenciais são armazenadas de forma segura com criptografia AES-256-GCM.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 p-6 py-4 overflow-y-auto flex-1 min-w-0"
          >
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
                {url.toLowerCase().includes("ghcr.io") || url.toLowerCase().includes("github.com")
                  ? "Para GitHub (GHCR e Stacks), utilize um Personal Access Token com os escopos 'repo' (para clonar stacks) e 'read:packages' (para baixar imagens)."
                  : url.toLowerCase().includes("gitlab")
                    ? "Para GitLab (Registry e Stacks), utilize um Deploy Token ou PAT com os escopos 'read_repository' (para stacks) e 'read_registry'."
                    : url.toLowerCase().includes("docker.io")
                      ? "Para Docker Hub, utilize a senha da conta ou um Access Token gerado nas configurações de segurança."
                      : "Senha da conta do registro ou token de acesso com permissão de pull/clone."}
              </p>
            </div>

            {testResult && (
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed transition-all",
                  testResult.success && !testResult.warning
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300"
                    : testResult.warning
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {testResult.success && !testResult.warning ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                ) : testResult.warning ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    {testResult.success && !testResult.warning
                      ? "Permissões validadas com sucesso!"
                      : testResult.warning
                        ? "Aviso de permissões"
                        : "Permissões insuficientes ou falha na autenticação"}
                  </p>
                  <p className="text-[11px] opacity-90 mt-0.5 whitespace-pre-wrap break-words">
                    {testResult.message}
                  </p>
                  {testResult.warning && (
                    <p className="text-[11px] font-medium text-amber-500 mt-1.5 whitespace-pre-wrap">
                      {testResult.warning}
                    </p>
                  )}
                  {testResult.scopes && testResult.scopes.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted-foreground mr-1">
                        Escopos detectados:
                      </span>
                      {testResult.scopes.map((sc) => (
                        <Badge
                          key={sc}
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1 py-0 font-mono",
                            sc === "repo"
                              ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {sc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="p-4 px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 -mx-6 -mb-4 mt-4 bg-background">
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
                    Validando permissões...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5 text-primary" />
                    Testar agora (Conexão e Permissões)
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

      {/* Edit Registry Dialog */}
      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditTestResult(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0 border-b">
            <DialogTitle>Editar registro de containers</DialogTitle>
            <DialogDescription>
              Atualize as informações de conexão ou rotacione o token de autenticação.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleEditSubmit}
            className="space-y-4 p-6 py-4 overflow-y-auto flex-1 min-w-0"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Nome de identificação
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ex: GitHub Container Registry"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                URL do Registro / Domínio
              </label>
              <Input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="docker.io, ghcr.io ou registry.gitlab.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Usuário / Organização
              </label>
              <Input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Seu usuário no GitHub/DockerHub"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Nova Senha / Personal Access Token (PAT)
              </label>
              <Input
                type="password"
                value={editSecret}
                onChange={(e) => setEditSecret(e.target.value)}
                placeholder="Deixe em branco para manter a credencial atual"
              />
              <p className="text-[11px] text-muted-foreground">
                Se desejar trocar ou rotacionar o token/senha, digite o novo valor aqui. Se deixar
                em branco, a credencial salva continuará sendo utilizada.
              </p>
            </div>

            {editTestResult && (
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed transition-all",
                  editTestResult.success && !editTestResult.warning
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300"
                    : editTestResult.warning
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {editTestResult.success && !editTestResult.warning ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
                ) : editTestResult.warning ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    {editTestResult.success && !editTestResult.warning
                      ? "Permissões validadas com sucesso!"
                      : editTestResult.warning
                        ? "Aviso de permissões"
                        : "Permissões insuficientes ou falha na autenticação"}
                  </p>
                  <p className="text-[11px] opacity-90 mt-0.5 whitespace-pre-wrap break-words">
                    {editTestResult.message}
                  </p>
                  {editTestResult.warning && (
                    <p className="text-[11px] font-medium text-amber-500 mt-1.5 whitespace-pre-wrap">
                      {editTestResult.warning}
                    </p>
                  )}
                  {editTestResult.scopes && editTestResult.scopes.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted-foreground mr-1">
                        Escopos detectados:
                      </span>
                      {editTestResult.scopes.map((sc) => (
                        <Badge
                          key={sc}
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1 py-0 font-mono",
                            sc === "repo"
                              ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {sc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="p-4 px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 -mx-6 -mb-4 mt-4 bg-background">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                disabled={editTestMutation.isPending || !editUrl.trim() || !editUsername.trim()}
                onClick={() => {
                  if (!editTarget) return;
                  editTestMutation.mutate({
                    registryId: editTarget.id,
                    url: editUrl.trim(),
                    username: editUsername.trim(),
                    secret: editSecret.trim() ? editSecret.trim() : undefined,
                  });
                }}
              >
                {editTestMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Validando permissões...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5 text-primary" />
                    Testar agora (Conexão e Permissões)
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
                    setEditTarget(null);
                    setEditTestResult(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="h-9" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Alterações"
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
