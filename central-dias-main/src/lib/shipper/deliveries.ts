import { DIESEL_KG_CO2_PER_LITER } from "./types";

// Rotas de entrega que as transportadoras conectadas fazem para o embarcador.
// Vem do app do motorista (operacao com embarcador): cada parada guarda chegada,
// descarga, canhoto, recusa, vasilhame e recebimento. O embarcador nao ve ponto,
// abastecimento nem custo da transportadora.

export type DeliveryStopKind = "origem" | "entrega" | "destino" | "retorno";
export type DeliveryStopStatus =
  "pendente" | "a_caminho" | "chegou" | "descarregando" | "entregue" | "parcial" | "recusada";

export interface DeliveryStop {
  id: string;
  seq: number;
  kind: DeliveryStopKind;
  name: string;
  document?: string;
  city?: string;
  windowFrom?: string;
  windowTo?: string;
  status: DeliveryStopStatus;
  arrivedAt?: string;
  arrivalSource?: "motorista" | "cerca";
  unloadStartedAt?: string;
  finishedAt?: string;
  invoices: Array<{ number: string; boxes?: number }>;
  boxesDelivered?: number;
  refusalReason?: string;
  refusalNote?: string;
  receiverName?: string;
  signed: boolean;
  podPhotos: string[];
  returnablesExpected: Record<string, number>;
  returnablesCollected: Record<string, number>;
  paymentMethod?: string;
  paymentExpected?: number;
  paymentReceived?: number;
}

export interface DeliveryRoute {
  id: string;
  code: string;
  kind: "distribuicao" | "transferencia";
  title: string;
  carrierName: string;
  status: "agendada" | "em_andamento" | "finalizada" | "cancelada";
  scheduledAt: string;
  startedAt?: string;
  finishedAt?: string;
  plate?: string;
  driverFirstName?: string;
  totalBoxes: number;
  distanceKm?: number;
  kmDriven?: number;
  kmPerLiter?: number;
  stops: DeliveryStop[];
}

export interface ShipperDeliveriesData {
  routes: DeliveryRoute[];
  from: string;
  to: string;
  generatedAt: string;
  /** Relogio usado para "atrasada agora". So a demonstracao fixa um horario. */
  asOf?: string;
}

export const clockOf = (data: Pick<ShipperDeliveriesData, "asOf">) =>
  data.asOf ? new Date(data.asOf) : new Date();

export const STOP_STATUS_LABEL: Record<DeliveryStopStatus, string> = {
  pendente: "Pendente",
  a_caminho: "A caminho",
  chegou: "No local",
  descarregando: "Descarregando",
  entregue: "Entregue",
  parcial: "Parcial",
  recusada: "Recusada",
};

export const REFUSAL_LABEL: Record<string, string> = {
  cliente_fechado: "Cliente fechado",
  sem_pagamento: "Sem pagamento",
  avaria: "Avaria",
  pedido_errado: "Pedido errado",
  sem_espaco: "Sem espaço",
  falta_produto: "Falta de produto",
  outro: "Outro",
};

export const RETURNABLE_LABEL: Record<string, string> = {
  garrafeira: "Garrafeira",
  barril: "Barril",
  palete: "Palete",
  caixa: "Caixa",
};

/** Consumo usado quando a transportadora ainda nao tem km/l medido do caminhao. */
export const DEFAULT_TRUCK_KM_PER_LITER = 3.2;

const DONE = new Set<DeliveryStopStatus>(["entregue", "parcial", "recusada"]);

export const isDone = (stop: DeliveryStop) => DONE.has(stop.status);
export const deliveryStops = (route: DeliveryRoute) =>
  route.stops.filter((stop) => stop.kind === "entrega" || stop.kind === "destino");

/** Fim da janela da parada, no dia da chegada (ou no dia da rota, se ainda nao chegou). */
export function windowEnd(stop: DeliveryStop, route: DeliveryRoute) {
  if (!stop.windowTo) return null;
  const [h, m] = stop.windowTo.split(":").map(Number);
  const limit = new Date(stop.arrivedAt ?? route.scheduledAt);
  limit.setHours(h ?? 0, m ?? 0, 0, 0);
  return limit;
}

export function arrivedOnTime(stop: DeliveryStop, route: DeliveryRoute) {
  const limit = windowEnd(stop, route);
  if (!limit || !stop.arrivedAt) return null;
  return new Date(stop.arrivedAt) <= limit;
}

export function lateNow(stop: DeliveryStop, route: DeliveryRoute, now = new Date()) {
  const limit = windowEnd(stop, route);
  return (
    !!limit &&
    !stop.arrivedAt &&
    (stop.status === "pendente" || stop.status === "a_caminho") &&
    route.status === "em_andamento" &&
    now > limit
  );
}

export function hasPod(stop: DeliveryStop) {
  return stop.signed || stop.podPhotos.length > 0;
}

export function stopDwellMin(stop: DeliveryStop) {
  if (!stop.arrivedAt || !stop.finishedAt) return undefined;
  return Math.max(
    0,
    (new Date(stop.finishedAt).getTime() - new Date(stop.arrivedAt).getTime()) / 60_000,
  );
}

export function routeKm(route: DeliveryRoute) {
  return route.kmDriven ?? (route.status === "finalizada" ? route.distanceKm : undefined);
}

export function routeCo2Kg(route: DeliveryRoute) {
  const km = routeKm(route);
  if (!km) return 0;
  const kml =
    route.kmPerLiter && route.kmPerLiter > 0 ? route.kmPerLiter : DEFAULT_TRUCK_KM_PER_LITER;
  return (km / kml) * DIESEL_KG_CO2_PER_LITER;
}

export interface DeliveryKpis {
  routes: number;
  running: number;
  stops: number;
  done: number;
  delivered: number;
  partial: number;
  refused: number;
  otdPct: number | null;
  withWindow: number;
  lateNow: number;
  podPct: number | null;
  podMissing: number;
  boxesPlanned: number;
  boxesDelivered: number;
  returnables: Array<{ kind: string; expected: number; collected: number }>;
  refusalsByReason: Array<{ reason: string; count: number }>;
  avgDwellMin: number | null;
  geofencePct: number | null;
  paymentExpected: number;
  paymentReceived: number;
  co2Kg: number;
  km: number;
}

export function computeDeliveryKpis(data: ShipperDeliveriesData): DeliveryKpis {
  const clock = clockOf(data);
  let stops = 0;
  let done = 0;
  let delivered = 0;
  let partial = 0;
  let refused = 0;
  let onTime = 0;
  let withWindow = 0;
  let late = 0;
  let podOk = 0;
  let podBase = 0;
  let boxesPlanned = 0;
  let boxesDelivered = 0;
  let dwellSum = 0;
  let dwellCount = 0;
  let arrivals = 0;
  let fenceArrivals = 0;
  let paymentExpected = 0;
  let paymentReceived = 0;
  let co2Kg = 0;
  let km = 0;
  const returnables = new Map<string, { expected: number; collected: number }>();
  const reasons = new Map<string, number>();

  for (const route of data.routes) {
    if (route.status === "cancelada") continue;
    co2Kg += routeCo2Kg(route);
    km += routeKm(route) ?? 0;
    for (const stop of deliveryStops(route)) {
      stops += 1;
      const planned = stop.invoices.reduce((sum, nf) => sum + (nf.boxes ?? 0), 0);
      boxesPlanned += planned;
      if (lateNow(stop, route, clock)) late += 1;
      if (stop.arrivedAt) {
        arrivals += 1;
        if (stop.arrivalSource === "cerca") fenceArrivals += 1;
      }
      if (!isDone(stop)) continue;
      done += 1;
      if (stop.status === "entregue") delivered += 1;
      if (stop.status === "parcial") partial += 1;
      if (stop.status === "recusada") refused += 1;
      boxesDelivered +=
        stop.boxesDelivered ??
        (stop.status === "entregue" ? planned : stop.status === "recusada" ? 0 : 0);
      const ok = arrivedOnTime(stop, route);
      if (ok !== null) {
        withWindow += 1;
        if (ok) onTime += 1;
      }
      if (stop.status !== "recusada") {
        podBase += 1;
        if (hasPod(stop)) podOk += 1;
      }
      if (stop.refusalReason)
        reasons.set(stop.refusalReason, (reasons.get(stop.refusalReason) ?? 0) + 1);
      const dwell = stopDwellMin(stop);
      if (dwell !== undefined) {
        dwellSum += dwell;
        dwellCount += 1;
      }
      for (const [kind, qty] of Object.entries(stop.returnablesExpected)) {
        const row = returnables.get(kind) ?? { expected: 0, collected: 0 };
        row.expected += qty;
        row.collected += stop.returnablesCollected[kind] ?? 0;
        returnables.set(kind, row);
      }
      paymentExpected += stop.paymentExpected ?? 0;
      paymentReceived += stop.paymentReceived ?? 0;
    }
  }

  return {
    routes: data.routes.length,
    running: data.routes.filter((r) => r.status === "em_andamento").length,
    stops,
    done,
    delivered,
    partial,
    refused,
    otdPct: withWindow ? Math.round((onTime / withWindow) * 100) : null,
    withWindow,
    lateNow: late,
    podPct: podBase ? Math.round((podOk / podBase) * 100) : null,
    podMissing: podBase - podOk,
    boxesPlanned,
    boxesDelivered,
    returnables: [...returnables.entries()]
      .map(([kind, v]) => ({ kind, ...v }))
      .sort((a, b) => b.expected - a.expected),
    refusalsByReason: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    avgDwellMin: dwellCount ? dwellSum / dwellCount : null,
    geofencePct: arrivals ? Math.round((fenceArrivals / arrivals) * 100) : null,
    paymentExpected,
    paymentReceived,
    co2Kg: Math.round(co2Kg),
    km: Math.round(km),
  };
}

/** Uma linha por parada, para o relatorio do embarcador (abre no Excel). */
export function deliveriesCsv(data: ShipperDeliveriesData) {
  const head = [
    "Data",
    "Rota",
    "Transportadora",
    "Placa",
    "Parada",
    "Cliente",
    "CNPJ do cliente",
    "Notas",
    "Janela",
    "Chegada",
    "Saída",
    "No prazo",
    "Situação",
    "Caixas previstas",
    "Caixas entregues",
    "Motivo",
    "Recebedor",
    "Canhoto",
    "Vasilhame previsto",
    "Vasilhame recolhido",
    "Recebimento previsto",
    "Recebido",
  ];
  const time = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const pairs = (rec: Record<string, number>) =>
    Object.entries(rec)
      .map(([k, v]) => `${RETURNABLE_LABEL[k] ?? k} ${v}`)
      .join(" / ");
  const money = (v?: number) => (v === undefined ? "" : v.toFixed(2).replace(".", ","));
  const rows: string[][] = [];
  for (const route of data.routes) {
    for (const stop of deliveryStops(route)) {
      const ok = arrivedOnTime(stop, route);
      rows.push([
        new Date(route.scheduledAt).toLocaleDateString("pt-BR"),
        route.code,
        route.carrierName,
        route.plate ?? "",
        String(stop.seq),
        stop.name,
        stop.document ?? "",
        stop.invoices.map((nf) => nf.number).join(" / "),
        stop.windowFrom && stop.windowTo ? `${stop.windowFrom}-${stop.windowTo}` : "",
        time(stop.arrivedAt),
        time(stop.finishedAt),
        ok === null ? "" : ok ? "Sim" : "Não",
        STOP_STATUS_LABEL[stop.status],
        String(stop.invoices.reduce((s, nf) => s + (nf.boxes ?? 0), 0)),
        stop.boxesDelivered === undefined ? "" : String(stop.boxesDelivered),
        stop.refusalReason ? (REFUSAL_LABEL[stop.refusalReason] ?? stop.refusalReason) : "",
        stop.receiverName ?? "",
        hasPod(stop) ? "Sim" : isDone(stop) && stop.status !== "recusada" ? "Falta" : "",
        pairs(stop.returnablesExpected),
        pairs(stop.returnablesCollected),
        money(stop.paymentExpected),
        money(stop.paymentReceived),
      ]);
    }
  }
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

// ------------------------------------------------------------- Demonstracao

function at(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

type DemoStop = Partial<DeliveryStop> & Pick<DeliveryStop, "name" | "status">;

function stop(seq: number, kind: DeliveryStopKind, s: DemoStop): DeliveryStop {
  return {
    id: `demo-stop-${seq}-${s.name}`,
    seq,
    kind,
    invoices: [],
    signed: false,
    podPhotos: [],
    returnablesExpected: {},
    returnablesCollected: {},
    ...s,
  };
}

/** Rotas ficticias de hoje e dos ultimos dias, para a demonstracao do portal. */
export function demoDeliveries(now = new Date()): ShipperDeliveriesData {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const routes: DeliveryRoute[] = [];
  const customers = [
    [
      "Mercadinho Bom Preço (exemplo)",
      "12345678000101",
      "07:00",
      "11:00",
      48,
      { garrafeira: 40 },
      3912.4,
    ],
    [
      "Bar do Litoral (exemplo)",
      "23456789000102",
      "08:00",
      "12:00",
      22,
      { garrafeira: 22, barril: 2 },
      1876,
    ],
    [
      "Supermercado Sergipano (exemplo)",
      "34567890000103",
      "07:00",
      "10:00",
      156,
      { palete: 4 },
      12792,
    ],
    [
      "Adega Coroa do Meio (exemplo)",
      "45678901000104",
      "09:00",
      "13:00",
      30,
      { garrafeira: 30 },
      2610,
    ],
    [
      "Restaurante Orla Sul (exemplo)",
      "56789012000105",
      "10:00",
      "14:00",
      18,
      { garrafeira: 18, barril: 1 },
      1494,
    ],
    [
      "Conveniência Jardins (exemplo)",
      "67890123000106",
      "10:00",
      "16:00",
      26,
      { garrafeira: 24 },
      2236,
    ],
  ] as const;
  const carriers = ["Transportes Serigy (exemplo)", "Rota Leste Logística (exemplo)"];
  const plates = ["FTK4A21", "FTK7C33", "FTK2B90"];
  const drivers = ["Carlos", "Marcos", "Rafael"];
  const reasons = ["cliente_fechado", "avaria", "sem_pagamento", "pedido_errado", "sem_espaco"];

  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    for (let r = 0; r < (back === 0 ? 3 : 2); r += 1) {
      const seed = back * 7 + r * 3;
      const live = back === 0;
      const progress = live ? [4, 2, 0][r]! : 6;
      const stops: DeliveryStop[] = [
        stop(1, "origem", {
          name: "CDD Aracaju (exemplo)",
          status: live && r === 2 ? "chegou" : "entregue",
          arrivedAt: at(day, "05:40"),
          finishedAt: live && r === 2 ? undefined : at(day, "06:35"),
        }),
      ];
      customers.forEach((c, i) => {
        const [name, doc, from, to, boxes, ret, pay] = c;
        const seq = i + 2;
        const doneHere = i < progress;
        const variant = (seed + i) % 9;
        const status: DeliveryStopStatus = !doneHere
          ? i === progress && live && r !== 2
            ? "a_caminho"
            : "pendente"
          : variant === 4
            ? "recusada"
            : variant === 7
              ? "parcial"
              : "entregue";
        const [fh] = from.split(":").map(Number);
        const lateBy = variant === 2 ? 95 : variant === 5 ? 40 : 0;
        const arrMin = (fh ?? 8) * 60 + 25 + i * 18 + lateBy + (to === "10:00" ? 0 : 30);
        const arrived = doneHere ? at(day, `${Math.floor(arrMin / 60)}:${arrMin % 60}`) : undefined;
        const finished = doneHere
          ? at(
              day,
              `${Math.floor((arrMin + 22 + (variant % 3) * 9) / 60)}:${(arrMin + 22 + (variant % 3) * 9) % 60}`,
            )
          : undefined;
        const collected: Record<string, number> = {};
        if (doneHere && status !== "recusada") {
          for (const [k, v] of Object.entries(ret))
            collected[k] = variant === 1 ? Math.max(0, v - 3) : v;
        }
        stops.push(
          stop(seq, "entrega", {
            name,
            document: doc,
            city: "Aracaju/SE",
            windowFrom: from,
            windowTo: to,
            status,
            arrivedAt: arrived,
            arrivalSource: doneHere ? (variant === 3 ? "motorista" : "cerca") : undefined,
            unloadStartedAt: arrived,
            finishedAt: finished,
            invoices: [{ number: `NF ${184221 + seed * 10 + i}`, boxes }],
            boxesDelivered:
              status === "entregue"
                ? boxes
                : status === "parcial"
                  ? Math.round(boxes * 0.7)
                  : status === "recusada"
                    ? 0
                    : undefined,
            refusalReason:
              status === "recusada" || status === "parcial"
                ? reasons[(seed + i) % reasons.length]
                : undefined,
            receiverName:
              status === "entregue" || status === "parcial" ? "Recebedor (exemplo)" : undefined,
            signed: (status === "entregue" || status === "parcial") && variant !== 6,
            podPhotos:
              (status === "entregue" || status === "parcial") && variant !== 6 ? ["demo"] : [],
            returnablesExpected: { ...ret },
            returnablesCollected: collected,
            paymentMethod: "boleto",
            paymentExpected: pay,
            paymentReceived:
              doneHere && status !== "recusada"
                ? status === "parcial"
                  ? pay * 0.7
                  : pay
                : undefined,
          }),
        );
      });
      routes.push({
        id: `demo-route-${back}-${r}`,
        code: `77${31 + r}-${String(day.getFullYear()).slice(2)}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`,
        kind: "distribuicao",
        title: ["Aracaju Sul", "Aracaju Norte", "Grande Aracaju"][r]!,
        carrierName: carriers[r % 2]!,
        status: live && progress < 6 ? "em_andamento" : "finalizada",
        scheduledAt: at(day, "06:00"),
        startedAt: at(day, "05:40"),
        finishedAt: live && progress < 6 ? undefined : at(day, "15:10"),
        plate: plates[r],
        driverFirstName: drivers[r],
        totalBoxes: 300,
        distanceKm: 58 + r * 9,
        kmDriven: live && progress < 6 ? undefined : 61 + r * 8 + (back % 3),
        kmPerLiter: r === 1 ? undefined : 3.6 + r * 0.2,
        stops,
      });
    }
  }
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  return {
    routes: routes.reverse(),
    from: from.toISOString(),
    to: now.toISOString(),
    generatedAt: now.toISOString(),
    // Fora do horario comercial a demonstracao "congela" o relogio as 11h30,
    // para a rota de hoje parecer uma manha normal de entregas.
    asOf: (now.getHours() >= 8 && now.getHours() < 17
      ? now
      : new Date(at(today, "11:30"))
    ).toISOString(),
  };
}
