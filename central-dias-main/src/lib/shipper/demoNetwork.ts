// Terceiros e Rede Frotak no modo demonstracao. Nomes e numeros inventados.

import {
  DRIVER_DOC_LABELS,
  REQUIRED_DRIVER_DOCS,
  docStateFor,
  initialsOf,
  worstDocState,
  type DriverDecision,
  type DriverDocKind,
  type DriverDocumentInfo,
  type DriverRelation,
  type NetworkDriver,
  type ShipperDriver,
  type ShipperPortalData,
  type ShipperThirdPartyData,
} from "./types";

type Extra = {
  full: string;
  relation: DriverRelation;
  vehicle: string;
  base: string;
  score: number;
  pastTrips: number;
  onTime: number;
  docs: Partial<Record<DriverDocKind, number>>;
  decision?: DriverDecision;
  reason?: string;
  network?: boolean;
  validatedBy?: number;
  note?: string;
};

const DAY = 86_400_000;
// Validade em dias a partir de hoje (negativo = vencido).
const OK = { cnh: 900, rntrc: 400, seguro: 260, crlv: 200 };

const EXTRAS: Extra[] = [
  {
    full: "João Batista dos Santos",
    relation: "terceiro",
    vehicle: "Carreta Scania R450",
    base: "Aracaju/SE",
    score: 4.8,
    pastTrips: 13,
    onTime: 96,
    docs: { ...OK, gr: 120 },
    decision: "aprovado",
    network: true,
    validatedBy: 3,
    note: "Conhece bem a descarga da Construtora Litoral. Preferir ele para Salvador.",
  },
  {
    full: "Carlos Menezes",
    relation: "frota",
    vehicle: "Truck MB Atego",
    base: "Aracaju/SE",
    score: 4.6,
    pastTrips: 20,
    onTime: 94,
    docs: OK,
  },
  {
    full: "Marcos Silva",
    relation: "terceiro",
    vehicle: "Carreta Volvo FH 540",
    base: "Itabaiana/SE",
    score: 4.7,
    pastTrips: 8,
    onTime: 93,
    docs: { ...OK, seguro: 9 },
    decision: "aprovado",
    network: true,
    validatedBy: 2,
  },
  {
    full: "Antônio Ferreira",
    relation: "terceiro",
    vehicle: "Carreta DAF XF",
    base: "Lagarto/SE",
    score: 3.9,
    pastTrips: 4,
    onTime: 71,
    docs: { ...OK, cnh: -9 },
    decision: "em_revisao",
    reason: "CNH vencida em viagem",
  },
  {
    full: "Paulo Henrique Lima",
    relation: "frota",
    vehicle: "Bitruck VW 24.280",
    base: "Aracaju/SE",
    score: 4.4,
    pastTrips: 11,
    onTime: 90,
    docs: OK,
  },
  {
    full: "Rafael Oliveira",
    relation: "agregado",
    vehicle: "Carreta Scania G410",
    base: "Recife/PE",
    score: 4.2,
    pastTrips: 5,
    onTime: 85,
    docs: OK,
  },
  {
    full: "Diego Rocha",
    relation: "terceiro",
    vehicle: "Carreta Scania R440",
    base: "Aracaju/SE",
    score: 4.8,
    pastTrips: 6,
    onTime: 97,
    docs: OK,
    network: true,
    validatedBy: 3,
  },
  {
    full: "Fábio Nascimento",
    relation: "terceiro",
    vehicle: "Bitrem Scania G440",
    base: "Propriá/SE",
    score: 4.1,
    pastTrips: 3,
    onTime: 82,
    docs: { cnh: 500, rntrc: 18 },
  },
  {
    full: "Bruno Carvalho",
    relation: "frota",
    vehicle: "Truck VW Constellation",
    base: "Maceió/AL",
    score: 4.5,
    pastTrips: 9,
    onTime: 92,
    docs: OK,
  },
  {
    full: "Edson Pereira",
    relation: "agregado",
    vehicle: "Carreta Volvo FH 460",
    base: "Feira de Santana/BA",
    score: 4.6,
    pastTrips: 7,
    onTime: 95,
    docs: OK,
    decision: "aprovado",
  },
  {
    full: "Luiz Fernando Costa",
    relation: "terceiro",
    vehicle: "Carreta DAF XF 480",
    base: "Salvador/BA",
    score: 4.3,
    pastTrips: 2,
    onTime: 88,
    docs: OK,
  },
  {
    full: "Sérgio Almeida",
    relation: "terceiro",
    vehicle: "Truck MB Atego",
    base: "Camaçari/BA",
    score: 3.2,
    pastTrips: 3,
    onTime: 58,
    docs: OK,
    decision: "bloqueado",
    reason: "Duas descargas recusadas",
  },
  {
    full: "Renato Alves",
    relation: "frota",
    vehicle: "Bitruck VW 24.280",
    base: "Salvador/BA",
    score: 4.5,
    pastTrips: 6,
    onTime: 90,
    docs: OK,
  },
];

function docs(spec: Partial<Record<DriverDocKind, number>>, now: number): DriverDocumentInfo[] {
  const kinds: DriverDocKind[] = ["cnh", "rntrc", "seguro", "crlv", "gr"];
  return kinds
    .filter((kind) => spec[kind] !== undefined || REQUIRED_DRIVER_DOCS.includes(kind))
    .map((kind) => {
      const days = spec[kind];
      const expiresAt =
        days === undefined ? undefined : new Date(now + days * DAY).toISOString().slice(0, 10);
      return {
        kind,
        label: DRIVER_DOC_LABELS[kind],
        numberHint: days === undefined ? undefined : String(1000 + ((days * 37) % 9000)),
        expiresAt,
        state: expiresAt ? docStateFor(expiresAt, now) : "faltando",
        informedBy: kind === "gr" ? "transportadora" : "motorista",
      };
    });
}

const ROUTES = [
  "Aracaju → Salvador",
  "Aracaju → Feira de Santana",
  "Aracaju → Maceió",
  "Aracaju → Recife",
  "Aracaju → Camaçari",
];

export function demoThirdParties(
  portal: ShipperPortalData,
  now = Date.now(),
): ShipperThirdPartyData {
  const drivers: ShipperDriver[] = [];
  portal.freights.forEach((freight, index) => {
    const extra = EXTRAS[index];
    if (!extra || !freight.driverProfileId) return;
    const documents = docs(extra.docs, now);
    const past = Array.from({ length: Math.min(extra.pastTrips, 5) }, (_, i) => ({
      freightId: `${freight.id}-h${i}`,
      date: new Date(now - (i + 1) * 6 * DAY - index * 3600_000).toISOString(),
      route: ROUTES[(index + i) % ROUTES.length],
      carrierName: freight.carrierName,
      plate: freight.plate,
      finished: true,
      onTime: (i * 17 + index * 7) % 100 < extra.onTime,
      myScore:
        i % 2 === 0 ? Math.min(5, Math.round(extra.score + (i % 3 === 0 ? 0.3 : -0.2))) : undefined,
    }));
    drivers.push({
      profileId: freight.driverProfileId,
      name: extra.full,
      initials: initialsOf(extra.full),
      relation: extra.relation,
      plate: freight.plate,
      vehicleKind: extra.vehicle,
      baseCity: extra.base,
      carrierNames: [freight.carrierName],
      score: extra.score,
      scoreCount: extra.pastTrips * 2,
      tripsWithMe: extra.pastTrips + 1,
      onTimeRate: extra.onTime,
      occurrences: freight.occurrence ? 1 : extra.onTime < 80 ? 2 : 0,
      documents,
      docState: worstDocState(
        documents.filter((d) => REQUIRED_DRIVER_DOCS.includes(d.kind)).map((d) => d.state),
      ),
      decision: extra.decision,
      decisionReason: extra.reason,
      activeFreightIds: freight.finished ? [] : [freight.id],
      trips: [
        {
          freightId: freight.id,
          date: freight.deliveredAt ?? freight.startedAt,
          route: `${freight.origin?.split("/")[0]} → ${freight.destination?.split("/")[0]}`,
          carrierName: freight.carrierName,
          plate: freight.plate,
          finished: freight.finished,
          occurrence: freight.occurrence,
        },
        ...past,
      ],
      notes: extra.note
        ? [
            {
              id: `n-${index}`,
              body: extra.note,
              author: "Ana",
              at: new Date(now - 5 * DAY).toISOString(),
            },
          ]
        : [],
      inNetwork: extra.network === true,
      validatedBy: extra.validatedBy ?? (extra.decision === "aprovado" ? 1 : 0),
    });
  });
  return {
    drivers,
    settings: { shareApproved: true, shareRatings: true, shareBlocks: false },
  };
}

const NETWORK: Array<
  Omit<NetworkDriver, "initials" | "documents" | "docState"> & {
    docs: Partial<Record<DriverDocKind, number>>;
  }
> = [
  {
    profileId: "rede-1",
    name: "Wellington Costa",
    vehicleKind: "Carreta Volvo FH 460",
    baseCity: "Estância/SE",
    score: 4.9,
    scoreCount: 62,
    trips: 41,
    onTimeRate: 97,
    validatedBy: 4,
    availableFrom: undefined,
    availableNote: "Livre amanhã",
    docs: OK,
  },
  {
    profileId: "rede-2",
    name: "Diego Rocha",
    vehicleKind: "Carreta Scania R440",
    baseCity: "Aracaju/SE",
    score: 4.8,
    scoreCount: 40,
    trips: 27,
    onTimeRate: 96,
    validatedBy: 3,
    availableNote: "Livre agora",
    docs: OK,
  },
  {
    profileId: "rede-3",
    name: "Francisco Melo",
    vehicleKind: "Bitrem Scania G440",
    baseCity: "Itabaiana/SE",
    score: 4.7,
    scoreCount: 48,
    trips: 33,
    onTimeRate: 95,
    validatedBy: 5,
    availableNote: "Livre quinta",
    docs: OK,
  },
  {
    profileId: "rede-4",
    name: "Luciano Pereira",
    vehicleKind: "Carreta DAF XF 480",
    baseCity: "Lagarto/SE",
    score: 4.6,
    scoreCount: 25,
    trips: 19,
    onTimeRate: 94,
    validatedBy: 2,
    availableNote: "Livre agora",
    docs: { ...OK, seguro: 20 },
  },
  {
    profileId: "rede-5",
    name: "Gilvan Souza",
    vehicleKind: "Truck MB Atego",
    baseCity: "Nossa Senhora do Socorro/SE",
    score: 4.5,
    scoreCount: 18,
    trips: 14,
    onTimeRate: 92,
    validatedBy: 2,
    availableNote: "Livre sexta",
    docs: OK,
  },
  {
    profileId: "rede-6",
    name: "Jailson Barreto",
    vehicleKind: "Carreta Scania R450",
    baseCity: "Alagoinhas/BA",
    score: 4.4,
    scoreCount: 22,
    trips: 16,
    onTimeRate: 90,
    validatedBy: 1,
    availableNote: "Livre agora",
    docs: OK,
  },
];

export function demoNetwork(now = Date.now()): {
  drivers: NetworkDriver[];
  total: number;
  locked: boolean;
} {
  return {
    total: 142,
    locked: false,
    drivers: NETWORK.map(({ docs: spec, ...driver }) => {
      const documents = docs(spec, now);
      return {
        ...driver,
        initials: initialsOf(driver.name),
        documents,
        docState: worstDocState(
          documents.filter((d) => REQUIRED_DRIVER_DOCS.includes(d.kind)).map((d) => d.state),
        ),
      };
    }),
  };
}
