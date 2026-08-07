import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { signIn } from "@/lib/auth";
import logoCentral from "@/assets/logo-central.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar - Central Transportes" },
      { name: "description", content: "Acesso ao sistema de gest?o de frota." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginHint = params.get("login_hint");
    const tenantId = params.get("tenant_id");
    const clientName = params.get("client_name");

    if (loginHint) setEmail(loginHint);
    if (tenantId) window.localStorage.setItem("frotak-active-tenant-id", tenantId);
    if (clientName) window.localStorage.setItem("frotak-active-tenant-name", clientName);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email.trim(), password);
      navigate({ to: "/" });
    } catch {
      setError("Credenciais inválidas. Verifique e tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="dark flex min-h-[100dvh] w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_30%),linear-gradient(180deg,#050606_0%,#0a0c0b_100%)] px-4 text-zinc-50">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img
            src={logoCentral}
            alt="Central Transportes e Serviços"
            className="h-16 w-auto object-contain"
          />
          <p className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Sistema de Gestão de Frota
          </p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[rgba(10,21,16,0.92)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <h1 className="text-[18px] font-extrabold text-white">Entrar</h1>
          <p className="mt-1 text-[12px] text-zinc-400">
            Acesse com suas credenciais corporativas.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                E-mail
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@empresa.com"
                className="mt-1.5 h-11 border-white/12 bg-white/[0.06] text-[13px] text-white placeholder:text-zinc-500"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                  Senha
                </label>
                <button type="button" className="text-[11px] text-primary hover:underline">
                  Esqueceu?
                </button>
              </div>
              <div className="relative mt-1.5">
                <Input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="h-11 border-white/12 bg-white/[0.06] pr-9 text-[13px] text-white placeholder:text-zinc-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-200"
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/12 px-3 py-2 text-[12px] text-red-200">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full shadow-[0_18px_40px_rgba(33,122,64,0.35)]"
            >
              <LogIn className="size-4" />
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-500">
          © {new Date().getFullYear()} Central Transportes e Serviços
        </p>
      </div>
    </div>
  );
}
