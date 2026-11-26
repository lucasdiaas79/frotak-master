// Dados ficticios do modo demonstracao do portal do embarcador.
// Servem para apresentar o produto sem conta e sem banco. Nomes inventados.

import { DIESEL_KG_CO2_PER_LITER, type ShipperFreight, type ShipperPortalData } from "./types";
import type { PublicFreightEvent, PublicFreightStep } from "@/lib/freightShare";

const CITIES: Record<string, { lat: number; lng: number; label: string }> = {
  aracaju: { lat: -10.9472, lng: -37.0731, label: "Aracaju/SE" },
  socorro: { lat: -10.855, lng: -37.126, label: "Nossa Senhora do Socorro/SE" },
  estancia: { lat: -11.268, lng: -37.438, label: "Estância/SE" },
  esplanada: { lat: -11.796, lng: -37.945, label: "Esplanada/BA" },
  alagoinhas: { lat: -12.135, lng: -38.419, label: "Alagoinhas/BA" },
  feira: { lat: -12.266, lng: -38.966, label: "Feira de Santana/BA" },
  salvador: { lat: -12.9714, lng: -38.5014, label: "Salvador/BA" },
  camacari: { lat: -12.697, lng: -38.324, label: "Camaçari/BA" },
  maceio: { lat: -9.6498, lng: -35.7089, label: "Maceió/AL" },
  penedo: { lat: -10.29, lng: -36.586, label: "Penedo/AL" },
  recife: { lat: -8.0476, lng: -34.877, label: "Recife/PE" },
  propria: { lat: -10.211, lng: -36.84, label: "Propriá/SE" },
};

const CARRIERS = [
  { id: "c1", name: "Transportes Rio Real", cnpj: "11222333000144", status: "ativa" as const },
  { id: "c2", name: "Logística Atlântico", cnpj: "22333444000155", status: "ativa" as const },
  { id: "c3", name: "TransVale Cargas", cnpj: "33444555000166", status: "ativa" as const },
  { id: "c4", name: "Rodo Sul Express", cnpj: "44555666000177", status: "convidada" as const },
];

type Scenario = {
  carrier: "c1" | "c2" | "c3";
  plate: string;
  driver: string;
  product: string;
  to: keyof typeof CITIES;
  toName: string;
  phase:
    | "indo_carregar"
    | "carregando"
    | "documentos"
    | "em_rota"
    | "descarga"
    | "quebrado"
    | "entregue"
    | "entregue_sem_canhoto";
  at?: keyof typeof CITIES;
  /** Horas desde o inicio do frete. */
  ageH: number;
  loadMin: number;
  unloadMin?: number;
  liters?: number;
  tracked?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    carrier: "c1",
    plate: "TNX6J30",
    driver: "João",
    product: "Brita 1",
    to: "salvador",
    toName: "Construtora Litoral",
    phase: "em_rota",
    at: "esplanada",
    ageH: 6,
    loadMin: 95,
  },
  {
    carrier: "c1",
    plate: "QMF0384",
    driver: "Carlos",
    product: "Areia lavada",
    to: "feira",
    toName: "Concreteira Sertão",
    phase: "descarga",
    at: "feira",
    ageH: 9,
    loadMin: 80,
    unloadMin: 410,
  },
  {
    carrier: "c1",
    plate: "RPA2E41",
    driver: "Marcos",
    product: "Brita 0",
    to: "maceio",
    toName: "Pré-Moldados Alagoas",
    phase: "carregando",
    at: "aracaju",
    ageH: 2,
    loadMin: 0,
  },
  {
    carrier: "c1",
    plate: "PXA4173",
    driver: "Antônio",
    product: "Pó de pedra",
    to: "camacari",
    toName: "Polo Asfaltos",
    phase: "entregue",
    ageH: 30,
    loadMin: 70,
    unloadMin: 85,
    liters: 168,
  },
  {
    carrier: "c1",
    plate: "OEP4630",
    driver: "Paulo",
    product: "Brita 1",
    to: "salvador",
    toName: "Construtora Litoral",
    phase: "entregue",
    ageH: 54,
    loadMin: 110,
    unloadMin: 140,
    liters: 190,
  },
  {
    carrier: "c2",
    plate: "SLV3B22",
    driver: "Rafael",
    product: "Areia lavada",
    to: "recife",
    toName: "Incorporadora Capibaribe",
    phase: "quebrado",
    at: "penedo",
    ageH: 11,
    loadMin: 125,
    tracked: true,
  },
  {
    carrier: "c2",
    plate: "OEP5060",
    driver: "Diego",
    product: "Brita 1",
    to: "alagoinhas",
    toName: "Cimento Recôncavo",
    phase: "documentos",
    at: "aracaju",
    ageH: 4,
    loadMin: 160,
  },
  {
    carrier: "c2",
    plate: "OER5D76",
    driver: "Fábio",
    product: "Pó de pedra",
    to: "salvador",
    toName: "Construtora Litoral",
    phase: "entregue_sem_canhoto",
    ageH: 50,
    loadMin: 190,
    unloadMin: 380,
    liters: 205,
  },
  {
    carrier: "c2",
    plate: "OEP4660",
    driver: "Bruno",
    product: "Brita 0",
    to: "maceio",
    toName: "Pré-Moldados Alagoas",
    phase: "entregue",
    ageH: 75,
    loadMin: 150,
    unloadMin: 95,
    liters: 230,
  },
  {
    carrier: "c3",
    plate: "TVC1A90",
    driver: "Edson",
    product: "Areia média",
    to: "estancia",
    toName: "Blocos Estância",
    phase: "indo_carregar",
    at: "socorro",
    ageH: 1,
    loadMin: 0,
    tracked: false,
  },
  {
    carrier: "c3",
    plate: "TVC7K12",
    driver: "Luiz",
    product: "Brita 1",
    to: "propria",
    toName: "Prefeitura de Propriá",
    phase: "em_rota",
    at: "propria",
    ageH: 3,
    loadMin: 65,
    tracked: false,
  },
  {
    carrier: "c3",
    plate: "TVC4M55",
    driver: "Sérgio",
    product: "Areia lavada",
    to: "feira",
    toName: "Concreteira Sertão",
    phase: "entregue_sem_canhoto",
    ageH: 36,
    loadMin: 85,
    unloadMin: 520,
    liters: 150,
    tracked: false,
  },
  {
    carrier: "c3",
    plate: "TVC2P31",
    driver: "Renato",
    product: "Brita 0",
    to: "camacari",
    toName: "Polo Asfaltos",
    phase: "entregue",
    ageH: 98,
    loadMin: 75,
    unloadMin: 120,
    liters: 172,
  },
];

const STATUS: Record<
  Scenario["phase"],
  { step: PublicFreightStep; label: string; detail?: string }
> = {
  indo_carregar: { step: "programado", label: "A caminho do carregamento" },
  carregando: { step: "carregamento", label: "No local de carregamento" },
  documentos: {
    step: "carregamento",
    label: "Carregado",
    detail: "Emitindo documentos para seguir viagem",
  },
  em_rota: { step: "em_rota", label: "Em rota de entrega" },
  descarga: { step: "em_rota", label: "No local de entrega", detail: "Aguardando descarga" },
  quebrado: { step: "em_rota", label: "Em rota de entrega" },
  entregue: { step: "entregue", label: "Entregue" },
  entregue_sem_canhoto: { step: "entregue", label: "Entregue" },
};

function buildFreight(s: Scenario, index: number, now: number): ShipperFreight {
  const carrier = CARRIERS.find((item) => item.id === s.carrier)!;
  const iso = (ms: number) => new Date(ms).toISOString();
  const start = now - s.ageH * 3_600_000;
  const origin = CITIES.aracaju;
  const dest = CITIES[s.to];
  const events: PublicFreightEvent[] = [];
  const push = (label: string, ms: number, place: string) => {
    if (ms <= now) events.push({ label, at: iso(ms), place });
  };

  const arriveLoad = start + 45 * 60_000;
  push("Saiu para carregar", start, CITIES.socorro.label);
  let docs: ShipperFreight["documents"] = [];
  let deliveredAt: number | undefined;
  let last = start;
  if (s.phase !== "indo_carregar") {
    push("Chegou ao local de carregamento", arriveLoad, origin.label);
    last = arriveLoad;
  }
  const loaded = arriveLoad + Math.max(s.loadMin - 20, 10) * 60_000;
  const leave = arriveLoad + s.loadMin * 60_000;
  if (
    ["documentos", "em_rota", "descarga", "quebrado", "entregue", "entregue_sem_canhoto"].includes(
      s.phase,
    )
  ) {
    push("Carregado, emitindo documentos", loaded, origin.label);
    docs.push({
      id: `d${index}-nf`,
      kind: "nota_fiscal",
      label: "Nota fiscal",
      sentAt: iso(loaded + 5 * 60_000),
      isImage: false,
      isProof: false,
    });
    docs.push({
      id: `d${index}-bal`,
      kind: "balanca",
      label: "Ticket de balança",
      sentAt: iso(loaded + 2 * 60_000),
      isImage: true,
      isProof: false,
    });
    last = loaded;
  }
  if (["em_rota", "descarga", "quebrado", "entregue", "entregue_sem_canhoto"].includes(s.phase)) {
    push("Documentos emitidos", leave - 5 * 60_000, origin.label);
    push("Saiu para entrega", leave, origin.label);
    docs.push({
      id: `d${index}-cte`,
      kind: "cte_mdfe",
      label: "CT-e / MDF-e",
      sentAt: iso(leave - 6 * 60_000),
      isImage: false,
      isProof: false,
    });
    last = leave;
  }
  if (s.phase === "quebrado") {
    const broke = now - 2.5 * 3_600_000;
    push("Parada por problema mecânico", broke, CITIES.penedo.label);
    last = broke;
  }
  let arriveDest: number | undefined;
  if (["descarga", "entregue", "entregue_sem_canhoto"].includes(s.phase)) {
    arriveDest =
      s.phase === "descarga"
        ? now - (s.unloadMin ?? 60) * 60_000
        : start + (s.ageH - 20 > 4 ? 8 : s.ageH * 0.4) * 3_600_000;
    push("Chegou ao local de entrega", arriveDest, dest.label);
    last = arriveDest;
  }
  if (["entregue", "entregue_sem_canhoto"].includes(s.phase) && arriveDest) {
    deliveredAt = arriveDest + (s.unloadMin ?? 60) * 60_000;
    push("Entrega concluída", deliveredAt, dest.label);
    last = deliveredAt;
    if (s.phase === "entregue") {
      const proofDelay = (s.carrier === "c1" ? 0.3 : s.carrier === "c2" ? 9 : 5) * 3_600_000;
      docs.push({
        id: `d${index}-desc`,
        kind: "comprovante_descarga",
        label: "Comprovante de descarga",
        sentAt: iso(deliveredAt + proofDelay * 0.8),
        isImage: true,
        isProof: true,
      });
      docs.push({
        id: `d${index}-can`,
        kind: "canhoto",
        label: "Canhoto assinado",
        sentAt: iso(deliveredAt + proofDelay),
        isImage: true,
        isProof: true,
      });
    }
  }
  docs = docs.filter((doc) => new Date(doc.sentAt).getTime() <= now);

  const status = STATUS[s.phase];
  const at = s.at ? CITIES[s.at] : undefined;
  const active = status.step !== "entregue";
  const tracked = s.tracked ?? true;
  return {
    id: `demo-${index}`,
    carrierId: carrier.id,
    carrierName: carrier.name,
    code: `FRT-${s.plate}-${(1000 + index * 37).toString(16).toUpperCase()}`,
    plate: s.plate,
    driverFirstName: s.driver,
    driverProfileId: `demo-p-${index}`,
    product: s.product,
    originName: "Mineradora Serra Azul",
    origin: origin.label,
    destinationName: s.toName,
    destination: dest.label,
    role: "remetente",
    step: status.step,
    statusLabel: status.label,
    statusDetail: status.detail,
    occurrence:
      s.phase === "quebrado"
        ? "Veículo parado por problema mecânico. A transportadora está cuidando disso."
        : undefined,
    finished: !active,
    startedAt: iso(start),
    deliveredAt: deliveredAt ? iso(deliveredAt) : undefined,
    lastEventAt: iso(last),
    position:
      active && at && tracked
        ? {
            lat: at.lat + (index % 3) * 0.01,
            lng: at.lng,
            at: iso(now - (index + 2) * 60_000),
            place: at.label,
          }
        : undefined,
    tracked,
    events: events.reverse(),
    documents: docs,
    loadingDwellMin: s.loadMin > 0 && s.phase !== "carregando" ? s.loadMin : undefined,
    unloadingDwellMin: s.phase === "descarga" || deliveredAt ? s.unloadMin : undefined,
    dieselLiters: deliveredAt ? s.liters : undefined,
    co2Kg: deliveredAt && s.liters ? Math.round(s.liters * DIESEL_KG_CO2_PER_LITER) : undefined,
  };
}

export function demoPortalData(now = Date.now()): ShipperPortalData {
  return {
    profile: {
      shipperId: "demo",
      companyName: "Mineradora Serra Azul",
      cnpj: "12345678000190",
      userName: "Ana",
      email: "logistica@serraazul.com.br",
      role: "admin",
      demo: true,
    },
    carriers: CARRIERS.map((carrier, index) => ({
      id: carrier.id,
      name: carrier.name,
      cnpj: carrier.cnpj,
      status: carrier.status,
      contactName: ["Roberto", "Fernanda", "Gilson", "Márcia"][index],
      contactPhone: "79999990000",
      invitedAt: new Date(now - (index === 3 ? 4 : 40) * 86_400_000).toISOString(),
      respondedAt:
        carrier.status === "ativa" ? new Date(now - 38 * 86_400_000).toISOString() : undefined,
    })),
    freights: SCENARIOS.map((scenario, index) => buildFreight(scenario, index, now)),
    generatedAt: new Date(now).toISOString(),
  };
}
