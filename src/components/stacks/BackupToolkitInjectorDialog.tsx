import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  KeyRound,
  RefreshCw,
  Eye,
  EyeOff,
  Cloud,
  CheckCircle2,
  Copy,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { R2BackupSettings, StackEnvVar } from "../../../shared/types";

interface BackupToolkitInjectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentYaml: string;
  currentEnv: StackEnvVar[];
  stackName?: string;
  onInject: (newYaml: string, newEnv: StackEnvVar[]) => void;
}

export function BackupToolkitInjectorDialog({
  open,
  onOpenChange,
  currentYaml,
  currentEnv,
  stackName = "app",
  onInject,
}: BackupToolkitInjectorDialogProps) {
  // Database config
  const [dbType, setDbType] = useState<"postgres" | "mysql" | "mongodb">("postgres");
  const [dbService, setDbService] = useState("postgres");
  const [useProfile, setUseProfile] = useState(false);

  // Cloudflare R2 config
  const [r2Endpoint, setR2Endpoint] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [resticPassword, setResticPassword] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showResticPassword, setShowResticPassword] = useState(false);

  // Retention & Schedule
  const [intervalSeconds, setIntervalSeconds] = useState(86400); // 24h
  const [keepDaily, setKeepDaily] = useState(7);
  const [keepWeekly, setKeepWeekly] = useState(4);
  const [keepMonthly, setKeepMonthly] = useState(12);

  // Query saved defaults
  const { data: defaultSettings } = useQuery({
    queryKey: ["settings", "r2-backup"],
    queryFn: api.settings.getR2Backup,
    enabled: open,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (data: R2BackupSettings) => api.settings.saveR2Backup(data),
  });

  // Auto-detect database service from YAML
  useEffect(() => {
    if (!open) return;

    if (currentYaml.includes("postgres:") || currentYaml.includes("image: postgres")) {
      setDbType("postgres");
      setDbService("postgres");
    } else if (
      currentYaml.includes("mysql:") ||
      currentYaml.includes("mariadb:") ||
      currentYaml.includes("image: mysql") ||
      currentYaml.includes("image: mariadb")
    ) {
      setDbType("mysql");
      setDbService(currentYaml.includes("mariadb:") ? "mariadb" : "mysql");
    } else if (currentYaml.includes("mongo:") || currentYaml.includes("image: mongo")) {
      setDbType("mongodb");
      setDbService("mongo");
    }
  }, [open, currentYaml]);

  // Load defaults from server
  useEffect(() => {
    if (defaultSettings && open) {
      if (!r2Endpoint && defaultSettings.endpoint) setR2Endpoint(defaultSettings.endpoint);
      if (!accessKeyId && defaultSettings.accessKeyId) setAccessKeyId(defaultSettings.accessKeyId);
      if (!secretAccessKey && defaultSettings.secretAccessKey) {
        setSecretAccessKey(defaultSettings.secretAccessKey);
      }
      if (!resticPassword && defaultSettings.resticPassword) {
        setResticPassword(defaultSettings.resticPassword);
      }
      if (!r2Bucket) {
        const cleanName = (stackName || "app")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/^-+|-+$/g, "");
        setR2Bucket(defaultSettings.bucket ? `${cleanName}-backups` : `${cleanName}-backups`);
      }
      if (defaultSettings.intervalSeconds) setIntervalSeconds(defaultSettings.intervalSeconds);
      if (defaultSettings.keepDaily) setKeepDaily(defaultSettings.keepDaily);
      if (defaultSettings.keepWeekly) setKeepWeekly(defaultSettings.keepWeekly);
      if (defaultSettings.keepMonthly) setKeepMonthly(defaultSettings.keepMonthly);
    } else if (open && !r2Bucket) {
      const cleanName = (stackName || "app")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/^-+|-+$/g, "");
      setR2Bucket(`${cleanName}-backups`);
    }
  }, [
    defaultSettings,
    open,
    stackName,
    r2Endpoint,
    accessKeyId,
    secretAccessKey,
    resticPassword,
    r2Bucket,
  ]);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_";
    let pwd = "";
    const array = new Uint8Array(28);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length; i++) {
      pwd += chars[array[i]! % chars.length];
    }
    setResticPassword(pwd);
    toast.success("Nova senha criptográfica gerada para o repositório Restic.");
  };

  const handleInject = () => {
    if (!r2Endpoint.trim()) {
      toast.error("Informe o Endpoint do Cloudflare R2");
      return;
    }
    if (!r2Bucket.trim()) {
      toast.error("Informe o nome do Bucket no Cloudflare R2");
      return;
    }
    if (!accessKeyId.trim()) {
      toast.error("Informe a Access Key ID do Cloudflare R2");
      return;
    }
    if (!secretAccessKey.trim()) {
      toast.error("Informe a Secret Access Key do Cloudflare R2");
      return;
    }
    if (!resticPassword.trim()) {
      toast.error("Informe a senha do repositório Restic");
      return;
    }

    if (saveAsDefault) {
      saveSettingsMutation.mutate({
        endpoint: r2Endpoint.trim(),
        bucket: r2Bucket.trim(),
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        resticPassword: resticPassword.trim(),
        intervalSeconds,
        keepDaily,
        keepWeekly,
        keepMonthly,
      });
    }

    const defaultPort = dbType === "postgres" ? "5432" : dbType === "mysql" ? "3306" : "27017";

    // Compose service block
    const serviceLines = [
      `  database-backup:`,
      useProfile ? `    profiles:\n      - backup` : null,
      `    image: \${BACKUP_TOOLKIT_IMAGE:-felipesdam496/backup-toolkit:latest-${dbType}}`,
      `    container_name: \${CONTAINER_PREFIX:-${stackName || "app"}}-database-backup`,
      `    restart: unless-stopped`,
      `    environment:`,
      `      DB_TYPE: ${dbType}`,
      `      DB_HOST: ${dbService}`,
      `      DB_PORT: "${defaultPort}"`,
      `      DB_NAME: \${DB_NAME:-\${POSTGRES_DB:-\${MYSQL_DATABASE:-app}}}`,
      `      DB_USER: \${DB_USER:-\${POSTGRES_USER:-\${MYSQL_USER:-user}}}`,
      `      DB_PASSWORD: \${DB_PASSWORD:-\${POSTGRES_PASSWORD:-\${MYSQL_PASSWORD:-password}}}`,
      `      R2_BUCKET: \${BACKUP_R2_BUCKET:-${r2Bucket.trim()}}`,
      `      R2_ENDPOINT: \${R2_ENDPOINT:-${r2Endpoint.trim()}}`,
      `      AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID}`,
      `      AWS_SECRET_ACCESS_KEY: \${AWS_SECRET_ACCESS_KEY}`,
      `      RESTIC_PASSWORD: \${BACKUP_RESTIC_PASSWORD}`,
      `      BACKUP_INTERVAL_SECONDS: \${BACKUP_INTERVAL_SECONDS:-${intervalSeconds}}`,
      `      BACKUP_KEEP_DAILY: \${BACKUP_KEEP_DAILY:-${keepDaily}}`,
      `      BACKUP_KEEP_WEEKLY: \${BACKUP_KEEP_WEEKLY:-${keepWeekly}}`,
      `      BACKUP_KEEP_MONTHLY: \${BACKUP_KEEP_MONTHLY:-${keepMonthly}}`,
      `    depends_on:`,
      `      ${dbService}:`,
      `        condition: service_healthy`,
      `    networks:`,
      `      - backend`,
      `      - backup-egress`,
    ]
      .filter((l): l is string => Boolean(l))
      .join("\n");

    let updatedYaml = currentYaml;

    // Check if database-backup already exists
    if (updatedYaml.includes("database-backup:")) {
      toast.error("A stack já possui um serviço 'database-backup' configurado.");
      return;
    }

    // Insert service into services:
    if (updatedYaml.includes("services:")) {
      // Find indentation or append right after services:
      const servicesIndex = updatedYaml.indexOf("services:");
      const nextLineIndex = updatedYaml.indexOf("\n", servicesIndex);
      if (nextLineIndex !== -1) {
        updatedYaml =
          updatedYaml.slice(0, nextLineIndex + 1) +
          serviceLines +
          "\n" +
          updatedYaml.slice(nextLineIndex + 1);
      } else {
        updatedYaml = updatedYaml + "\n" + serviceLines + "\n";
      }
    } else {
      updatedYaml = "services:\n" + serviceLines + "\n\n" + updatedYaml;
    }

    // Ensure networks are defined
    const hasNetworksBlock = /^\s*networks\s*:/m.test(updatedYaml);
    if (!hasNetworksBlock) {
      updatedYaml += `\nnetworks:\n  backend:\n    internal: true\n  backup-egress:\n`;
    } else {
      if (!updatedYaml.includes("backup-egress:")) {
        const netIndex = updatedYaml.search(/^\s*networks\s*:/m);
        const netNextLine = updatedYaml.indexOf("\n", netIndex);
        if (netNextLine !== -1) {
          updatedYaml =
            updatedYaml.slice(0, netNextLine + 1) +
            `  backup-egress:\n` +
            updatedYaml.slice(netNextLine + 1);
        }
      }
      if (!updatedYaml.includes("backend:")) {
        const netIndex = updatedYaml.search(/^\s*networks\s*:/m);
        const netNextLine = updatedYaml.indexOf("\n", netIndex);
        if (netNextLine !== -1) {
          updatedYaml =
            updatedYaml.slice(0, netNextLine + 1) +
            `  backend:\n    internal: true\n` +
            updatedYaml.slice(netNextLine + 1);
        }
      }
    }

    // Update .env variables
    const newEnvMap = new Map<string, StackEnvVar>();
    for (const v of currentEnv) {
      newEnvMap.set(v.key, v);
    }

    const setEnvVar = (key: string, value: string, secret = false) => {
      newEnvMap.set(key, { key, value, secret });
    };

    setEnvVar("BACKUP_TOOLKIT_IMAGE", `felipesdam496/backup-toolkit:latest-${dbType}`, false);
    setEnvVar("R2_ENDPOINT", r2Endpoint.trim(), false);
    setEnvVar("BACKUP_R2_BUCKET", r2Bucket.trim(), false);
    setEnvVar("AWS_ACCESS_KEY_ID", accessKeyId.trim(), false);
    setEnvVar("AWS_SECRET_ACCESS_KEY", secretAccessKey.trim(), true);
    setEnvVar("BACKUP_RESTIC_PASSWORD", resticPassword.trim(), true);
    setEnvVar("BACKUP_INTERVAL_SECONDS", String(intervalSeconds), false);
    setEnvVar("BACKUP_KEEP_DAILY", String(keepDaily), false);
    setEnvVar("BACKUP_KEEP_WEEKLY", String(keepWeekly), false);
    setEnvVar("BACKUP_KEEP_MONTHLY", String(keepMonthly), false);

    onInject(updatedYaml, Array.from(newEnvMap.values()));
    toast.success("Backup Toolkit injetado com sucesso no docker-compose.yml e .env!");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3 shrink-0 border-b">
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold truncate">
                Anexar Backup Toolkit (Cloudflare R2)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Injeta automaticamente o container `felipesdam496/backup-toolkit`, redes e variáveis
                criptografadas com Restic.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto space-y-4 p-6 py-4 flex-1 min-w-0 text-xs">
          {/* Target DB selection */}
          <div className="rounded-lg border bg-surface/40 p-3.5 space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                <Sparkles className="size-3.5 text-primary shrink-0" /> Banco de Dados Alvo
              </span>
              <span className="text-[11px] text-muted-foreground font-mono truncate">
                felipesdam496/backup-toolkit:latest-{dbType}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div>
                <Label className="text-[11px] text-muted-foreground">Motor do Banco</Label>
                <Select
                  value={dbType}
                  onValueChange={(v) => {
                    setDbType(v as "postgres" | "mysql" | "mongodb");
                    if (
                      dbService === "postgres" ||
                      dbService === "mysql" ||
                      dbService === "mongo"
                    ) {
                      setDbService(
                        v === "postgres" ? "postgres" : v === "mysql" ? "mysql" : "mongo",
                      );
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL / MariaDB</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground">
                  Nome do Serviço no Compose
                </Label>
                <Input
                  value={dbService}
                  onChange={(e) => setDbService(e.target.value.trim())}
                  placeholder="ex: postgres ou db"
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-0.5">
              <Checkbox
                id="use-profile"
                checked={useProfile}
                onCheckedChange={(c) => setUseProfile(Boolean(c))}
              />
              <label
                htmlFor="use-profile"
                className="text-[11px] text-muted-foreground cursor-pointer select-none"
              >
                Usar perfil Compose <code className="text-foreground">profiles: [backup]</code>{" "}
                (opcional, execute com --profile backup)
              </label>
            </div>
          </div>

          {/* Cloudflare R2 Credentials */}
          <div className="rounded-lg border bg-surface/40 p-3.5 space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                <Cloud className="size-3.5 text-sky-400 shrink-0" /> Credenciais Cloudflare R2
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                Criptografia Restic AES-256
              </span>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground">
                R2 Endpoint (S3 Compatible API) *
              </Label>
              <Input
                placeholder="https://<account_id>.r2.cloudflarestorage.com"
                value={r2Endpoint}
                onChange={(e) => setR2Endpoint(e.target.value.trim())}
                className="mt-1 h-8 font-mono text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div>
                <Label className="text-[11px] text-muted-foreground">Nome do Bucket R2 *</Label>
                <Input
                  placeholder="meu-app-backups"
                  value={r2Bucket}
                  onChange={(e) => setR2Bucket(e.target.value.trim().toLowerCase())}
                  className="mt-1 h-8 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground">R2 Access Key ID *</Label>
                <Input
                  placeholder="ex: 0a1b2c3d4e5f..."
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value.trim())}
                  className="mt-1 h-8 font-mono text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">
                    R2 Secret Access Key *
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {showSecretKey ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <Input
                  type={showSecretKey ? "text" : "password"}
                  placeholder="••••••••••••••••"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value.trim())}
                  className="mt-1 h-8 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">
                    Senha do Repositório Restic *
                  </Label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    <KeyRound className="size-2.5" /> Gerar
                  </button>
                </div>
                <div className="relative mt-1">
                  <Input
                    type={showResticPassword ? "text" : "password"}
                    placeholder="Chave de encriptação Restic"
                    value={resticPassword}
                    onChange={(e) => setResticPassword(e.target.value.trim())}
                    className="h-8 font-mono text-xs pr-8"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResticPassword(!showResticPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showResticPassword ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1 border-t">
              <Checkbox
                id="save-default-r2"
                checked={saveAsDefault}
                onCheckedChange={(c) => setSaveAsDefault(Boolean(c))}
              />
              <label
                htmlFor="save-default-r2"
                className="text-[11px] text-muted-foreground cursor-pointer select-none"
              >
                Salvar estas credenciais R2 como padrão no HarborX (autopreenchimento em novas
                stacks)
              </label>
            </div>
          </div>

          {/* Schedule & Retention */}
          <div className="rounded-lg border bg-surface/40 p-3.5 space-y-3 min-w-0">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-amber-400" /> Agendamento & Política de Retenção
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 min-w-0">
              <div>
                <Label className="text-[10px] text-muted-foreground">Intervalo</Label>
                <Select
                  value={String(intervalSeconds)}
                  onValueChange={(v) => setIntervalSeconds(Number(v))}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="86400">24 horas (Diário)</SelectItem>
                    <SelectItem value="43200">12 horas</SelectItem>
                    <SelectItem value="21600">6 horas</SelectItem>
                    <SelectItem value="3600">1 hora</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Retenção Diária</Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={keepDaily}
                  onChange={(e) => setKeepDaily(Number(e.target.value))}
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Retenção Semanal</Label>
                <Input
                  type="number"
                  min="1"
                  max="52"
                  value={keepWeekly}
                  onChange={(e) => setKeepWeekly(Number(e.target.value))}
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Retenção Mensal</Label>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={keepMonthly}
                  onChange={(e) => setKeepMonthly(Number(e.target.value))}
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 px-6 border-t shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleInject} className="gap-1.5">
            <ShieldCheck className="size-4" /> Injetar no Compose e .env
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
