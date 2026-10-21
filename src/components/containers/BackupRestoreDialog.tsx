import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  Database,
  Cloud,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Terminal,
  Tag,
  ShieldAlert,
  Copy,
  Check,
  Server,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  ContainerBackupInspection,
  ContainerSummary,
  ResticSnapshot,
} from "../../../shared/types";

export interface BackupRestoreDialogProps {
  container: ContainerSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDisplayDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return "Agora";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `há ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `há ${diffHour}h`;
    const diffDays = Math.floor(diffHour / 24);
    if (diffDays === 1) return "ontem";
    return `há ${diffDays} dias`;
  } catch {
    return "";
  }
}

export function BackupRestoreDialog({
  container,
  open,
  onOpenChange,
}: BackupRestoreDialogProps) {
  const queryClient = useQueryClient();
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("latest");
  const [typedConfirm, setTypedConfirm] = useState<string>("");
  const [copiedLog, setCopiedLog] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    log: string;
    message: string;
  } | null>(null);

  // Reset fields when modal is closed or opened for a new container
  useEffect(() => {
    if (open) {
      setSelectedSnapshotId("latest");
      setTypedConfirm("");
      setExecutionResult(null);
    }
  }, [open, container?.id]);

  // Query snapshots from R2/S3
  const {
    data: inspection,
    isLoading: isInspecting,
    isRefetching: isRefetchingSnapshots,
    error: inspectError,
    refetch: refetchSnapshots,
  } = useQuery<ContainerBackupInspection>({
    queryKey: ["backupSnapshots", container?.id],
    queryFn: () => (container ? api.containers.getBackupSnapshots(container.id) : null!),
    enabled: Boolean(open && container?.id),
    staleTime: 10000,
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (vars: { snapshotId: string; confirmText: string }) =>
      api.containers.restoreBackup(container!.id, vars),
    onSuccess: (data) => {
      setExecutionResult(data);
      toast.success(data.message || "Restauração concluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["containers"] });
      queryClient.invalidateQueries({ queryKey: ["backupSnapshots", container?.id] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha na restauração: ${msg}`);
      setExecutionResult({
        success: false,
        log: msg,
        message: "Erro durante o processo de restauração.",
      });
    },
  });

  const isRestoring = restoreMutation.isPending;
  const isDone = executionResult !== null;

  // Validation
  const containerName = container?.name || "";
  const isMatch =
    typedConfirm.trim().toLowerCase() === "restaurar" ||
    (Boolean(containerName) &&
      typedConfirm.trim().toLowerCase() === containerName.toLowerCase());

  const latestSnapshot = inspection?.latestSnapshot;
  const selectedSnapshot =
    selectedSnapshotId === "latest"
      ? latestSnapshot
      : inspection?.snapshots.find((s) => s.id === selectedSnapshotId || s.short_id === selectedSnapshotId);

  const handleCopyLog = () => {
    if (!executionResult?.log) return;
    navigator.clipboard.writeText(executionResult.log);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!isRestoring ? onOpenChange(o) : null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto font-sans p-6">
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
              <ArchiveRestore className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                Restaurar Backup do Banco de Dados (R2 / S3)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                Container: <span className="font-mono font-medium text-foreground">{containerName}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 1. RESTORING OR EXECUTION RESULT STATE */}
        {isRestoring || isDone ? (
          <div className="space-y-4 py-2">
            {isRestoring ? (
              <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Loader2 className="size-5 text-amber-500 animate-spin shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-500">
                      Restauração em Andamento...
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Conectando ao repositório Cloudflare R2, descarregando snapshot e aplicando dump no banco de dados.
                      Não recarregue esta página.
                    </p>
                  </div>
                </div>
              </div>
            ) : executionResult?.success ? (
              <div className="rounded-lg border bg-emerald-500/10 border-emerald-500/20 p-4 space-y-1">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <h4 className="text-sm font-semibold">Restauração Concluída com Sucesso!</h4>
                </div>
                <p className="text-xs text-muted-foreground pl-7">
                  {executionResult.message || "Os dados do snapshot foram aplicados e o banco está pronto para uso."}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border bg-destructive/10 border-destructive/20 p-4 space-y-1">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5 shrink-0" />
                  <h4 className="text-sm font-semibold">Falha na Restauração</h4>
                </div>
                <p className="text-xs text-destructive/90 pl-7">
                  {executionResult?.message || "Ocorreu um erro ao aplicar o dump. Verifique o terminal de execução abaixo."}
                </p>
              </div>
            )}

            {/* Execution Log Terminal */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <Terminal className="size-3.5" /> Log de Execução da Restauração
                </span>
                {executionResult?.log && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={handleCopyLog}
                  >
                    {copiedLog ? (
                      <>
                        <Check className="size-3 mr-1 text-emerald-500" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="size-3 mr-1" /> Copiar logs
                      </>
                    )}
                  </Button>
                )}
              </div>
              <pre className="p-3 bg-zinc-950 text-zinc-100 dark:bg-black rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto max-h-64 whitespace-pre-wrap break-all border border-zinc-800">
                {isRestoring && !executionResult?.log
                  ? "Inicializando conexão com Cloudflare R2 / S3 via restic...\nBaixando dados e aguardando processamento...\n"
                  : executionResult?.log || "Nenhum log retornado."}
              </pre>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant={executionResult?.success ? "default" : "outline"}
                disabled={isRestoring}
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto text-xs"
              >
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* 2. INSPECTION & CONFIRMATION FORM STATE */
          <div className="space-y-4 py-2">
            {/* Loading state for snapshots */}
            {isInspecting ? (
              <div className="rounded-lg border bg-surface/50 p-6 flex flex-col items-center justify-center gap-2.5 text-center">
                <Loader2 className="size-6 text-primary animate-spin" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">
                    Consultando snapshots no Cloudflare R2 / S3...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Inspecionando repositório e verificando datas de atualização dos backups.
                  </p>
                </div>
              </div>
            ) : inspectError || (inspection?.error && !inspection.snapshots.length) ? (
              /* Error or empty repository state */
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <h4 className="font-semibold text-destructive">
                      Não foi possível listar os snapshots do repositório
                    </h4>
                    <p className="text-muted-foreground leading-relaxed">
                      {inspectError instanceof Error
                        ? inspectError.message
                        : inspection?.error ||
                          "Nenhum snapshot foi encontrado ou o repositório R2/S3 ainda não foi inicializado."}
                    </p>
                  </div>
                </div>

                {inspection && (
                  <div className="text-[11px] font-mono bg-background/80 rounded p-2 border border-border/50 text-muted-foreground space-y-0.5">
                    <div>Repositório: {inspection.repository || "—"}</div>
                    <div>Banco Alvo: {inspection.dbType} ({inspection.dbHost}:{inspection.dbPort}/{inspection.dbName})</div>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => refetchSnapshots()}
                    disabled={isRefetchingSnapshots}
                  >
                    <RefreshCw className={cn("size-3", isRefetchingSnapshots && "animate-spin")} />
                    Tentar Novamente
                  </Button>
                </div>
              </div>
            ) : (
              /* Success inspection: Display repository & snapshot details */
              <>
                {/* Database & Repository Information Header */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border bg-surface/70 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                      <Database className="size-3.5 text-primary" /> Banco de Dados Alvo
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-xs uppercase">
                        {inspection?.dbType || "Banco"}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">
                        {inspection?.dbName || "default"}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {inspection?.dbHost}:{inspection?.dbPort}
                    </p>
                  </div>

                  <div className="rounded-lg border bg-surface/70 p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Cloud className="size-3.5 text-sky-400" /> Repositório R2 / S3
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground hover:text-foreground"
                        title="Atualizar lista de snapshots"
                        onClick={() => refetchSnapshots()}
                        disabled={isRefetchingSnapshots}
                      >
                        <RefreshCw className={cn("size-2.5", isRefetchingSnapshots && "animate-spin")} />
                      </Button>
                    </div>
                    <p className="font-mono text-[11px] text-foreground truncate" title={inspection?.repository}>
                      {inspection?.repository}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {inspection?.totalSnapshots || 0} snapshot(s) armazenado(s)
                    </p>
                  </div>
                </div>

                {/* Latest Snapshot Highlight Card */}
                {latestSnapshot && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                        <ArchiveRestore className="size-3.5" /> Último Backup Salvo (Mais Recente)
                      </span>
                      <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-primary/30 text-[10px] font-normal">
                        {formatRelativeTime(latestSnapshot.time)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Data de Criação:</span>
                          <span className="font-medium text-foreground">
                            {formatDisplayDate(latestSnapshot.time)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="size-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Identificador Snapshot:</span>
                          <span className="font-mono text-xs font-medium text-foreground">
                            {latestSnapshot.short_id || latestSnapshot.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {latestSnapshot.tags && latestSnapshot.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <Tag className="size-3 text-muted-foreground shrink-0" />
                        {latestSnapshot.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-background/80 border text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Snapshot Selection Dropdown if multiple snapshots exist */}
                {inspection && inspection.snapshots.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">
                      Escolha qual snapshot restaurar:
                    </label>
                    <Select
                      value={selectedSnapshotId}
                      onValueChange={(val) => setSelectedSnapshotId(val)}
                    >
                      <SelectTrigger className="text-xs font-sans h-9">
                        <SelectValue placeholder="Selecione o snapshot" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56 text-xs">
                        <SelectItem value="latest">
                          ✨ Mais recente (latest) — {latestSnapshot ? formatDisplayDate(latestSnapshot.time) : "Automático"}
                        </SelectItem>
                        {inspection.snapshots.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.short_id || s.id.slice(0, 8)} • {formatDisplayDate(s.time)} ({formatRelativeTime(s.time)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* CRITICAL WARNING BANNER */}
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>Atenção: Ação Crítica e Irreversível</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A restauração irá <strong className="text-destructive font-semibold">sobrescrever e substituir todos os dados existentes</strong> no banco de dados{" "}
                    <code className="bg-background px-1 py-0.5 rounded border text-[11px] font-mono text-foreground font-semibold">
                      {inspection?.dbName || "alvo"}
                    </code>{" "}
                    pelos dados deste backup de{" "}
                    <span className="font-semibold text-foreground">
                      {selectedSnapshot ? formatDisplayDate(selectedSnapshot.time) : "data selecionada"}
                    </span>
                    . Todos os registros novos ou modificados após esta data serão permanentemente destruídos.
                  </p>
                </div>

                {/* TYPED CONFIRMATION INPUT */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-medium text-foreground block">
                    Para autorizar a restauração, digite <strong className="text-destructive font-semibold">RESTAURAR</strong> ou o nome do container abaixo:
                  </label>
                  <Input
                    type="text"
                    placeholder="RESTAURAR"
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    className={cn(
                      "font-mono text-xs transition-colors",
                      isMatch
                        ? "border-emerald-500 focus-visible:ring-emerald-500/30"
                        : typedConfirm
                          ? "border-destructive/60 focus-visible:ring-destructive/30"
                          : ""
                    )}
                  />
                  <div className="text-[11px]">
                    {isMatch ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="size-3.5" /> Confirmação reconhecida. O botão de restauração foi liberado.
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Digite exatamente <code className="font-mono text-foreground font-semibold">RESTAURAR</code> para desbloquear a operação.
                      </span>
                    )}
                  </div>
                </div>

                {/* DIALOG FOOTER WITH ACTIONS */}
                <DialogFooter className="pt-3 flex flex-col-reverse sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto text-xs"
                    onClick={() => onOpenChange(false)}
                    disabled={isRestoring}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full sm:w-auto text-xs gap-1.5"
                    disabled={!isMatch || isRestoring || !inspection?.isInitialized}
                    onClick={() => {
                      if (isMatch) {
                        restoreMutation.mutate({
                          snapshotId: selectedSnapshotId,
                          confirmText: typedConfirm.trim(),
                        });
                      }
                    }}
                  >
                    <ArchiveRestore className="size-3.5 mr-1" />
                    Confirmar e Restaurar Banco de Dados
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

