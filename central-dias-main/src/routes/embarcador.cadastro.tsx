import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Field, ShipperAuthFrame } from "@/components/shipper/ShipperAuthFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shipperSignUp } from "@/lib/shipper/api";
import { shipperSignIn } from "@/lib/shipper/client";

export const Route = createFileRoute("/embarcador/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro · Frotak Embarcador" }] }),
  component: ShipperSignUpPage,
});

function maskCnpj(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function ShipperSignUpPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: "",
    cnpj: "",
    fullName: "",
    phone: "",
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({
      ...current,
      [key]: key === "cnpj" ? maskCnpj(event.target.value) : event.target.value,
    }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await shipperSignUp({ data: form });
      if (!result.ok) throw new Error(result.error);
      await shipperSignIn(form.email, form.password);
      void navigate({ to: "/embarcador/transportadoras", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShipperAuthFrame>
      <h1 className="text-[26px] font-medium leading-tight">Cadastre sua empresa</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Grátis para o embarcador. Depois é só convidar suas transportadoras.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Empresa">
          <Input
            required
            value={form.companyName}
            onChange={set("companyName")}
            placeholder="Razão social ou nome fantasia"
          />
        </Field>
        <Field
          label="CNPJ"
          hint="É por ele que suas cargas aparecem: o CNPJ precisa estar como remetente ou destinatário no frete."
        >
          <Input
            required
            inputMode="numeric"
            value={form.cnpj}
            onChange={set("cnpj")}
            placeholder="00.000.000/0000-00"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Seu nome">
            <Input required value={form.fullName} onChange={set("fullName")} />
          </Field>
          <Field label="Telefone">
            <Input
              inputMode="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder="(00) 00000-0000"
            />
          </Field>
        </div>
        <Field label="E-mail">
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set("email")}
          />
        </Field>
        <Field label="Senha" hint="Pelo menos 8 caracteres.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set("password")}
          />
        </Field>
        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? "Criando conta..." : "Criar conta grátis"} <ArrowRight className="size-4" />
        </Button>
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Você só vê as cargas das transportadoras que aceitarem seu convite, e nunca os custos
          delas.
        </p>
      </form>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/embarcador/login" className="font-bold text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </ShipperAuthFrame>
  );
}
