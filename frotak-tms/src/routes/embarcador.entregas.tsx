import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Clock,
  Download,
  FileSignature,
  Leaf,
  MapPin,
  PackageCheck,
  PackageX,
  RefreshCcw,
  Route as RouteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  FilterChips,
  Kpi,
  PageTitle,
  Pill,
  formatCnpj,
} from "@/components/shipper/ShipperUi";
import { shipperLoadDeliveries, shipperPodUrl } from "@/lib/shipper/api";
import { shipperAccessToken, useShipperPortal } from "@/lib/shipper/client";
import {
  REFUSAL_LABEL,
  RETURNABLE_LABEL,
  STOP_STATUS_LABEL,
  arrivedOnTime,
  clockOf,
  computeDeliveryKpis,
  deliveriesCsv,
  deliveryStops,
  demoDeliveries,
  hasPod,
  isDone,
  lateNow,
  stopDwellMin,
  type DeliveryRoute,
  type DeliveryStop,
  type ShipperDeliveriesData,
} from "@/lib/shipper/deliveries";
import { formatDuration } from "@/lib/shipper/analytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/entregas")({
  component: ShipperDeliveriesPage,
});

type Period = "hoje" | "7d" | "30d";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hm = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--";

function periodRange(period: Period) {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (period === "7d") from.setDate(from.getDate() - 6);
  if (period === "30d") from.setDate(from.getDate() - 29);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function Bar({
  label,
  value,
  max,
  display,
  tone = "primary",
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: "primary" | "warning" | "success" | "danger";
}) {
  const width = max > 0 ? Math.max(3, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="grid grid-cols-[120px_1fr_88px] items-center gap-3 text-[12px] sm:grid-cols-[160px_1fr_96px]">
      <span className="truncate font-semibold">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-2/60">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "warning"
              ? "bg-warning"
              : tone === "success"
                ? "bg-success"
                : tone === "danger"
                  ? "bg-destructive"
                  : "bg-primary",
          )}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="text-right font-bold">{display}</span>
    </div>
  );
}

function stopTone(stop: DeliveryStop): "good" | "warning" | "danger" | "neutral" | "muted" {
  if (stop.status === "entregue") return "good";
  if (stop.status === "recusada" || stop.status === "parcial") return "danger";
  if (stop.status === "pendente") return "muted";
  return "warning";
}

function ShipperDeliveriesPage() {
  const { demo } = useShipperPortal();
  const [period, setPeriod] = useState<Period>("hoje");
  const [data, setData] = useState<ShipperDeliveriesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = periodRange(period);
    try {
      if (demo) {
        const all = demoDeliveries();
        setData({
          ...all,
          from: from.toISOString(),
          routes: all.routes.filter((r) => new Date(r.scheduledAt) >= from),
        });
        setError(null);
        return;
      }
      const result = await shipperLoadDeliveries({
        data: {
          accessToken: await shipperAccessToken(),
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, [demo, period]);

  useEffect(() => {
    void load();
    // Rota em andamento muda a cada entrega: recarrega a cada 1 min.
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const kpis = useMemo(() => (data ? computeDeliveryKpis(data) : null), [data]);

  const openPod = async (stop: DeliveryStop, index: number) => {
    if (demo) {
      toast.info("Na demonstração a foto não abre. Na conta real, o canhoto abre aqui.");
      return;
    }
    const result = await shipperPodUrl({
      data: { accessToken: await shipperAccessToken(), stopId: stop.id, index },
    });
    if (result.ok) window.open(result.url, "_blank", "noopener");
    else toast.error(result.error);
  };

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([deliveriesCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `entregas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxReason = Math.max(0, ...(kpis?.refusalsByReason.map((r) => r.count) ?? []));

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Entregas"
        title="Rotas, canhotos e devoluções"
        subtitle="Cada parada registrada pelo motorista no app: chegada, descarga, canhoto, recusa, vasilhame e recebimento."
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className={cn("size-4", loading && "animate-spin")} /> Atualizar
            </Button>
            <Button onClick={exportCsv} disabled={!data?.routes.length}>
              <Download className="size-4" /> Relatório (planilha)
            </Button>
          </>
        }
      />

      <FilterChips<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { id: "hoje", label: "Hoje" },
          { id: "7d", label: "7 dias" },
          { id: "30d", label: "30 dias" },
        ]}
      />

      {error ? (
        <Card className="border-destructive/30 text-[13px] text-destructive">{error}</Card>
      ) : null}

      {kpis ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <Kpi
            label="Entregas concluídas"
            value={`${kpis.done}/${kpis.stops}`}
            hint={`${kpis.routes} rota(s), ${kpis.running} em andamento`}
            icon={PackageCheck}
          />
          <Kpi
            label="No prazo (OTD)"
            value={kpis.otdPct === null ? "--" : `${kpis.otdPct}%`}
            hint={`${kpis.withWindow} chegada(s) com janela`}
            icon={Clock}
            tone={kpis.otdPct === null ? "neutral" : kpis.otdPct >= 90 ? "good" : "warning"}
          />
          <Kpi
            label="Canhoto digital"
            value={kpis.podPct === null ? "--" : `${kpis.podPct}%`}
            hint={
              kpis.podMissing ? `${kpis.podMissing} sem assinatura ou foto` : "Todas com canhoto"
            }
            icon={FileSignature}
            tone={kpis.podMissing ? "warning" : "good"}
          />
          <Kpi
            label="Recusas e parciais"
            value={kpis.refused + kpis.partial}
            hint={`${kpis.boxesDelivered} de ${kpis.boxesPlanned} caixas entregues`}
            icon={PackageX}
            tone={kpis.refused + kpis.partial ? "danger" : "good"}
          />
          <Kpi
            label="Atrasadas agora"
            value={kpis.lateNow}
            hint="Janela passou sem chegada"
            icon={AlertTriangle}
            tone={kpis.lateNow ? "danger" : "good"}
          />
          <Kpi
            label="CO₂ estimado"
            value={`${kpis.co2Kg.toLocaleString("pt-BR")} kg`}
            hint={
              kpis.km
                ? `${kpis.km.toLocaleString("pt-BR")} km em rotas fechadas`
                : "Conta quando a rota fecha"
            }
            icon={Leaf}
            tone="good"
          />
        </div>
      ) : null}

      {kpis && kpis.stops ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card>
            <h2 className="text-[15px] font-extrabold">Motivos de recusa</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Recusas e entregas parciais, pelo motivo que o motorista marcou.
            </p>
            <div className="mt-4 space-y-2.5">
              {kpis.refusalsByReason.length ? (
                kpis.refusalsByReason.map((r) => (
                  <Bar
                    key={r.reason}
                    label={REFUSAL_LABEL[r.reason] ?? r.reason}
                    value={r.count}
                    max={maxReason}
                    display={String(r.count)}
                    tone="danger"
                  />
                ))
              ) : (
                <p className="text-[13px] text-muted-foreground">Nenhuma recusa no período.</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-[15px] font-extrabold">Vasilhame</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Recolhido nos clientes atendidos, contra o previsto na nota.
            </p>
            <div className="mt-4 space-y-2.5">
              {kpis.returnables.length ? (
                kpis.returnables.map((r) => (
                  <Bar
                    key={r.kind}
                    label={RETURNABLE_LABEL[r.kind] ?? r.kind}
                    value={r.collected}
                    max={r.expected}
                    display={`${r.collected}/${r.expected}`}
                    tone={r.collected < r.expected ? "warning" : "success"}
                  />
                ))
              ) : (
                <p className="text-[13px] text-muted-foreground">Sem vasilhame previsto.</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-[15px] font-extrabold">No cliente</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Tempo da chegada à saída e como a chegada foi marcada.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div className="rounded-2xl bg-surface-2/50 p-3">
                <dt className="text-muted-foreground">Tempo médio no cliente</dt>
                <dd className="mt-1 text-[18px] font-black">
                  {kpis.avgDwellMin === null ? "--" : formatDuration(kpis.avgDwellMin)}
                </dd>
              </div>
              <div className="rounded-2xl bg-surface-2/50 p-3">
                <dt className="text-muted-foreground">Chegada pela cerca</dt>
                <dd className="mt-1 text-[18px] font-black">
                  {kpis.geofencePct === null ? "--" : `${kpis.geofencePct}%`}
                </dd>
              </div>
              <div className="col-span-2 rounded-2xl bg-surface-2/50 p-3">
                <dt className="text-muted-foreground">Recebimento nas entregas</dt>
                <dd className="mt-1 text-[15px] font-black">
                  {brl(kpis.paymentReceived)}{" "}
                  <span className="text-[12px] font-semibold text-muted-foreground">
                    de {brl(kpis.paymentExpected)} previsto
                  </span>
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      ) : null}

      <div className="space-y-3">
        {data && !data.routes.length && !loading ? (
          <Card>
            <EmptyState
              icon={RouteIcon}
              title="Nenhuma rota no período"
              text="As rotas aparecem aqui quando uma transportadora conectada roda a operação com o CNPJ da sua empresa."
            />
          </Card>
        ) : null}
        {data?.routes.map((route) => (
          <RouteCard key={route.id} route={route} now={clockOf(data)} onPod={openPod} />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        CO₂ estimado pelos km rodados e pelo consumo do caminhão (2,6 kg por litro de diesel).
        Ponto, abastecimento e custos da transportadora não aparecem aqui.
      </p>
    </div>
  );
}

function RouteCard({
  route,
  now,
  onPod,
}: {
  route: DeliveryRoute;
  now: Date;
  onPod: (stop: DeliveryStop, index: number) => void;
}) {
  const [open, setOpen] = useState(route.status === "em_andamento");
  const stops = deliveryStops(route);
  const done = stops.filter(isDone).length;
  const late = stops.filter((s) => lateNow(s, route, now)).length;
  const problems = stops.filter((s) => s.status === "recusada" || s.status === "parcial").length;
  const current = route.stops.find((s) => !isDone(s));
  return (
    <section className="premium-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center"
        aria-expanded={open}
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <RouteIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-extrabold">
            {route.code} · {route.title}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {route.carrierName} · {route.plate ?? "--"}
            {route.driverFirstName ? ` · ${route.driverFirstName}` : ""} ·{" "}
            {new Date(route.scheduledAt).toLocaleDateString("pt-BR")}
            {route.status === "em_andamento" && current ? ` · agora: ${current.name}` : ""}
          </span>
        </span>
        <span className="flex w-full items-center gap-2 sm:w-44">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2/70">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }}
            />
          </span>
          <span className="text-[12px] font-bold tabular-nums">
            {done}/{stops.length}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {late ? <Pill tone="danger">{late} atrasada(s)</Pill> : null}
          {problems ? <Pill tone="warning">{problems} recusa/parcial</Pill> : null}
          <Pill
            tone={
              route.status === "finalizada"
                ? "good"
                : route.status === "em_andamento"
                  ? "neutral"
                  : "muted"
            }
          >
            {route.status === "finalizada"
              ? "Finalizada"
              : route.status === "em_andamento"
                ? "Em andamento"
                : route.status === "cancelada"
                  ? "Cancelada"
                  : "Agendada"}
          </Pill>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open ? (
        <ol className="divide-y divide-border/70 border-t border-border/70 px-4">
          {route.stops.map((stop) => (
            <StopRow key={stop.id} stop={stop} route={route} now={now} onPod={onPod} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function StopRow({
  stop,
  route,
  now,
  onPod,
}: {
  stop: DeliveryStop;
  route: DeliveryRoute;
  now: Date;
  onPod: (stop: DeliveryStop, index: number) => void;
}) {
  const ok = arrivedOnTime(stop, route);
  const dwell = stopDwellMin(stop);
  const planned = stop.invoices.reduce((s, nf) => s + (nf.boxes ?? 0), 0);
  const isDelivery = stop.kind === "entrega" || stop.kind === "destino";
  const ret = Object.entries(stop.returnablesExpected);
  return (
    <li className="flex flex-col gap-2 py-3 text-[12px] sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <MapPin
          className={cn(
            "mt-0.5 size-4 shrink-0",
            stop.status === "entregue" ? "text-success" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold">
            {stop.name}
            {stop.document ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                {formatCnpj(stop.document)}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground">
            {stop.kind === "origem" ? "Carregamento" : stop.kind === "retorno" ? "Retorno" : null}
            {stop.windowFrom && stop.windowTo ? `Janela ${stop.windowFrom}-${stop.windowTo}` : ""}
            {stop.arrivedAt
              ? ` · chegou ${hm(stop.arrivedAt)}${stop.arrivalSource === "cerca" ? " (cerca)" : ""}`
              : ""}
            {stop.finishedAt ? ` · saiu ${hm(stop.finishedAt)}` : ""}
            {dwell !== undefined ? ` · ${formatDuration(dwell)} no local` : ""}
          </p>
          {isDelivery && (stop.invoices.length || isDone(stop)) ? (
            <p className="text-muted-foreground">
              {stop.invoices.map((nf) => nf.number).join(", ")}
              {planned
                ? isDone(stop)
                  ? ` · ${stop.boxesDelivered ?? planned}/${planned} cx entregues`
                  : ` · ${planned} cx`
                : ""}
              {stop.receiverName ? ` · recebeu ${stop.receiverName}` : ""}
              {stop.refusalReason
                ? ` · motivo: ${REFUSAL_LABEL[stop.refusalReason] ?? stop.refusalReason}`
                : ""}
              {stop.refusalNote ? ` (${stop.refusalNote})` : ""}
            </p>
          ) : null}
          {isDelivery && ret.length ? (
            <p className="text-muted-foreground">
              {isDone(stop) ? "Vasilhame recolhido: " : "Vasilhame previsto: "}
              {ret
                .map(([k, v]) =>
                  isDone(stop)
                    ? `${RETURNABLE_LABEL[k] ?? k} ${stop.returnablesCollected[k] ?? 0}/${v}`
                    : `${RETURNABLE_LABEL[k] ?? k} ${v}`,
                )
                .join(" · ")}
              {stop.paymentExpected !== undefined
                ? isDone(stop)
                  ? ` · recebido ${brl(stop.paymentReceived ?? 0)} de ${brl(stop.paymentExpected)}`
                  : ` · receber ${brl(stop.paymentExpected)}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {stop.podPhotos.map((_, i) => (
          <Button
            key={i}
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-2.5 text-[11px]"
            onClick={() => onPod(stop, i)}
          >
            <Camera className="size-3.5" /> Canhoto {stop.podPhotos.length > 1 ? i + 1 : ""}
          </Button>
        ))}
        {stop.signed ? <Pill tone="muted">Assinado</Pill> : null}
        {isDelivery && isDone(stop) && stop.status !== "recusada" && !hasPod(stop) ? (
          <Pill tone="warning">Sem canhoto</Pill>
        ) : null}
        {ok === false ? <Pill tone="danger">Fora da janela</Pill> : null}
        {lateNow(stop, route, now) ? <Pill tone="danger">Atrasada</Pill> : null}
        <Pill tone={stopTone(stop)}>{STOP_STATUS_LABEL[stop.status]}</Pill>
      </div>
    </li>
  );
}
