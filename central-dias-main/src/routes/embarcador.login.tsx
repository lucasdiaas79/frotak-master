import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Field, ShipperAuthFrame } from "@/components/shipper/ShipperAuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDemoMode, shipperSignIn } from "@/lib/shipper/client";

export const Route = createFileRoute("/embarcador/login")({
  head: () => ({ meta: [{ title: "Entrar · Frotak Embarcador" }] }),
  component: ShipperLoginPage,
});

function ShipperLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await shipperSignIn(email, password);
      void navigate({ to: "/embarcador", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  function openDemo() {
    setDemoMode(true);
    void navigate({ to: "/embarcador" });
  }

  return (
    <ShipperAuthFrame>
      <h1 className="text-[26px] font-medium leading-tight">Entrar no portal</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Acompanhe suas cargas e transportadoras em tempo real.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="E-mail">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com.br"
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"} <ArrowRight className="size-4" />
        </Button>
      </form>
      <div className="mt-6 space-y-3 text-center text-[13px]">
        <p className="text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link to="/embarcador/cadastro" className="font-bold text-primary hover:underline">
            Cadastre sua empresa grátis
          </Link>
        </p>
        <button
          type="button"
          onClick={openDemo}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/8 text-[13px] font-bold text-primary transition hover:bg-primary/12"
        >
          <Sparkles className="size-4" /> Ver demonstração com dados de exemplo
        </button>
        <p className="text-[12px] text-muted-foreground">
          É transportadora?{" "}
          <a href="/login" className="font-semibold text-foreground hover:underline">
            Entre na Frotak
          </a>
        </p>
      </div>
    </ShipperAuthFrame>
  );
}
