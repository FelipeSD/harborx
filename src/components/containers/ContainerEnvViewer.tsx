import { useState, useMemo } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Search,
  Shield,
  Key,
  FileText,
  Lock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ContainerEnvViewerProps {
  envList?: string[];
  isLoading?: boolean;
  isViewer?: boolean;
}

interface ParsedEnv {
  key: string;
  value: string;
  isSensitive: boolean;
  isSystem: boolean;
}

const SENSITIVE_REGEX =
  /(SECRET|PASSWORD|PASS|TOKEN|KEY|AUTH|PRIVATE|CREDENTIAL|DATABASE_URL|POSTGRES_|MYSQL_)/i;
const SYSTEM_KEYS = new Set(["PATH", "HOME", "HOSTNAME", "TERM", "SHLVL", "PWD"]);

export function ContainerEnvViewer({
  envList = [],
  isLoading = false,
  isViewer = false,
}: ContainerEnvViewerProps) {
  const [search, setSearch] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const parsedEnvs = useMemo<ParsedEnv[]>(() => {
    return envList.map((entry) => {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) {
        return {
          key: entry,
          value: "",
          isSensitive: SENSITIVE_REGEX.test(entry),
          isSystem: SYSTEM_KEYS.has(entry),
        };
      }
      const key = entry.slice(0, eqIdx);
      const value = entry.slice(eqIdx + 1);
      return {
        key,
        value,
        isSensitive: SENSITIVE_REGEX.test(key),
        isSystem: SYSTEM_KEYS.has(key),
      };
    });
  }, [envList]);

  const filteredEnvs = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return parsedEnvs;
    return parsedEnvs.filter(
      (e) => e.key.toLowerCase().includes(term) || e.value.toLowerCase().includes(term),
    );
  }, [parsedEnvs, search]);

  const sensitiveCount = useMemo(
    () => parsedEnvs.filter((e) => e.isSensitive).length,
    [parsedEnvs],
  );

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyValue = (val: string, keyName: string) => {
    void navigator.clipboard.writeText(val);
    setCopiedKey(keyName);
    toast.success(`Valor de '${keyName}' copiado para a área de transferência`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyAsDotEnv = () => {
    const text = parsedEnvs
      .map((e) => `${e.key}=${/\s|#/.test(e.value) ? `"${e.value}"` : e.value}`)
      .join("\n");
    void navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success(`${parsedEnvs.length} variáveis copiadas no formato .env`);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground">
        <Loader2 className="mx-auto size-5 animate-spin mb-2 text-primary" />
        Carregando variáveis de ambiente do container…
      </div>
    );
  }

  if (envList.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-xs">
        <Key className="mx-auto size-7 mb-2 opacity-40" />
        <p className="font-medium text-foreground">Nenhuma variável de ambiente encontrada</p>
        <p className="mt-1 text-[11px]">
          Este container não possui variáveis definidas via Dockerfile ou docker-compose.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho & Ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs gap-1.5">
            <Key className="size-3 text-primary" />
            {parsedEnvs.length} variáveis ativas
          </Badge>
          {sensitiveCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-xs gap-1"
            >
              <Shield className="size-3" />
              {sensitiveCount} sensíveis
            </Badge>
          )}
          {isViewer && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Lock className="size-2.5" />
              Acesso restrito (somente leitura)
            </Badge>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyAsDotEnv}
          className="text-xs h-8 shrink-0"
        >
          {copiedAll ? (
            <Check className="size-3.5 mr-1.5 text-emerald-500" />
          ) : (
            <FileText className="size-3.5 mr-1.5" />
          )}
          {copiedAll ? "Copiado!" : "Copiar todas (.env)"}
        </Button>
      </div>

      {/* Barra de Filtro */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Filtrar variáveis por chave ou valor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 text-xs h-8"
        />
      </div>

      {/* Lista de Variáveis */}
      {filteredEnvs.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-xs text-muted-foreground">
          Nenhuma variável encontrada correspondente à busca "{search}".
        </div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filteredEnvs.map((env) => {
            const isRevealed = Boolean(revealedKeys[env.key]);
            const shouldMask = env.isSensitive && !isRevealed && !isViewer;
            const isCopied = copiedKey === env.key;

            return (
              <div
                key={env.key}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border bg-surface/70 p-2.5 transition-colors hover:bg-surface",
                  env.isSensitive && "border-amber-500/20 bg-amber-500/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {env.key}
                    </span>
                    {env.isSensitive && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-400 text-[9px] px-1 py-0 h-4 font-mono"
                      >
                        segredo
                      </Badge>
                    )}
                    {env.isSystem && (
                      <span className="text-[10px] text-muted-foreground italic">(sistema)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {env.isSensitive && !isViewer && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        title={isRevealed ? "Ocultar segredo" : "Revelar segredo"}
                        onClick={() => toggleReveal(env.key)}
                      >
                        {isRevealed ? (
                          <EyeOff className="size-3.5" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      title="Copiar valor"
                      onClick={() => copyValue(env.value, env.key)}
                    >
                      {isCopied ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded bg-background/80 px-2 py-1.5 font-mono text-[11px] leading-relaxed break-all border border-border/50">
                  {shouldMask ? (
                    <span className="text-muted-foreground tracking-widest font-sans">
                      ••••••••••••••••••••
                    </span>
                  ) : (
                    <span className={cn(env.isSensitive ? "text-amber-400" : "text-foreground")}>
                      {env.value || <em className="text-muted-foreground">vazio</em>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
