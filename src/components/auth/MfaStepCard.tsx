import { useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import {
  confirmMfaCode,
  logout,
  startMfaEnrollment,
  type MfaEnrollment,
  type MfaStep,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MfaStepCardProps = {
  step: MfaStep;
  onVerified: () => void;
  onCancel: () => void;
};

/** Segunda etapa do login da equipe: cadastra o autenticador na primeira vez e depois pede o código. */
export function MfaStepCard({ step, onVerified, onCancel }: MfaStepCardProps) {
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const enrollmentStarted = useRef(false);

  useEffect(() => {
    if (step.kind !== "enroll" || enrollmentStarted.current) return;
    enrollmentStarted.current = true;

    startMfaEnrollment()
      .then(setEnrollment)
      .catch(() => {
        setError("Não foi possível iniciar o cadastro do autenticador. Entre novamente.");
      });
  }, [step.kind]);

  const factorId = step.kind === "verify" ? step.factorId : enrollment?.factorId;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || code.length !== 6) return;

    setSubmitting(true);
    setError("");
    try {
      const verified = await confirmMfaCode(factorId, code);
      if (verified) {
        onVerified();
        return;
      }
      setCode("");
      setError("Código inválido ou expirado. Confira o relógio do celular e tente de novo.");
    } catch {
      setError("Não foi possível confirmar o código. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    await logout().catch(() => undefined);
    onCancel();
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-normal text-white">
        {step.kind === "enroll" ? "Proteja sua conta" : "Verificação em duas etapas"}
      </h1>
      <p className="mb-5 text-sm text-white/65">
        {step.kind === "enroll"
          ? "O acesso ao Master exige um segundo fator. Leia o QR Code no Google Authenticator, Microsoft Authenticator ou outro app compatível e digite o código gerado."
          : "Digite o código de 6 dígitos do seu aplicativo autenticador."}
      </p>

      {step.kind === "enroll" && enrollment ? (
        <div className="mb-5 flex flex-col items-center gap-3">
          <img
            src={enrollment.qrCode}
            alt="QR Code para cadastrar o autenticador"
            className="size-44 rounded-2xl bg-white p-2"
          />
          <div className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs text-white/55">Não consegue ler? Digite esta chave no app:</p>
            <code data-mfa-secret className="mt-1 block text-xs break-all text-white">
              {enrollment.secret}
            </code>
          </div>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="sr-only">Código de verificação</span>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-white/36" />
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Código de 6 dígitos"
              aria-label="Código de verificação"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="h-13 rounded-2xl border-white/10 bg-black/20 pr-4 pl-11 text-sm tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-white/36"
            />
          </div>
        </label>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={submitting || !factorId || code.length !== 6}
          className="h-13 w-full rounded-2xl bg-[linear-gradient(90deg,#2ce97f_0%,#1dc868_100%)] text-sm font-semibold text-black hover:opacity-90"
        >
          <ArrowRight className="size-4.5" />
          {submitting ? "Confirmando..." : "Confirmar"}
        </Button>

        <button
          type="button"
          onClick={() => void handleCancel()}
          className="w-full text-center text-xs text-white/55 transition hover:text-white"
        >
          Voltar ao login
        </button>

        {step.kind === "verify" ? (
          <p className="text-center text-xs text-white/40">
            Perdeu o celular? Peça a um administrador para redefinir o seu autenticador.
          </p>
        ) : null}
      </form>
    </div>
  );
}
