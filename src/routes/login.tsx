import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { authenticate, loginAccounts } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import frotakLogoDark from "@/assets/frotak-logo-dark.png";
import loginBackground from "@/assets/login-background.png";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  head: () => ({
    meta: [
      { title: "Login - FrotaK Master" },
      {
        name: "description",
        content: "Acesso central ao console FrotaK Master.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [email, setEmail] = useState(loginAccounts[0]?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await authenticate(email, password, search.redirect || "/");

      if (!result) {
        setError("E-mail ou senha invalidos.");
        return;
      }

      if (result.external) {
        window.location.assign(result.redirectTo);
        return;
      }

      navigate({ to: result.redirectTo, replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nao foi possivel fazer login.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#02060a] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${loginBackground})` }}
      />

      <div className="pointer-events-none absolute top-[6.5vh] left-[7vw] z-10">
        <img src={frotakLogoDark} alt="FrotaK" className="h-9 w-auto lg:h-11" />
      </div>

      <div className="relative flex h-full items-center justify-center px-4 sm:px-6 lg:justify-end lg:pr-[9vw] xl:pr-[12vw] 2xl:pr-[14vw]">
        <div className="w-full max-w-[420px] rounded-[30px] border border-white/10 bg-[rgba(10,13,18,0.72)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-[14px] sm:p-8">
          <h1 className="mb-6 text-2xl font-semibold tracking-normal text-white">
            Faca seu login na Frotak
          </h1>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <label className="block">
                <span className="sr-only">E-mail</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-white/36" />
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="E-mail"
                    autoComplete="email"
                    className="h-13 rounded-2xl border-white/10 bg-black/20 pr-4 pl-11 text-sm text-white placeholder:text-white/42 focus-visible:ring-[#28e87f]/35"
                  />
                </div>
              </label>

              <label className="block">
                <span className="sr-only">Senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-white/36" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Senha"
                    autoComplete="current-password"
                    className="h-13 rounded-2xl border-white/10 bg-black/20 px-11 text-sm text-white placeholder:text-white/42 focus-visible:ring-[#28e87f]/35"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute top-1/2 right-4 -translate-y-1/2 text-white/36 transition hover:text-white/72"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                  </button>
                </div>
              </label>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={submitting}
              className="h-13 w-full rounded-2xl bg-[linear-gradient(90deg,#2ce97f_0%,#1dc868_100%)] text-sm font-semibold text-[#08120d] shadow-[0_16px_34px_rgba(40,232,127,0.28)] hover:opacity-95"
            >
              <ArrowRight className="size-4.5" />
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
