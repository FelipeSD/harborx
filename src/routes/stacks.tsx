import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileStack, GitBranch, Plus, Rocket, Trash2, Upload, Eye, EyeOff, Square, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, StatusPill } from "@/components/app/ui-bits";
import { hosts, type Status } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/stacks")({
  head: () => ({
    meta: [
      { title: "Stacks do Git — HarborX" },
      { name: "description", content: "Suba stacks Docker Compose direto de repositórios Git, por branch, com variáveis de ambiente." },
      { property: "og:title", content: "Stacks do Git — HarborX" },
      { property: "og:description", content: "Suba stacks Docker Compose direto de repositórios Git, por branch, com variáveis de ambiente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StacksPage,
});

type Env = { key: string; value: string; secret: boolean };
interface Stack { id: string; name: string; repo: string; branch: string; path: string; host: string; status: Status; services: number; env: Env[]; updated: string }

const initial: Stack[] = [
  { id: "s1", name: "acme-web", repo: "https://github.com/acme/web.git", branch: "main", path: "compose.yml", host: "vm-prod-02", status: "running", services: 3, updated: "há 2 min",
    env: [{ key: "NODE_ENV", value: "production", secret: false }, { key: "DATABASE_URL", value: "postgres://app:***@pg:5432/app", secret: true }] },
  { id: "s2", name: "monitoring", repo: "https://github.com/acme/infra-monitoring.git", branch: "main", path: "monitoring/compose.yml", host: "vm-staging", status: "running", services: 3, updated: "ontem",
    env: [{ key: "GF_ADMIN_PASSWORD", value: "changeme", secret: true }] },
  { id: "s3", name: "worker", repo: "https://github.com/acme/worker.git", branch: "release", path: "stack.yml", host: "vm-prod-01", status: "stopped", services: 4, updated: "há 3 dias", env: [] },
];

export function parseEnv(text: string): Env[] {
  const out: Env[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    const key = m[1] ?? "";
    out.push({ key, value: v, secret: /SECRET|PASS|TOKEN|KEY|URL/i.test(key) });
  }
  return out;
}
const toText = (env: Env[]) => env.map((e) => `${e.key}=${/\s|#/.test(e.value) ? `"${e.value}"` : e.value}`).join("\n");

function EnvEditor({ env, onChange }: { env: Env[]; onChange: (e: Env[]) => void }) {
  const [text, setText] = useState(toText(env));
  const [show, setShow] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const merge = (incoming: Env[]) => {
    const map = new Map(env.map((e) => [e.key, e]));
    incoming.forEach((e) => map.set(e.key, e));
    const next = [...map.values()];
    onChange(next); setText(toText(next));
    toast.success(`${incoming.length} variáveis importadas`);
  };
  const update = (i: number, patch: Partial<Env>) => { const next = env.map((e, j) => (j === i ? { ...e, ...patch } : e)); onChange(next); setText(toText(next)); };

  return (
    <Tabs defaultValue="form" onValueChange={(v) => v === "text" && setText(toText(env))}>
      <div className="flex items-center justify-between gap-2">
        <TabsList><TabsTrigger value="form">Campos</TabsTrigger><TabsTrigger value="text">Texto completo</TabsTrigger></TabsList>
        <input ref={fileRef} type="file" accept=".env,text/plain,*" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) merge(parseEnv(await f.text())); e.target.value = ""; }} />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Importar .env</Button>
      </div>
      <TabsContent value="form" className="mt-3 space-y-2">
        {env.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma variável. Adicione, cole ou importe um arquivo .env.</p>}
        {env.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={e.key} placeholder="CHAVE" className="w-2/5 font-mono text-xs" onChange={(ev) => update(i, { key: ev.target.value.toUpperCase().replace(/[^A-Z0-9_.]/g, "_") })} />
            <Input value={e.value} placeholder="valor" type={e.secret && !show[i] ? "password" : "text"} className="flex-1 font-mono text-xs" onChange={(ev) => update(i, { value: ev.target.value })} />
            <Button type="button" size="icon" variant="ghost" aria-label="Mostrar" onClick={() => setShow((s) => ({ ...s, [i]: !s[i] }))}>{show[i] || !e.secret ? <Eye /> : <EyeOff />}</Button>
            <Switch checked={e.secret} onCheckedChange={(v) => update(i, { secret: v })} aria-label="Secreto" />
            <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={() => { const next = env.filter((_, j) => j !== i); onChange(next); setText(toText(next)); }}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...env, { key: "", value: "", secret: false }])}><Plus /> Adicionar variável</Button>
      </TabsContent>
      <TabsContent value="text" className="mt-3 space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="font-mono text-xs" placeholder={"# cole seu .env aqui\nNODE_ENV=production\nAPI_KEY=..."} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Formato CHAVE=valor, uma por linha. Linhas com # são ignoradas.</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => { const p = parseEnv(text); onChange(p); toast.success(`${p.length} variáveis aplicadas`); }}>Aplicar texto</Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}

const empty = { name: "", repo: "", branch: "main", path: "docker-compose.yml", host: hosts[0]?.name ?? "", env: [] as Env[], autoUpdate: true };

function StacksPage() {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  const startNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (s: Stack) => { setEditing(s.id); setForm({ ...s, autoUpdate: true }); setOpen(true); };
  const setStatus = (id: string, status: Status) => setItems((s) => s.map((x) => (x.id === id ? { ...x, status } : x)));

  const submit = () => {
    if (!form.name || !form.repo || !form.branch) { toast.error("Preencha nome, repositório e branch"); return; }
    const env = form.env.filter((e) => e.key);
    const id = editing ?? `s${Date.now()}`;
    const stack: Stack = { id, name: form.name, repo: form.repo, branch: form.branch, path: form.path, host: form.host, env, status: "updating", services: editing ? items.find((i) => i.id === id)!.services : 2, updated: "agora" };
    setItems((s) => (editing ? s.map((x) => (x.id === id ? stack : x)) : [stack, ...s]));
    setOpen(false);
    toast.info(`Clonando ${form.branch} e lendo ${form.path}…`);
    setTimeout(() => { setStatus(id, "running"); toast.success(`Stack ${form.name} no ar com ${env.length} variáveis`); }, 2200);
  };

  return (
    <>
      <PageHeader title="Stacks" subtitle="Docker Compose direto de repositórios Git, por branch"
        actions={<Button onClick={startNew}><Plus /> Nova stack</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((s) => (
          <Panel key={s.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary"><FileStack className="size-4" /></div>
                <div className="min-w-0"><p className="font-medium">{s.name}</p><p className="truncate font-mono text-xs text-muted-foreground">{s.repo}</p></div>
              </div>
              <StatusPill status={s.status} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border bg-surface p-3 text-xs">
              <div><p className="text-muted-foreground">Branch</p><p className="flex items-center gap-1 font-mono"><GitBranch className="size-3" />{s.branch}</p></div>
              <div><p className="text-muted-foreground">Compose</p><p className="truncate font-mono">{s.path}</p></div>
              <div><p className="text-muted-foreground">Máquina</p><p className="font-mono">{s.host}</p></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{s.services} serviços · {s.env.length} variáveis de ambiente · atualizado {s.updated}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" disabled={s.status === "updating"} onClick={() => { setStatus(s.id, "updating"); toast.info(`git pull em ${s.branch}…`); setTimeout(() => { setStatus(s.id, "running"); toast.success(`${s.name} reimplantada`); }, 2000); }}><Rocket /> Pull e redeploy</Button>
              <Button size="sm" variant="outline" onClick={() => startEdit(s)}>Editar / Variáveis</Button>
              {s.status === "running"
                ? <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, "stopped")}><Square /> Parar</Button>
                : <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, "running")}><RotateCw /> Iniciar</Button>}
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => { setItems((x) => x.filter((i) => i.id !== s.id)); toast(`Stack ${s.name} removida`); }}><Trash2 /></Button>
            </div>
          </Panel>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar stack" : "Nova stack do Git"}</DialogTitle>
            <DialogDescription>O HarborX clona o repositório na branch escolhida e sobe o arquivo compose indicado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Nome da stack</Label><Input value={form.name} placeholder="minha-app" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Máquina virtual</Label>
              <Select value={form.host} onValueChange={(v) => setForm({ ...form, host: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{hosts.map((h) => <SelectItem key={h.id} value={h.name} disabled={!h.online}>{h.name}{!h.online && " (offline)"}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>URL do repositório</Label><Input value={form.repo} className="font-mono text-xs" placeholder="https://github.com/org/repo.git" onChange={(e) => setForm({ ...form, repo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Branch</Label><Input value={form.branch} className="font-mono text-xs" onChange={(e) => setForm({ ...form, branch: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Caminho do compose</Label><Input value={form.path} className="font-mono text-xs" onChange={(e) => setForm({ ...form, path: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.autoUpdate} onCheckedChange={(v) => setForm({ ...form, autoUpdate: v })} /> Reimplantar automaticamente a cada push na branch</label>
          </div>
          <div className="space-y-2 border-t pt-4">
            <Label>Variáveis de ambiente</Label>
            <EnvEditor key={editing ?? "new"} env={form.env} onChange={(env) => setForm((f) => ({ ...f, env }))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit}><Rocket /> {editing ? "Salvar e reimplantar" : "Implantar stack"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
