import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  acceptMasterSsoFromUrl,
  getMasterLoginUrl,
  getProfile,
  isVercelPreviewHost,
  signIn,
  signOut,
} from "@/lib/auth";
import logoCentral from "@/assets/logo-central.png";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar - Frotak" },
      { name: "description", content: "Acesso seguro ao sistema Frotak." },
    ],
  }),
  component: LoginRedirect,
});

function LoginRedirect() {
  const navigate = useNavigate();
  const [showPreviewLogin, setShowPreviewLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      for (const [key, value] of hashParams.entries()) {
        if (!params.has(key)) params.set(key, value);
      }

      const token = params.get("sso_token");
      const source = params.get("source");

      if (!token || source !== "frotak-master") {
        if (isVercelPreviewHost()) {
          if (!cancelled) setShowPreviewLogin(true);
          return;
        }
        window.location.replace(getMasterLoginUrl());
        return;
      }

      try {
        await acceptMasterSsoFromUrl(window.location.search);
        if (!cancelled) navigate({ to: "/", replace: true });
      } catch {
        if (isVercelPreviewHost()) {
          if (!cancelled) setShowPreviewLogin(true);
          return;
        }
        window.location.replace(getMasterLoginUrl());
      }
    }

    void redirect();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (showPreviewLogin) return <PreviewLogin />;

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-[13px] text-muted-foreground">
      Carregando sistema...
    </div>
  );
}

function getSafeRedirectPath() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect) return "/";

  try {
    const target = new URL(redirect, window.location.origin);
    if (target.origin !== window.location.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function PreviewLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const { user } = await signIn(email.trim(), password);
      if (!user) throw new Error("Não foi possível iniciar a sessão.");

      const profile = await getProfile(user.id);
      if (!profile?.active || !profile.workspaceId)
        throw new Error("Usuário sem acesso a um workspace ativo.");

      window.location.replace(getSafeRedirectPath());
    } catch (loginError) {
      try {
        await signOut();
      } catch {
        // The rejected login must not leave a reusable client session.
      }
      const message = loginError instanceof Error ? loginError.message : "Falha ao autenticar.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <img src={logoCentral} alt="Frotak" className="mb-8 h-9 w-auto object-contain" />
        <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">
          Ambiente de Preview
        </p>
        <h1 className="text-2xl font-bold text-foreground">Entrar na Frotak</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use sua conta autorizada para acessar esta versão.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-semibold text-foreground">
            E-mail
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-foreground">
            Senha
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            <LogIn />
            {isSubmitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
