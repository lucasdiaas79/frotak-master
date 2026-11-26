import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, EyeOff, Handshake, ShieldCheck, Truck } from "lucide-react";
import { ShipperAuthFrame } from "@/components/shipper/ShipperAuthFrame";
import { Button } from "@/components/ui/button";
import { getMasterLoginUrl } from "@/lib/auth";
import { carrierAcceptInvite, shipperInviteInfo } from "@/lib/shipper/api";
import { carrierCredentials, savePendingInvite } from "@/lib/shipper/carrierSession";

// Pagina que a transportadora abre a partir do convite do embarcador.

export const Route = createFileRoute("/embarcador/convite/$token")({
  head: () => ({
    meta: [{ title: "Convite de embarcador · Frotak" }, { name: "robots", content: "noindex" }],
  }),
  component: CarrierInvitePage,
});

type State =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; shipperName: string; carrierName: string; loggedIn: boolean }
  | { kind: "accepted"; shipperName: string };

const PROMISES = [
  {
    icon: Truck,
    text: "Ele vê só as cargas em que é remetente ou destinatário: status, posição durante a viagem e documentos de entrega.",
  },
  {
    icon: EyeOff,
    text: "Ele nunca vê valor do frete, custos, margem, salários ou outros clientes.",
  },
  {
    icon: ShieldCheck,
    text: "Você pode pausar o compartilhamento quando quiser, em Frotak > Embarcadores.",
  },
];

function CarrierInvitePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (token === "demonstracao") {
        setState({
          kind: "ready",
          shipperName: "Mineradora Serra Azul",
          carrierName: "Sua transportadora",
          loggedIn: false,
        });
        return;
      }
      const [info, creds] = await Promise.all([
        shipperInviteInfo({ data: { token } }).catch(() => null),
        carrierCredentials().catch(() => null),
      ]);
      if (!info || !info.ok) {
        setState({ kind: "invalid", message: info && !info.ok ? info.error : "Convite inválido." });
        return;
      }
      if (info.status === "ativa") {
        setState({ kind: "accepted", shipperName: info.shipperName });
        return;
      }
      setState({
        kind: "ready",
        shipperName: info.shipperName,
        carrierName: info.carrierName,
        loggedIn: !!creds,
      });
    })();
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const creds = await carrierCredentials();
      if (!creds) {
        savePendingInvite(token);
        window.location.href = getMasterLoginUrl();
        return;
      }
      const result = await carrierAcceptInvite({ data: { ...creds, token } });
      if (!result.ok) throw new Error(result.error);
      setState({ kind: "accepted", shipperName: result.shipperName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aceitar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShipperAuthFrame>
      {state.kind === "loading" && (
        <p className="text-[13px] text-muted-foreground">Carregando convite...</p>
      )}
      {state.kind === "invalid" && (
        <div>
          <h1 className="text-[24px] font-medium">Convite indisponível</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {state.message} Peça ao embarcador para reenviar o convite.
          </p>
        </div>
      )}
      {state.kind === "accepted" && (
        <div>
          <CheckCircle2 className="size-10 text-success" />
          <h1 className="mt-3 text-[24px] font-medium">Conectado à {state.shipperName}</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            As cargas desse cliente passam a aparecer para ele automaticamente, conforme você opera
            na Frotak.
          </p>
          <Button asChild className="mt-6 h-11 w-full">
            <a href="/embarcadores">Ver meus embarcadores</a>
          </Button>
        </div>
      )}
      {state.kind === "ready" && (
        <div>
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Handshake className="size-5" />
          </span>
          <h1 className="mt-3 text-[24px] font-medium leading-tight">
            A {state.shipperName} quer acompanhar as cargas dela pela Frotak
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Convite para <strong>{state.carrierName}</strong>. Aceitando, o cliente para de pedir
            foto de canhoto e posição pelo WhatsApp: a Frotak manda sozinha.
          </p>
          <ul className="mt-5 space-y-3">
            {PROMISES.map((item) => (
              <li key={item.text} className="flex gap-3 text-[13px]">
                <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                {item.text}
              </li>
            ))}
          </ul>
          {error && (
            <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
              {error}
            </p>
          )}
          <Button
            className="mt-6 h-11 w-full"
            onClick={accept}
            disabled={busy || token === "demonstracao"}
          >
            {busy
              ? "Aceitando..."
              : state.loggedIn
                ? "Aceitar e compartilhar"
                : "Já uso a Frotak: entrar e aceitar"}
          </Button>
          <a
            href="https://frotak.log.br"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-card text-[13px] font-bold text-foreground"
          >
            Ainda não uso a Frotak: quero conhecer
          </a>
          <p className="mt-4 text-[12px] text-muted-foreground">
            A Frotak é o sistema de gestão da transportadora: fretes, frota, abastecimento,
            financeiro e Frotak IA. Atender o seu cliente pela Frotak é só usar o app do motorista
            no dia a dia.
          </p>
        </div>
      )}
    </ShipperAuthFrame>
  );
}
