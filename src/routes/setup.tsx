import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Anchor, Lock, User, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [{ title: "Configuração Inicial — HarborX" }],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { user, setup, needsSetup, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && user) {
      void navigate({ to: "/" });
    }
    if (!isAuthLoading && needsSetup === false) {
      void navigate({ to: "/login" });
    }
  }, [user, needsSetup, isAuthLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError("Informe o nome de usuário.");
      return;
    }
    if (password.length < 12) {
      setError("A senha deve ter no mínimo 12 caracteres por motivos de segurança.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas informadas não coincidem.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await setup({ username, password });
      void navigate({ to: "/" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao concluir a configuração.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Anchor className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Harbor<span className="text-primary">X</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Instalação e configuração inicial</p>
        </div>

        <Card className="border-border/60 bg-surface/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="size-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">
                Primeiro Acesso
              </span>
            </div>
            <CardTitle className="text-xl">Criar Conta Administrador</CardTitle>
            <CardDescription>
              Defina as credenciais da conta mestre que terá acesso completo aos containers Docker
              da sua VM.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2.5">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">Nome de usuário do Administrador</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    required
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha (mínimo 12 caracteres)</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Criando administrador…
                  </>
                ) : (
                  "Concluir instalação e entrar"
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground">
                Já possui uma conta?{" "}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Ir para tela de login
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
