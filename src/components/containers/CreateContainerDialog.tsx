import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Server, HardDrive, Network, Cpu, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CreateContainerRequest } from "../../../shared/types";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateContainerDialog({ open, onOpenChange }: CreateContainerDialogProps) {
  const queryClient = useQueryClient();

  const { data: networks = [] } = useQuery({
    queryKey: ["networks"],
    queryFn: api.networks.list,
    enabled: open,
  });

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [network, setNetwork] = useState("bridge");
  const [restartPolicy, setRestartPolicy] = useState<
    "unless-stopped" | "always" | "no" | "on-failure"
  >("unless-stopped");
  const [startImmediately, setStartImmediately] = useState(true);
  const [cpuLimit, setCpuLimit] = useState("");
  const [memoryLimitMb, setMemoryLimitMb] = useState("");
  const [cmd, setCmd] = useState("");

  const [ports, setPorts] = useState<
    Array<{ hostPort: string; containerPort: string; protocol: "tcp" | "udp" }>
  >([]);
  const [env, setEnv] = useState<Array<{ key: string; value: string }>>([]);
  const [volumes, setVolumes] = useState<
    Array<{ source: string; target: string; mode: "rw" | "ro" }>
  >([]);

  const resetForm = () => {
    setName("");
    setImage("");
    setNetwork("bridge");
    setRestartPolicy("unless-stopped");
    setStartImmediately(true);
    setCpuLimit("");
    setMemoryLimitMb("");
    setCmd("");
    setPorts([]);
    setEnv([]);
    setVolumes([]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateContainerRequest) => api.containers.create(payload),
    onSuccess: (data) => {
      toast.success(`Container "${data.name}" criado com sucesso!`);
      void queryClient.invalidateQueries({ queryKey: ["containers"] });
      void queryClient.invalidateQueries({ queryKey: ["systemInfo"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao criar o container.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Informe o nome do container.");
      return;
    }
    if (!image.trim()) {
      toast.error("Informe a imagem Docker.");
      return;
    }

    const formattedPorts = ports
      .filter((p) => p.containerPort.trim())
      .map((p) => ({
        containerPort: parseInt(p.containerPort, 10),
        hostPort: p.hostPort.trim() ? parseInt(p.hostPort, 10) : undefined,
        protocol: p.protocol,
      }));

    const formattedEnv = env
      .filter((e) => e.key.trim())
      .map((e) => ({
        key: e.key.trim(),
        value: e.value,
      }));

    const formattedVolumes = volumes
      .filter((v) => v.source.trim() && v.target.trim())
      .map((v) => ({
        source: v.source.trim(),
        target: v.target.trim(),
        mode: v.mode,
      }));

    const payload: CreateContainerRequest = {
      name: name.trim(),
      image: image.trim(),
      network: network || undefined,
      restartPolicy,
      start: startImmediately,
      cpuLimit: cpuLimit ? parseFloat(cpuLimit) : undefined,
      memoryLimitMb: memoryLimitMb ? parseInt(memoryLimitMb, 10) : undefined,
      cmd: cmd.trim() || undefined,
      ports: formattedPorts.length > 0 ? formattedPorts : undefined,
      env: formattedEnv.length > 0 ? formattedEnv : undefined,
      volumes: formattedVolumes.length > 0 ? formattedVolumes : undefined,
    };

    createMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-5 text-primary" />
            Novo Container
          </DialogTitle>
          <DialogDescription>
            Configure e crie um novo container Docker. Se a imagem não existir localmente, o HarborX
            fará o pull automático.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto p-1 gap-1">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="ports">Portas</TabsTrigger>
              <TabsTrigger value="volumes">Volumes</TabsTrigger>
              <TabsTrigger value="env" className="truncate">
                Variáveis & Recursos
              </TabsTrigger>
            </TabsList>

            {/* Aba 1: Básico */}
            <TabsContent value="basic" className="space-y-4 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="container-name">Nome do container *</Label>
                  <Input
                    id="container-name"
                    placeholder="ex.: meu-nginx"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="container-image">Imagem Docker *</Label>
                  <Input
                    id="container-image"
                    placeholder="ex.: nginx:alpine ou redis:7"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="container-network">Rede</Label>
                  <select
                    id="container-network"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring"
                  >
                    <option value="bridge" className="bg-popover text-popover-foreground">
                      bridge (padrão)
                    </option>
                    <option value="host" className="bg-popover text-popover-foreground">
                      host
                    </option>
                    <option value="none" className="bg-popover text-popover-foreground">
                      none (isolado)
                    </option>
                    {networks
                      .filter((n) => !["bridge", "host", "none"].includes(n.name))
                      .map((n) => (
                        <option
                          key={n.id}
                          value={n.name}
                          className="bg-popover text-popover-foreground"
                        >
                          {n.name} ({n.driver})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="container-restart">Política de Reinício</Label>
                  <select
                    id="container-restart"
                    value={restartPolicy}
                    onChange={(e) =>
                      setRestartPolicy(
                        e.target.value as "always" | "unless-stopped" | "on-failure" | "no",
                      )
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring"
                  >
                    <option value="unless-stopped" className="bg-popover text-popover-foreground">
                      unless-stopped (recomendado)
                    </option>
                    <option value="always" className="bg-popover text-popover-foreground">
                      always
                    </option>
                    <option value="on-failure" className="bg-popover text-popover-foreground">
                      on-failure
                    </option>
                    <option value="no" className="bg-popover text-popover-foreground">
                      no
                    </option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="container-cmd">Comando de execução (opcional)</Label>
                <Input
                  id="container-cmd"
                  placeholder="ex.: npm start ou sh -c 'sleep 10'"
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 bg-surface/50">
                <div className="space-y-0.5">
                  <Label htmlFor="start-switch" className="text-sm font-medium">
                    Iniciar imediatamente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    O container será iniciado logo após ser criado
                  </p>
                </div>
                <Switch
                  id="start-switch"
                  checked={startImmediately}
                  onCheckedChange={setStartImmediately}
                />
              </div>
            </TabsContent>

            {/* Aba 2: Portas */}
            <TabsContent value="ports" className="space-y-4 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Mapeamento de portas entre a máquina VM e o container
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPorts([...ports, { hostPort: "", containerPort: "", protocol: "tcp" }])
                  }
                >
                  <Plus className="size-3.5 mr-1" /> Adicionar porta
                </Button>
              </div>

              {ports.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Nenhuma porta configurada. Clique em "Adicionar porta" se seu serviço expõe
                  HTTP/TCP.
                </div>
              ) : (
                <div className="space-y-2">
                  {ports.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 sm:p-0 rounded border sm:border-0 bg-surface/30 sm:bg-transparent"
                    >
                      <div className="flex-1 min-w-[120px]">
                        <Input
                          placeholder="Porta Host (ex: 8080)"
                          type="number"
                          value={p.hostPort}
                          onChange={(e) => {
                            const copy = [...ports];
                            copy[idx]!.hostPort = e.target.value;
                            setPorts(copy);
                          }}
                          className="text-xs font-mono"
                        />
                      </div>
                      <span className="text-muted-foreground text-xs font-mono hidden sm:inline">
                        →
                      </span>
                      <div className="flex-1 min-w-[120px]">
                        <Input
                          placeholder="Porta Container (ex: 80)"
                          type="number"
                          required
                          value={p.containerPort}
                          onChange={(e) => {
                            const copy = [...ports];
                            copy[idx]!.containerPort = e.target.value;
                            setPorts(copy);
                          }}
                          className="text-xs font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={p.protocol}
                          onChange={(e) => {
                            const copy = [...ports];
                            copy[idx]!.protocol = e.target.value as "tcp" | "udp";
                            setPorts(copy);
                          }}
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs font-mono outline-none"
                        >
                          <option value="tcp" className="bg-popover text-popover-foreground">
                            TCP
                          </option>
                          <option value="udp" className="bg-popover text-popover-foreground">
                            UDP
                          </option>
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPorts(ports.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Aba 3: Volumes */}
            <TabsContent value="volumes" className="space-y-4 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Bind mounts e armazenamento persistente
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVolumes([...volumes, { source: "", target: "", mode: "rw" }])}
                >
                  <Plus className="size-3.5 mr-1" /> Adicionar volume
                </Button>
              </div>

              {volumes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Nenhum volume montado.
                </div>
              ) : (
                <div className="space-y-2">
                  {volumes.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 sm:p-0 rounded border sm:border-0 bg-surface/30 sm:bg-transparent"
                    >
                      <div className="flex-1 min-w-[120px]">
                        <Input
                          placeholder="Host (ex: /opt/app/data)"
                          value={v.source}
                          onChange={(e) => {
                            const copy = [...volumes];
                            copy[idx]!.source = e.target.value;
                            setVolumes(copy);
                          }}
                          className="text-xs font-mono"
                        />
                      </div>
                      <span className="text-muted-foreground text-xs font-mono hidden sm:inline">
                        :
                      </span>
                      <div className="flex-1 min-w-[120px]">
                        <Input
                          placeholder="Container (ex: /var/lib/data)"
                          value={v.target}
                          onChange={(e) => {
                            const copy = [...volumes];
                            copy[idx]!.target = e.target.value;
                            setVolumes(copy);
                          }}
                          className="text-xs font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={v.mode}
                          onChange={(e) => {
                            const copy = [...volumes];
                            copy[idx]!.mode = e.target.value as "rw" | "ro";
                            setVolumes(copy);
                          }}
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs font-mono outline-none"
                        >
                          <option value="rw" className="bg-popover text-popover-foreground">
                            rw (leitura/escrita)
                          </option>
                          <option value="ro" className="bg-popover text-popover-foreground">
                            ro (somente leitura)
                          </option>
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setVolumes(volumes.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Aba 4: Variáveis de ambiente & Recursos */}
            <TabsContent value="env" className="space-y-5 pt-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Variáveis de Ambiente (ENV)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEnv([...env, { key: "", value: "" }])}
                  >
                    <Plus className="size-3.5 mr-1" /> Adicionar variável
                  </Button>
                </div>

                {env.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma variável de ambiente definida.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {env.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 sm:p-0 rounded border sm:border-0 bg-surface/30 sm:bg-transparent"
                      >
                        <Input
                          placeholder="NOME_DA_VARIAVEL"
                          value={item.key}
                          onChange={(e) => {
                            const copy = [...env];
                            copy[idx]!.key = e.target.value;
                            setEnv(copy);
                          }}
                          className="flex-1 min-w-[120px] text-xs font-mono"
                        />
                        <span className="text-muted-foreground text-xs font-mono hidden sm:inline">
                          =
                        </span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                          <Input
                            placeholder="valor"
                            value={item.value}
                            onChange={(e) => {
                              const copy = [...env];
                              copy[idx]!.value = e.target.value;
                              setEnv(copy);
                            }}
                            className="flex-1 text-xs font-mono"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEnv(env.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-medium mb-3">Limites de Recursos (opcional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cpu-limit" className="text-xs">
                      Limite de CPU (vCPUs)
                    </Label>
                    <Input
                      id="cpu-limit"
                      type="number"
                      step="0.1"
                      placeholder="ex.: 1.5"
                      value={cpuLimit}
                      onChange={(e) => setCpuLimit(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mem-limit" className="text-xs">
                      Limite de Memória (MB)
                    </Label>
                    <Input
                      id="mem-limit"
                      type="number"
                      step="16"
                      placeholder="ex.: 512"
                      value={memoryLimitMb}
                      onChange={(e) => setMemoryLimitMb(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-2 pt-4 border-t flex flex-col-reverse sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Criando container…
                </>
              ) : (
                "Criar container"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
