// Frotak Embarcador: tipos compartilhados entre servidor, telas e modo demonstracao.
// Nada aqui carrega valor de frete, custo, margem ou dado de outro cliente da transportadora.

import type { PublicFreightEvent, PublicFreightStep } from "@/lib/freightShare";

export type CarrierStatus = "convidada" | "ativa" | "recusada" | "pausada";

export interface ShipperProfile {
  shipperId: string;
  companyName: string;
  cnpj: string;
  userName: string;
  email: string;
  role: "admin" | "member";
  demo?: boolean;
}

export interface ShipperCarrier {
  id: string;
  name: string;
  cnpj?: string;
  status: CarrierStatus;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  invitedAt: string;
  respondedAt?: string;
  /** Link de convite: so existe logo apos criar ou renovar o convite. */
  inviteUrl?: string;
}

export interface ShipperDocument {
  id: string;
  kind: string;
  label: string;
  sentAt: string;
  isImage: boolean;
  isProof: boolean;
}

export interface ShipperFreight {
  id: string;
  carrierId: string;
  carrierName: string;
  code: string;
  plate: string;
  driverFirstName?: string;
  /** Cadastro unico do motorista na Frotak, quando a transportadora ligou o motorista a ele. */
  driverProfileId?: string;
  product?: string;
  originName?: string;
  origin?: string;
  destinationName?: string;
  destination?: string;
  /** Papel do embarcador neste frete. */
  role: "remetente" | "destinatario";
  step: PublicFreightStep;
  statusLabel: string;
  statusDetail?: string;
  occurrence?: string;
  finished: boolean;
  cancelled?: boolean;
  startedAt?: string;
  deliveredAt?: string;
  lastEventAt?: string;
  position?: { lat: number; lng: number; at?: string; place?: string };
  tracked: boolean;
  events: PublicFreightEvent[];
  documents: ShipperDocument[];
  /** Minutos parado no local de carregamento (chegada ate saida). */
  loadingDwellMin?: number;
  /** Minutos parado no local de entrega (chegada ate fim da descarga). */
  unloadingDwellMin?: number;
  dieselLiters?: number;
  co2Kg?: number;
}

export interface ShipperPortalData {
  profile: ShipperProfile;
  carriers: ShipperCarrier[];
  freights: ShipperFreight[];
  generatedAt: string;
}

export const PROOF_KINDS = new Set(["comprovante_descarga", "canhoto", "comprovante_entrega"]);

/** A lei do transporte de cargas preve estadia apos 5 horas de espera. */
export const DWELL_LIMIT_MIN = 5 * 60;

/** Fator de emissao do diesel (kg de CO2 por litro), referencia usual em inventarios. */
export const DIESEL_KG_CO2_PER_LITER = 2.6;

export const CARRIER_STATUS_LABELS: Record<CarrierStatus, string> = {
  convidada: "Convite enviado",
  ativa: "Conectada",
  recusada: "Recusou",
  pausada: "Compartilhamento pausado",
};

// ------------------------------------------------------------ Terceiros e Rede Frotak

export type DriverRelation = "frota" | "agregado" | "terceiro";
export type DriverDecision = "aprovado" | "em_revisao" | "bloqueado";
export type DriverDocKind = "cnh" | "rntrc" | "seguro" | "crlv" | "gr";
export type DocState = "ok" | "vencendo" | "vencido" | "faltando";

export interface DriverDocumentInfo {
  kind: DriverDocKind;
  label: string;
  numberHint?: string;
  expiresAt?: string;
  state: DocState;
  informedBy: "motorista" | "transportadora";
}

export interface DriverTripSummary {
  freightId: string;
  date?: string;
  route: string;
  carrierName: string;
  plate: string;
  finished: boolean;
  occurrence?: string;
  onTime?: boolean;
  myScore?: number;
}

export interface ShipperDriver {
  profileId: string;
  name: string;
  initials: string;
  relation: DriverRelation;
  plate?: string;
  vehicleKind?: string;
  baseCity?: string;
  /** Transportadoras conectadas por onde ele costuma vir (so as do embarcador). */
  carrierNames: string[];
  /** Nota media de todas as avaliacoes (embarcadores e transportadoras). */
  score?: number;
  scoreCount: number;
  tripsWithMe: number;
  onTimeRate?: number;
  occurrences: number;
  documents: DriverDocumentInfo[];
  docState: DocState;
  decision?: DriverDecision;
  decisionReason?: string;
  activeFreightIds: string[];
  trips: DriverTripSummary[];
  notes: Array<{ id: string; body: string; author?: string; at: string }>;
  inNetwork: boolean;
  /** Quantos embarcadores da rede aprovaram este motorista. */
  validatedBy: number;
}

export interface NetworkDriver {
  profileId: string;
  name: string;
  initials: string;
  vehicleKind?: string;
  baseCity?: string;
  score?: number;
  scoreCount: number;
  trips: number;
  onTimeRate?: number;
  docState: DocState;
  documents: DriverDocumentInfo[];
  validatedBy: number;
  availableFrom?: string;
  availableNote?: string;
}

export interface ShipperNetworkSettings {
  shareApproved: boolean;
  shareRatings: boolean;
  shareBlocks: boolean;
}

export interface ShipperThirdPartyData {
  drivers: ShipperDriver[];
  settings: ShipperNetworkSettings;
}

export const DRIVER_DOC_LABELS: Record<DriverDocKind, string> = {
  cnh: "CNH",
  rntrc: "RNTRC (ANTT)",
  seguro: "Seguro RCTR-C",
  crlv: "CRLV do veículo",
  gr: "Gerenciadora de risco",
};

export const REQUIRED_DRIVER_DOCS: DriverDocKind[] = ["cnh", "rntrc", "seguro"];

export const DRIVER_RELATION_LABELS: Record<DriverRelation, string> = {
  frota: "Frota própria",
  agregado: "Agregado",
  terceiro: "Terceiro",
};

export const DRIVER_DECISION_LABELS: Record<DriverDecision, string> = {
  aprovado: "Aprovado",
  em_revisao: "Em revisão",
  bloqueado: "Bloqueado",
};

/** Documento vencendo: faltam ate 30 dias. */
export const DOC_WARNING_DAYS = 30;

export function docStateFor(expiresAt: string | undefined, now = Date.now()): DocState {
  if (!expiresAt) return "faltando";
  const end = new Date(`${expiresAt.slice(0, 10)}T23:59:59`).getTime();
  if (end < now) return "vencido";
  if (end - now <= DOC_WARNING_DAYS * 86_400_000) return "vencendo";
  return "ok";
}

export function worstDocState(states: DocState[]): DocState {
  const order: DocState[] = ["vencido", "faltando", "vencendo", "ok"];
  return order.find((state) => states.includes(state)) ?? "faltando";
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}
