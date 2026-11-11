import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  IdCard,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileWarning,
  Handshake,
  Info,
  Leaf,
  MapPin,
  Package,
  Timer,
  Truck,
} from "lucide-react";
import { FreightDetailSheet } from "@/components/shipper/FreightDetailSheet";
import { ShipperMap } from "@/components/shipper/ShipperMap";
import {
  Card,
  EmptyState,
  Kpi,
  PageTitle,
  StatusPill,
  timeAgo,
} from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { computeAlerts, computeKpis, formatDuration, isActive } from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/")({
  component: ShipperDashboard,
});

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function ShipperDashboard() {
  const { data, thirdParties } = useShipperPortal();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const kpis = useMemo(() => (data ? computeKpis(data) : null), [data]);
  const alerts = useMemo(() => (data ? computeAlerts(data) : []), [data]);
  if (!data || !kpis) return null;

  const active = data.freights.filter(isActive);
  const driverAlerts = (thirdParties?.drivers ?? []).filter(
    (driver) =>
      driver.activeFreightIds.length > 0 &&
      (driver.docState !== "ok" || driver.decision === "bloqueado"),
  );
  const allAlerts = [
    ...driverAlerts.map((driver) => ({
      id: `driver-${driver.profileId}`,
      tone: (driver.docState === "vencendo" ? "warning" : "danger") as "warning" | "danger",
      title:
        driver.decision === "bloqueado"
          ? "Carga com motorista que você bloqueou"
          : driver.docState === "vencendo"
            ? "Motorista com documento vencendo"
            : "Carga com motorista de documento irregular",
      detail: `${driver.name} · ${
        driver.documents
          .filter((doc) => doc.state !== "ok")
          .map((doc) => doc.label)
          .join(", ") ||
        driver.decisionReason ||
        ""
      }`,
      freightId: driver.activeFreightIds[0],
    })),
    ...alerts,
  ];
  const selected = data.freights.find((freight) => freight.id === selectedId) ?? null;
  const firstName = data.profile.userName.split(/[\s@]/)[0];

  function ask(event: FormEvent) {
    event.preventDefault();
    void navigate({ to: "/embarcador/ia", search: { q: question.trim() || undefined } });
  }

  if (!data.carriers.length) {
    return (
      <div className="space-y-5">
        <PageTitle eyebrow="Painel" title={`${greeting()}, ${firstName}`} />
        <Card>
          <EmptyState
            icon={Handshake}
            title="Comece convidando suas transportadoras"
            text="Assim que uma transportadora aceitar o convite, as cargas em que sua empresa é remetente ou destinatária aparecem aqui sozinhas."
            action={
              <Button asChild>
                <Link to="/embarcador/transportadoras">
                  Convidar transportadora <ArrowRight className="size-4" />
                </Link>
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Painel"
        title={`${greeting()}, ${firstName}`}
        subtitle={`${kpis.active} carga(s) em andamento com ${kpis.connectedCarriers} transportadora(s) conectada(s) · atualizado ${timeAgo(data.generatedAt)}`}
      />

      <form onSubmit={ask} className="premium-card flex items-center gap-3 p-2 pl-4">
        <Bot className="size-5 shrink-0 text-primary" />
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Pergunte à Frotak IA: cadê a carga da Construtora Litoral?"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" className="h-10 shrink-0">
          Perguntar
        </Button>
      </form>

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi
          label="Em andamento"
          value={kpis.active}
          hint={`${kpis.inRoute} em rota · ${kpis.atDock} em doca`}
          icon={Truck}
        />
        <Kpi
          label="Entregues hoje"
          value={kpis.deliveredToday}
          hint={`${kpis.delivered30d} nos últimos 30 dias`}
          icon={CheckCircle2}
          tone="good"
        />
        <Kpi
          label="Ocorrências"
          value={kpis.occurrences}
          hint={kpis.occurrences ? "Precisa de atenção" : "Tudo andando"}
          icon={AlertTriangle}
          tone={kpis.occurrences ? "danger" : "good"}
        />
        <Kpi
          label="Canhotos pendentes"
          value={kpis.pendingProofs}
          hint="Entregues sem comprovante"
          icon={FileWarning}
          tone={kpis.pendingProofs ? "warning" : "good"}
        />
        <Link to="/embarcador/terceiros" className="col-span-2 block xl:col-span-1">
          <Kpi
            label="Motoristas com alerta"
            value={driverAlerts.length}
            hint={driverAlerts.length ? "Documento ou bloqueio" : "Todos em dia"}
            icon={IdCard}
            tone={driverAlerts.length ? "danger" : "good"}
          />
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="text-[15px] font-extrabold">Cargas no mapa</h2>
              <p className="text-[12px] text-muted-foreground">
                {kpis.trackedPct}% das cargas em andamento com rastreio
              </p>
            </div>
            <Link
              to="/embarcador/cargas"
              search={{ id: undefined }}
              className="text-[12px] font-bold text-primary hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <ShipperMap freights={active} onSelect={setSelectedId} className="h-[340px] w-full" />
        </Card>

        <Card>
          <h2 className="text-[15px] font-extrabold">Precisa de atenção</h2>
          {allAlerts.length ? (
            <ul className="mt-3 space-y-2">
              {allAlerts.slice(0, 6).map((alert) => (
                <li key={alert.id}>
                  <button
                    type="button"
                    onClick={() =>
                      alert.freightId
                        ? setSelectedId(alert.freightId)
                        : navigate({ to: "/embarcador/transportadoras" })
                    }
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-2xl border p-3 text-left text-[13px] transition hover:brightness-95",
                      alert.tone === "danger"
                        ? "border-destructive/30 bg-destructive/8"
                        : alert.tone === "warning"
                          ? "border-warning/35 bg-warning/10"
                          : "border-border bg-surface/40",
                    )}
                  >
                    {alert.tone === "info" ? (
                      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          alert.tone === "danger" ? "text-destructive" : "text-warning",
                        )}
                      />
                    )}
                    <span>
                      <span className="block font-bold">{alert.title}</span>
                      <span className="text-muted-foreground">{alert.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Nada fora do normal"
              text="Nenhuma ocorrência, parada longa ou canhoto atrasado agora."
            />
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold">Em andamento agora</h2>
            <span className="text-[12px] text-muted-foreground">{active.length} carga(s)</span>
          </div>
          {active.length ? (
            <ul className="mt-3 divide-y divide-border/70">
              {active.slice(0, 8).map((freight) => (
                <li key={freight.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(freight.id)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Package className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">
                        {freight.destinationName ?? freight.destination} · {freight.plate}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {freight.carrierName}
                        {freight.position?.place ? ` · ${freight.position.place}` : ""}
                      </span>
                    </span>
                    <StatusPill freight={freight} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Package}
              title="Nenhuma carga em andamento"
              text="Quando suas transportadoras lançarem fretes com o seu CNPJ, eles aparecem aqui."
            />
          )}
        </Card>

        <div className="grid gap-3">
          <Kpi
            label="Espera média na descarga"
            value={formatDuration(kpis.avgUnloadingDwellMin)}
            hint={`${kpis.dwellOverLimit} parada(s) acima de 5 h`}
            icon={Timer}
            tone={kpis.dwellOverLimit ? "warning" : "neutral"}
          />
          <Kpi
            label="CO₂ em 30 dias"
            value={`${kpis.co2Kg30d.toLocaleString("pt-BR")} kg`}
            hint="Pelo diesel abastecido nas viagens"
            icon={Leaf}
            tone="good"
          />
          <Kpi
            label="Transportadoras"
            value={kpis.connectedCarriers}
            hint={
              kpis.invitedCarriers
                ? `${kpis.invitedCarriers} convite(s) aguardando`
                : "Todas conectadas"
            }
            icon={MapPin}
          />
        </div>
      </div>

      <FreightDetailSheet freight={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
