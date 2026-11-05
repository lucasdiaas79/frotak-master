import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession, signIn } from "@/lib/auth";
import { runtimeClient } from "@/lib/supabase";
import { frotakIcon, tenantLogo } from "@/lib/tenantBrand";

/** Login no endereço do próprio cliente: cada cliente tem os próprios usuários, no banco dele. */
export function TenantLoginPage() {
  const client = runtimeClient();
  const logo = tenantLogo({ name: client?.name });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getSession()
      .then((session) => {
        if (session) window.location.replace("/");
      })
      .catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signIn(email.trim().toLowerCase(), password);
      window.location.replace("/");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(
        /invalid.*credentials/i.test(message)
          ? "E-mail ou senha inválidos."
          : "Não foi possível entrar agora. Tente novamente.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px] rounded-[28px] border border-border bg-card p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <img
            src={logo ?? frotakIcon}
            alt={client?.name ?? "FrotaK"}
            className={logo ? "h-12 w-auto object-contain" : "size-12 rounded-2xl object-contain"}
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{client?.name ?? "FrotaK"}</h1>
            <p className="text-sm text-muted-foreground">Entre com seu e-mail e senha</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="sr-only">E-mail</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-4 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="E-mail"
                type="email"
                autoComplete="email"
                required
                className="pl-11"
              />
            </div>
          </label>

          <label className="block">
            <span className="sr-only">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-4 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Senha"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="px-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute top-1/2 right-4 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="w-full">
            <ArrowRight className="size-4" />
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
