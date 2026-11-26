import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  MapPin,
  PackageX,
  Plus,
  Route as RouteIcon,
  Truck,
} from "lucide-react";
import { FrotakEmptyState, FrotakMetric, FrotakSection } from "@/components/frotak/FrotakPage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  listDrivers,
  listRouteEvents,
  listRoutes,
  listVehicles,
  opsFileUrl,
  upsertRoute,
  type RouteRow,
  type StopRow,
} from "@/modules/driver-ops/infrastructure/opsRepository";
import {
  LoadError,
  REFUSAL,
  STOP_STATUS,
  StatusBadge,
  act,
  dateTime,
  money,
  num,
  todayIso,
  useLoad,
} from "./shared";

/** Fim da janela no dia da rota (ou no dia da chegada). */
function windowEnd(stop: StopRow, routeDay: string) {
  if (!stop.window_to || stop.kind !== "entrega") return null;
  const [h, m] = stop.window_to.split(":").map(Number);
  const limit = new Date(stop.arrived_at ?? routeDay);
  limit.setHours(h ?? 0, m ?? 0, 0, 0);
  return limit;
}

/** Chegou depois da janela, ou a janela já passou e ninguém chegou. */
function isLate(stop: StopRow, routeDay: string, now = new Date()) {
  const limit = windowEnd(stop, routeDay);
  if (!limit) return false;
  if (stop.arrived_at) return new Date(stop.arrived_at) > limit;
  return isLateNow(stop, routeDay, now);
}

/** Janela passou e o motorista ainda não chegou. */
function isLateNow(stop: StopRow, routeDay: string, now = new Date()) {
  const limit = windowEnd(stop, routeDay);
  return (
    !!limit && !stop.arrived_at && ["pendente", "a_caminho"].includes(stop.status) && now > limit
  );
}

export function RoutesTab({ tenantId }: { tenantId: string }) {
  const [date, setDate] = useState(todayIso());
  const [creating, setCreating] = useState(false);
  const routes = useLoad(() => listRoutes(date), [date], 30_000);
  const events = useLoad(
    () => listRouteEvents((routes.data ?? []).map((r) => r.id)),
    [routes.data],
  );

  const stats = useMemo(() => {
    const all = routes.data ?? [];
    const stops = all.flatMap((r) =>
      r.delivery_route_stops
        .filter((s) => s.kind === "entrega")
        .map((s) => ({ ...s, day: r.scheduled_at })),
    );
    const done = stops.filter((s) => ["entregue", "parcial", "recusada"].includes(s.status));
    const ok = stops.filter((s) => s.status === "entregue");
    const refused = stops.filter((s) => s.status === "recusada" || s.status === "parcial");
    const late = stops.filter((s) => isLateNow(s, s.day));
    const onTime = done.filter((s) => s.window_to && !isLate(s, s.day)).length;
    const withWindow = done.filter((s) => s.window_to).length;
    return {
      routes: all.length,
      running: all.filter((r) => r.status === "em_andamento").length,
      stops: stops.length,
      done: done.length,
      ok: ok.length,
      refused: refused.length,
      late: late.length,
      otd: withWindow ? Math.round((onTime / withWindow) * 100) : null,
      noPod: done.filter(
        (s) => s.status !== "recusada" && !s.signature_data && !s.pod_photo_paths.length,
      ).length,
    };
  }, [routes.data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Dia</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[170px]"
          />
        </div>
        <Button onClick={() => setCreating(true)} className="ml-auto">
          <Plus className="size-4" /> Nova rota
        </Button>
      </div>
      <LoadError error={routes.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <FrotakMetric
          label="Rotas"
          value={stats.routes}
          detail={`${stats.running} em andamento`}
          icon={<RouteIcon className="size-4" />}
        />
        <FrotakMetric
          label="Entregas"
          value={`${stats.done}/${stats.stops}`}
          detail={`${stats.ok} sem pendência`}
          tone="positive"
          icon={<CheckCircle2 className="size-4" />}
        />
        <FrotakMetric
          label="No prazo (OTD)"
          value={stats.otd == null ? "--" : `${stats.otd}%`}
          detail="Chegadas dentro da janela"
          tone={stats.otd != null && stats.otd < 90 ? "warning" : "positive"}
          icon={<Clock className="size-4" />}
        />
        <FrotakMetric
          label="Atrasadas agora"
          value={stats.late}
          detail="Janela passou sem chegada"
          tone={stats.late ? "danger" : "positive"}
          icon={<AlertTriangle className="size-4" />}
        />
        <FrotakMetric
          label="Recusas e parciais"
          value={stats.refused}
          detail={`${stats.noPod} entrega(s) sem canhoto`}
          tone={stats.refused ? "warning" : "positive"}
          icon={<PackageX className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          {(routes.data ?? []).length === 0 && !routes.loading ? (
            <FrotakSection>
              <FrotakEmptyState
                title="Nenhuma rota neste dia"
                description="Crie a rota com as paradas. O motorista vê no app e cada etapa marca o ponto sozinha."
                actionLabel="Nova rota"
                onAction={() => setCreating(true)}
              />
            </FrotakSection>
          ) : null}
          {(routes.data ?? []).map((r) => (
            <RouteCard key={r.id} route={r} />
          ))}
        </div>
        <FrotakSection title="Linha do tempo" description="Etapas registradas pelos motoristas">
          <ol className="flex max-h-[640px] flex-col gap-3 overflow-y-auto">
            {(events.data ?? []).map((e) => {
              const route = routes.data?.find((r) => r.id === e.route_id);
              return (
                <li key={e.id} className="flex gap-3 text-xs">
                  <span className="w-11 shrink-0 tabular-nums text-muted-foreground">
                    {new Date(e.occurred_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {EVENT_LABEL[e.kind] ?? e.kind}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {e.detail} {route ? `· ${route.vehicle?.plate ?? route.code}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
            {!events.data?.length ? (
              <li className="text-xs text-muted-foreground">Sem etapas ainda.</li>
            ) : null}
          </ol>
        </FrotakSection>
      </div>

      <NewRouteDialog
        open={creating}
        onClose={() => setCreating(false)}
        tenantId={tenantId}
        date={date}
        onSaved={() => void routes.reload()}
      />
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  inicio: "Viagem iniciada",
  chegada: "Chegada",
  inicio_carga: "Início do carregamento",
  fim_carga: "Carregamento concluído",
  inicio_descarga: "Início da descarga",
  entrega: "Entrega",
  entrega_parcial: "Entrega parcial",
  recusa: "Recusa",
  fim: "Viagem finalizada",
};

function RouteCard({ route }: { route: RouteRow }) {
  const [open, setOpen] = useState(route.status === "em_andamento");
  const deliveries = route.delivery_route_stops.filter(
    (s) => s.kind === "entrega" || s.kind === "destino",
  );
  const done = deliveries.filter((s) =>
    ["entregue", "parcial", "recusada"].includes(s.status),
  ).length;
  const current = route.delivery_route_stops.find(
    (s) => !["entregue", "parcial", "recusada"].includes(s.status),
  );
  const late = deliveries.filter((s) => isLateNow(s, route.scheduled_at)).length;
  return (
    <section className="overflow-hidden rounded-[25px] border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Truck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {route.vehicle?.plate ?? "Sem veículo"} · {route.driver?.name ?? "Sem motorista"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {route.code} · {route.title}
            {current && route.status === "em_andamento" ? ` · agora: ${current.name}` : ""}
          </p>
        </div>
        <div className="hidden w-40 sm:block">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Entregas</span>
            <span className="tabular-nums">
              {done}/{deliveries.length}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${deliveries.length ? (done / deliveries.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        {late ? <StatusBadge tone="danger">{late} atrasada(s)</StatusBadge> : null}
        <StatusBadge
          tone={
            route.status === "em_andamento"
              ? "ok"
              : route.status === "finalizada"
                ? "muted"
                : "warn"
          }
        >
          {route.status === "em_andamento"
            ? "Em andamento"
            : route.status === "finalizada"
              ? "Finalizada"
              : route.status === "cancelada"
                ? "Cancelada"
                : "Agendada"}
        </StatusBadge>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-3">
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Saída: {dateTime(route.started_at)}</span>
            <span>Fim: {dateTime(route.finished_at)}</span>
            <span>
              Km: {route.start_odometer ? num(route.start_odometer) : "--"} →{" "}
              {route.end_odometer ? num(route.end_odometer) : "--"}
            </span>
            <span>{route.total_boxes} caixas</span>
          </div>
          <ol className="flex flex-col divide-y divide-border">
            {route.delivery_route_stops.map((s) => (
              <StopLine key={s.id} stop={s} routeDay={route.scheduled_at} />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function StopLine({ stop, routeDay }: { stop: StopRow; routeDay: string }) {
  const st = STOP_STATUS[stop.status] ?? { label: stop.status, tone: "muted" as const };
  const expected = stop.invoices.reduce((s, nf) => s + (nf.boxes ?? 0), 0);
  const ret = Object.entries(stop.returnables_expected ?? {});
  const late = isLate(stop, routeDay);
  const openPhoto = (path: string) =>
    void opsFileUrl(path).then((url) => window.open(url, "_blank"));
  return (
    <li className="flex flex-col gap-1.5 py-3 text-xs sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <MapPin
          className={cn(
            "mt-0.5 size-4 shrink-0",
            stop.status === "entregue" ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{stop.name}</p>
          <p className="text-muted-foreground">
            {stop.window_from && stop.window_to
              ? `Janela ${stop.window_from.slice(0, 5)}–${stop.window_to.slice(0, 5)}`
              : stop.kind}
            {stop.arrived_at
              ? ` · chegou ${dateTime(stop.arrived_at)}${stop.arrival_source === "cerca" ? " (cerca)" : ""}`
              : ""}
            {stop.finished_at ? ` · saiu ${dateTime(stop.finished_at)}` : ""}
          </p>
          {stop.finished_at && stop.kind === "entrega" ? (
            <p className="mt-0.5 text-muted-foreground">
              {stop.boxes_delivered ?? 0}/{expected} cx
              {stop.receiver_name ? ` · recebeu ${stop.receiver_name}` : ""}
              {stop.refusal_reason
                ? ` · motivo: ${REFUSAL[stop.refusal_reason] ?? stop.refusal_reason}`
                : ""}
              {stop.refusal_note ? ` (${stop.refusal_note})` : ""}
              {ret.length
                ? ` · vasilhame ${ret.map(([k, v]) => `${k} ${stop.returnables_collected?.[k] ?? 0}/${v}`).join(", ")}`
                : ""}
              {stop.payment_received
                ? ` · ${stop.payment_received.received ? "recebeu" : "não recebeu"} ${money(stop.payment_received.amount ?? 0)}`
                : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
        {stop.signature_data ? <StatusBadge tone="muted">Assinado</StatusBadge> : null}
        {stop.pod_photo_paths.map((p, i) => (
          <Button key={p} size="sm" variant="outline" onClick={() => openPhoto(p)}>
            Canhoto {stop.pod_photo_paths.length > 1 ? i + 1 : ""}
          </Button>
        ))}
        {late ? <StatusBadge tone="danger">Fora da janela</StatusBadge> : null}
        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
      </div>
    </li>
  );
}

// Uma parada por linha: Nome; Endereco; Cidade; janela inicio; janela fim; caixas; valor; NF
const EXAMPLE = `CDD (origem); Av. Industrial, 1500; Aracaju/SE
Mercadinho Exemplo; Rua A, 10; Aracaju/SE; 07:00; 11:00; 48; 3912,40; NF 184.221
Bar Exemplo; Av. B, 200; Aracaju/SE; 08:00; 12:00; 22; 1876,00; NF 184.222
CDD (retorno); Av. Industrial, 1500; Aracaju/SE`;

function parseStops(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line, i) => {
    const [name, address, city, from, to, boxes, amount, nf] = line.split(";").map((p) => p.trim());
    const kind =
      i === 0 ? "origem" : i === lines.length - 1 && lines.length > 2 ? "retorno" : "entrega";
    const value = amount ? Number(amount.replace(/\./g, "").replace(",", ".")) : 0;
    return {
      kind,
      name: name ?? `Parada ${i + 1}`,
      address: address ?? "",
      city: city ?? "",
      ...(from ? { window_from: from } : {}),
      ...(to ? { window_to: to } : {}),
      invoices:
        kind === "entrega"
          ? [{ number: nf || `Parada ${i}`, boxes: Number(boxes) || 0, amount: value }]
          : [],
    };
  });
}

function NewRouteDialog({
  open,
  onClose,
  tenantId,
  date,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  date: string;
  onSaved: () => void;
}) {
  const drivers = useLoad(listDrivers, []);
  const vehicles = useLoad(listVehicles, []);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("distribuicao");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [time, setTime] = useState("06:00");
  const [stops, setStops] = useState("");
  const parsed = parseStops(stops);
  const boxes = parsed.reduce((s, p) => s + p.invoices.reduce((a, nf) => a + nf.boxes, 0), 0);

  const save = () =>
    act(
      "Rota criada. O motorista já vê no app.",
      () =>
        upsertRoute(tenantId, {
          code,
          kind,
          title: title || `Rota ${code}`,
          driver_id: driverId || null,
          vehicle_id: vehicleId || drivers.data?.find((d) => d.id === driverId)?.vehicle_id || null,
          scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
          total_boxes: boxes,
          stops: parsed,
        }),
      () => {
        onSaved();
        onClose();
        setCode("");
        setStops("");
      },
    );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova rota</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Número do mapa / frete</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="7732" />
          </div>
          <div>
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rota Aracaju Sul"
            />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="distribuicao">Distribuição (várias entregas)</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Saída prevista</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <Label>Motorista</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {(drivers.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Veículo</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="O do motorista" />
              </SelectTrigger>
              <SelectContent>
                {(vehicles.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plate} {v.model ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Paradas, uma por linha (cole da planilha do mapa de carga)</Label>
          <Textarea
            value={stops}
            onChange={(e) => setStops(e.target.value)}
            rows={7}
            placeholder={EXAMPLE}
            className="font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Nome; endereço; cidade; janela início; janela fim; caixas; valor; NF. A primeira linha é
            a origem e a última, o retorno.{" "}
            {parsed.length ? `${parsed.length} paradas, ${boxes} caixas.` : ""}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!code || parsed.length < 2 || !driverId} onClick={() => void save()}>
            Criar rota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
