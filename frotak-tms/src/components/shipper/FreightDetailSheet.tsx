import { useState } from "react";
import { AlertTriangle, Clock3, ExternalLink, FileText, Leaf, MapPin, Timer } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDuration } from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import { Link } from "@tanstack/react-router";
import { DecisionPill, DocStatePill, DriverAvatar, ScoreStar } from "@/components/shipper/DriverUi";
import { DRIVER_RELATION_LABELS } from "@/lib/shipper/types";
import { DWELL_LIMIT_MIN, type ShipperDocument, type ShipperFreight } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";
import { Pill, StatusPill, StepBar, formatDateTime, timeAgo } from "./ShipperUi";

// Detalhe de uma carga: etapas, posicao, documentos, tempos de doca e historico.

export function FreightDetailSheet({
  freight,
  onClose,
}: {
  freight: ShipperFreight | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!freight} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {freight && <FreightDetail freight={freight} />}
      </SheetContent>
    </Sheet>
  );
}

function DocumentRow({ doc }: { doc: ShipperDocument }) {
  const { documentUrl, demo } = useShipperPortal();
  const [busy, setBusy] = useState(false);
  async function open() {
    if (demo) {
      toast.info("Na demonstração os arquivos não abrem. Na conta real, o documento abre aqui.");
      return;
    }
    setBusy(true);
    try {
      const url = await documentUrl(doc.id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o documento.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-[13px] transition hover:border-primary/40"
    >
      <span className="flex items-center gap-2 font-semibold">
        <FileText className="size-4 text-primary" />
        {doc.label}
        {doc.isProof && <Pill tone="good">Comprovante</Pill>}
      </span>
      <span className="text-muted-foreground">
        {busy ? "Abrindo..." : formatDateTime(doc.sentAt)}
      </span>
    </button>
  );
}

function DwellBox({ label, minutes }: { label: string; minutes?: number }) {
  const over = minutes !== undefined && minutes > DWELL_LIMIT_MIN;
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        over ? "border-warning/40 bg-warning/10" : "border-border bg-surface/35",
      )}
    >
      <p className="label-tiny">{label}</p>
      <p className="mt-1 text-[18px] font-black text-foreground">{formatDuration(minutes)}</p>
      {over && (
        <p className="mt-0.5 text-[11px] font-semibold text-warning">
          Acima de 5 h: pode gerar estadia
        </p>
      )}
    </div>
  );
}

function DriverBlock({ freight }: { freight: ShipperFreight }) {
  const { thirdParties } = useShipperPortal();
  const driver = thirdParties?.drivers.find((item) => item.profileId === freight.driverProfileId);
  if (!driver) return null;
  const docProblem = driver.docState !== "ok";
  return (
    <div
      className={cn(
        "rounded-[20px] border p-4",
        docProblem || driver.decision === "bloqueado"
          ? "border-destructive/30 bg-destructive/6"
          : "border-primary/25 bg-primary/6",
      )}
    >
      <p className="label-tiny text-primary">Quem está levando</p>
      <div className="mt-2.5 flex items-center gap-3">
        <DriverAvatar initials={driver.initials} size={42} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold">{driver.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {DRIVER_RELATION_LABELS[driver.relation]} · {driver.vehicleKind ?? freight.plate}
          </p>
        </div>
        <ScoreStar score={driver.score} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {driver.documents
          .filter((doc) => ["cnh", "rntrc", "seguro"].includes(doc.kind))
          .map((doc) => (
            <DocStatePill
              key={doc.kind}
              state={doc.state}
              label={`${doc.label.split(" ")[0]} ${doc.state === "ok" ? "em dia" : doc.state}`}
            />
          ))}
        <DecisionPill decision={driver.decision} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="text-muted-foreground">
          <b className="font-mono text-foreground">{driver.tripsWithMe}</b> viagens suas
          {driver.onTimeRate !== undefined && (
            <>
              {" "}
              · <b className="font-mono text-foreground">{driver.onTimeRate}%</b> no prazo
            </>
          )}
        </span>
        <Link
          to="/embarcador/terceiros/$profileId"
          params={{ profileId: driver.profileId }}
          className="font-bold text-primary hover:underline"
        >
          Ver perfil
        </Link>
      </div>
    </div>
  );
}

export function FreightDetail({ freight }: { freight: ShipperFreight }) {
  return (
    <div className="space-y-5">
      <SheetHeader>
        <p className="label-tiny">{freight.carrierName}</p>
        <SheetTitle className="text-[22px] font-extrabold">{freight.statusLabel}</SheetTitle>
        <SheetDescription>
          {freight.code} · {freight.plate}
          {freight.driverFirstName ? ` · ${freight.driverFirstName}` : ""}
        </SheetDescription>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill freight={freight} />
          <Pill tone="muted">Você é {freight.role}</Pill>
          {!freight.tracked && !freight.finished && <Pill tone="warning">Sem rastreador</Pill>}
        </div>
      </SheetHeader>

      <StepBar freight={freight} />

      {freight.occurrence && (
        <div className="flex gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-[13px] font-semibold">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          {freight.occurrence}
        </div>
      )}
      {freight.statusDetail && (
        <p className="text-[13px] text-muted-foreground">{freight.statusDetail}</p>
      )}

      <DriverBlock freight={freight} />

      <div className="grid gap-3 rounded-2xl border border-border bg-surface/35 p-4 text-[13px]">
        <div>
          <p className="label-tiny">Origem</p>
          <p className="mt-0.5 font-bold">{freight.originName ?? "-"}</p>
          <p className="text-muted-foreground">{freight.origin}</p>
        </div>
        <div>
          <p className="label-tiny">Destino</p>
          <p className="mt-0.5 font-bold">{freight.destinationName ?? "-"}</p>
          <p className="text-muted-foreground">{freight.destination}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="label-tiny">Produto</p>
            <p className="mt-0.5 font-semibold">{freight.product ?? "-"}</p>
          </div>
          <div>
            <p className="label-tiny">{freight.deliveredAt ? "Entregue em" : "Início"}</p>
            <p className="mt-0.5 font-semibold">
              {formatDateTime(freight.deliveredAt ?? freight.startedAt)}
            </p>
          </div>
        </div>
      </div>

      {freight.position && (
        <a
          href={`https://www.google.com/maps?q=${freight.position.lat},${freight.position.lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] transition hover:border-primary/40"
        >
          <span className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <span className="font-semibold">{freight.position.place ?? "Última posição"}</span>
            <span className="text-muted-foreground">{timeAgo(freight.position.at)}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-bold text-primary">
            Mapa <ExternalLink className="size-3.5" />
          </span>
        </a>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-extrabold">
          <Timer className="size-4 text-primary" /> Tempo parado na doca
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <DwellBox label="Carregamento" minutes={freight.loadingDwellMin} />
          <DwellBox label="Descarga" minutes={freight.unloadingDwellMin} />
        </div>
      </div>

      {freight.co2Kg !== undefined && (
        <div className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success/10 p-3 text-[13px]">
          <Leaf className="size-5 text-success" />
          <span>
            <strong>{freight.co2Kg.toLocaleString("pt-BR")} kg de CO₂</strong> nesta viagem
            {freight.dieselLiters ? ` (${Math.round(freight.dieselLiters)} L de diesel)` : ""}
          </span>
        </div>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-[14px] font-extrabold">
          <FileText className="size-4 text-primary" /> Documentos
        </h3>
        {freight.documents.length ? (
          <div className="space-y-2">
            {freight.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nenhum documento enviado ainda.</p>
        )}
      </div>

      {freight.events.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[14px] font-extrabold">
            <Clock3 className="size-4 text-primary" /> Histórico
          </h3>
          <ol className="space-y-3">
            {freight.events.map((event, index) => (
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
        </div>
      )}
    </div>
  );
}
