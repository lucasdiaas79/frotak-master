import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import faviconPng from "@/assets/favicon.png";
import { cn } from "@/lib/utils";
import { PUBLIC_STEPS, demoTracking, type PublicFreightTracking } from "@/lib/freightShare";

// Pagina publica do link de acompanhamento. Fica fora do login (ver AppLayout).

export const Route = createFileRoute("/acompanhar/$token")({
  head: () => ({
    meta: [
      { title: "Acompanhar frete" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AcompanharFretePage,
});

const REFRESH_MS = 60_000;

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; tracking: PublicFreightTracking }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "error" };

function formatDateTime(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `em ${formatDateTime(iso)}`;
}

function osmEmbedUrl(lat: number, lng: number) {
  const d = 0.08;
  const bbox = [lng - d, lat - d * 0.6, lng + d, lat + d * 0.6].map((n) => n.toFixed(5)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function AcompanharFretePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (token === "demo" && import.meta.env.DEV) {
        const cenario = new URLSearchParams(window.location.search).get("cenario") ?? undefined;
        if (cenario === "expirado") setState({ kind: "expired" });
        else setState({ kind: "ready", tracking: demoTracking(cenario) });
        return;
      }
      try {
        const response = await fetch(
          `/api/acompanhar/${encodeURIComponent(token)}${isRefresh ? "?r=1" : ""}`,
          {
            cache: "no-store",
          },
        );
        const body = (await response.json().catch(() => null)) as
          { ok: true; tracking: PublicFreightTracking } | { ok: false; reason?: string } | null;
        if (body?.ok) {
          setState({ kind: "ready", tracking: body.tracking });
        } else if (response.status === 410 || body?.reason === "expired") {
          setState({ kind: "expired" });
        } else if (response.status === 404) {
          setState({ kind: "not_found" });
        } else {
          setState((current) => (current.kind === "ready" ? current : { kind: "error" }));
        }
      } catch {
        setState((current) => (current.kind === "ready" ? current : { kind: "error" }));
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-10 pt-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={faviconPng} alt="" className="size-7 rounded-lg" />
            <span className="text-[15px] font-extrabold tracking-tight">Frotak</span>
          </div>
          {state.kind === "ready" && (
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Atualizar
            </button>
          )}
        </header>

        {state.kind === "loading" && <Skeleton />}
        {state.kind === "not_found" && (
          <Message
            title="Link não encontrado"
            text="Confira se o link foi copiado inteiro ou peça um novo à transportadora."
          />
        )}
        {state.kind === "expired" && (
          <Message
            title="Este link expirou"
            text="Por segurança, o acompanhamento fica disponível por um tempo limitado. Peça um novo link à transportadora."
          />
        )}
        {state.kind === "error" && (
          <Message
            title="Não foi possível carregar"
            text="Verifique sua conexão e tente de novo em instantes."
            action={
              <button
                type="button"
                onClick={refresh}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                Tentar novamente
              </button>
            }
          />
        )}
        {state.kind === "ready" && <TrackingView tracking={state.tracking} />}

        <footer className="pt-2 text-center text-[12px] text-muted-foreground">
          Acompanhamento em tempo real pela{" "}
          <a
            href="https://frotak.log.br"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary hover:underline"
          >
            Frotak
          </a>
          . Quer ver todas as suas cargas assim?{" "}
          <a
            href="https://frotak.log.br"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary hover:underline"
          >
            Conheça
          </a>
          .
        </footer>
      </div>
    </div>
  );
}

function TrackingView({ tracking }: { tracking: PublicFreightTracking }) {
  const stepIndex = PUBLIC_STEPS.findIndex((step) => step.id === tracking.step);
  const cancelled = tracking.finished && tracking.step !== "entregue";
  const delivered = tracking.step === "entregue" && !cancelled;

  return (
    <>
      <section className="premium-card p-5">
        <p className="label-tiny">{tracking.carrierName}</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-extrabold leading-tight">{tracking.statusLabel}</h1>
            {tracking.statusDetail && (
              <p className="mt-1 text-[13px] text-muted-foreground">{tracking.statusDetail}</p>
            )}
          </div>
          <span
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
              delivered ? "bg-success/15 text-success" : "bg-primary/12 text-primary",
            )}
          >
            {delivered ? <CheckCircle2 className="size-6" /> : <Truck className="size-6" />}
          </span>
        </div>

        {!cancelled && (
          <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Etapas do frete">
            {PUBLIC_STEPS.map((step, index) => {
              const done = index <= stepIndex;
              return (
                <li key={step.id} className="flex flex-col gap-1.5">
                  <span className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-border")} />
                  <span
                    className={cn(
                      "text-[11px] font-semibold leading-tight",
                      index === stepIndex ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {tracking.occurrence && (
          <div className="mt-4 flex gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-[13px] font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{tracking.occurrence}</span>
          </div>
        )}
      </section>

      <section className="premium-card space-y-3 p-5">
        <RoutePoint label="Origem" name={tracking.originName} place={tracking.origin} />
        <RoutePoint label="Destino" name={tracking.destinationName} place={tracking.destination} />
        <div className="grid grid-cols-2 gap-3 border-t border-border/80 pt-3 text-[13px]">
          <Info label="Placa" value={tracking.plate} />
          <Info label="Motorista" value={tracking.driverFirstName} />
          <Info label="Produto" value={tracking.product} />
          <Info label="Frete" value={tracking.freightCode} />
        </div>
      </section>

      {tracking.position && (
        <section className="premium-card overflow-hidden">
          <iframe
            title="Posição do caminhão"
            src={osmEmbedUrl(tracking.position.lat, tracking.position.lng)}
            className="h-56 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              <span className="font-semibold">{tracking.position.place ?? "Última posição"}</span>
              {tracking.position.at && (
                <span className="text-muted-foreground">· {timeAgo(tracking.position.at)}</span>
              )}
            </div>
            <a
              href={`https://www.google.com/maps?q=${tracking.position.lat},${tracking.position.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
            >
              Abrir <ExternalLink className="size-3.5" />
            </a>
          </div>
        </section>
      )}

      <section className="premium-card p-5">
        <h2 className="text-[15px] font-extrabold">Documentos</h2>
        {tracking.documents.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {delivered
              ? "O comprovante de entrega aparece aqui assim que o motorista enviar."
              : "Os documentos aparecem aqui assim que forem emitidos."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tracking.documents.map((doc, index) => (
              <li key={`${doc.kind}-${index}`}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!doc.url}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] transition",
                    doc.url ? "hover:border-primary/40" : "pointer-events-none opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <FileText className="size-4 text-primary" />
                    {doc.label}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(doc.sentAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {tracking.events.length > 0 && (
        <section className="premium-card p-5">
          <h2 className="text-[15px] font-extrabold">Histórico</h2>
          <ol className="mt-3 space-y-3">
            {tracking.events.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-3 text-[13px]">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    index === 0 ? "bg-primary" : "bg-border",
                  )}
                />
                <div>
                  <p className="font-semibold">{event.label}</p>
                  <p className="text-muted-foreground">
                    {formatDateTime(event.at)}
                    {event.place ? ` · ${event.place}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <Clock className="size-3.5" />
        Atualizado {timeAgo(tracking.updatedAt)} · link válido até{" "}
        {new Date(tracking.expiresAt).toLocaleDateString("pt-BR")}
      </p>
    </>
  );
}

function RoutePoint({ label, name, place }: { label: string; name?: string; place?: string }) {
  return (
    <div>
      <p className="label-tiny">{label}</p>
      <p className="mt-0.5 text-[14px] font-bold">{name ?? place ?? "-"}</p>
      {name && place && <p className="text-[13px] text-muted-foreground">{place}</p>}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="label-tiny">{label}</p>
      <p className="mt-0.5 font-semibold">{value ?? "-"}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="premium-card h-40 animate-pulse" />
      <div className="premium-card h-32 animate-pulse" />
      <div className="premium-card h-24 animate-pulse" />
    </div>
  );
}

function Message({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="premium-card px-6 py-10 text-center">
      <h1 className="text-[18px] font-extrabold">{title}</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
