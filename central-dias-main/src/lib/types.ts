export type VehicleStatus =
  | "disponivel-patio"
  | "disponivel-oficina"
  | "aguardando-motorista"
  | "rota-carregar"
  | "rota-descarregar"
  | "rota-retornando"
  | "parado-aguardando-carga"
  | "aguardando-cte"
  | "aguardando-confirmacao"
  | "parado-aguardando-comando"
  | "parado-descarregando"
  | "parado-quebrado"
  | "manutencao";

export type VehicleSituation =
  | "disponivel-patio"
  | "disponivel-oficina"
  | "em-rota"
  | "parado"
  | "quebrado"
  | "manutencao";

export type VehicleFreightStage =
  | "DISPONIVEL"
  | "EM_ROTA_CARREGAR"
  | "AGUARDANDO_NOTA"
  | "NOTA_EM_CONFERENCIA"
  | "NOTA_APROVADA_AG_CTE"
  | "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA"
  | "EM_ROTA_ENTREGA"
  | "ENTREGUE_AG_FINALIZACAO"
  | "ENTREGA_FINALIZADA";

export interface Vehicle {
  id: string;
  currentFreightId?: string;
  workflowVersion: number;
  workflowFlags: VehicleWorkflowFlags;
  lastTransitionSource?: string;
  lastTransitionBy?: string;
  lastTransitionAt?: string;
  plate: string;
  type: string;
  fleetSeq?: number;
  fleetKind?: string;
  brand?: string;
  model?: string;
  manufactureYear?: number;
  renavam?: string;
  status: VehicleStatus;
  situation: VehicleSituation;
  freightStage?: VehicleFreightStage;
  driverId?: string;
  trailerId?: string;
  trailerIds?: string[];
  senderId?: string;
  recipientId?: string;
  productId?: string;
  freightValue?: number;
  city: string;
  state: string;
  lat: number;
  lng: number;
  sascarId?: string;
  lastPositionAt?: string;
  updatedAt: string;
  createdAt?: string;
}

export interface VehicleWorkflowFlags {
  pendingDocuments?: Array<"nota_fiscal" | "cte_mdfe">;
  lastManualOverride?: {
    id?: string;
    targetCode?: string;
    reason?: string;
    informationSource?: string;
    occurredAt?: string;
    recordedAt?: string;
    createdBy?: string;
  };
}

export interface Driver {
  id: string;
  authUserId?: string;
  name: string;
  phone: string;
  cnh: string;
  fleetSeq?: number;
  partnerRole?: string;
  active: boolean;
  vehicleId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Trailer {
  id: string;
  identifier: string;
  type: string;
  fleetSeq?: number;
  fleetKind?: string;
  brand?: string;
  model?: string;
  manufactureYear?: number;
  renavam?: string;
  implementType?: string;
  implementModel?: string;
  vehicleId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  "disponivel-patio": "Disponível no pátio",
  "disponivel-oficina": "Disponível na oficina",
  "aguardando-motorista": "Aguardando motorista",
  "rota-carregar": "Em rota indo carregar",
  "rota-descarregar": "Em rota indo descarregar",
  "rota-retornando": "Retornando",
  "parado-aguardando-carga": "Parado esperando carga",
  "aguardando-cte": "Aguardando CT-e",
  "aguardando-confirmacao": "Aguardando Confirmação",
  "parado-aguardando-comando": "Parado aguardando comando",
  "parado-descarregando": "Parado esperando descarga",
  "parado-quebrado": "Parado / quebrado",
  manutencao: "Em manutenção",
};

export const VEHICLE_STATUS_SHORT = {
  "disponivel-patio": "Pátio",
  "disponivel-oficina": "Oficina",
  "rota-carregar": "Rota → carga",
  "rota-descarregar": "Rota → descarga",
  "rota-retornando": "Retornando",
  "parado-aguardando-carga": "Esperando carga",
  "aguardando-cte": "Aguardando CT-e",
  "aguardando-confirmacao": "Aguardando conf.",
  "parado-aguardando-comando": "Aguardando cmd.",
  "parado-descarregando": "Esperando descarga",
  "parado-quebrado": "Quebrado",
  manutencao: "Manutenção",
} as Record<VehicleStatus, string>;

export const ALL_STATUSES: VehicleStatus[] = [
  "disponivel-patio",
  "disponivel-oficina",
  "aguardando-motorista",
  "rota-carregar",
  "rota-descarregar",
  "rota-retornando",
  "parado-aguardando-carga",
  "aguardando-cte",
  "aguardando-confirmacao",
  "parado-aguardando-comando",
  "parado-descarregando",
  "parado-quebrado",
  "manutencao",
];

export const VEHICLE_SITUATION_LABEL: Record<VehicleSituation, string> = {
  "disponivel-patio": "Disponível no pátio",
  "disponivel-oficina": "Disponível na oficina",
  "em-rota": "Em rota",
  parado: "Parado",
  quebrado: "Quebrado",
  manutencao: "Manutenção",
};

export const VEHICLE_SITUATION_SHORT: Record<VehicleSituation, string> = {
  "disponivel-patio": "Pátio",
  "disponivel-oficina": "Oficina",
  "em-rota": "Em rota",
  parado: "Parado",
  quebrado: "Quebrado",
  manutencao: "Manutenção",
};

export const ALL_SITUATIONS: VehicleSituation[] = [
  "disponivel-patio",
  "disponivel-oficina",
  "em-rota",
  "parado",
  "quebrado",
  "manutencao",
];

export const AVAILABLE_VEHICLE_SITUATIONS: VehicleSituation[] = [
  "disponivel-patio",
  "disponivel-oficina",
];

export function isAvailableVehicleSituation(situation: VehicleSituation) {
  return situation === "disponivel-patio" || situation === "disponivel-oficina";
}

export function isAvailableVehicleStatus(status: VehicleStatus) {
  return (
    status === "disponivel-patio" ||
    status === "disponivel-oficina" ||
    status === "aguardando-motorista"
  );
}

export type StatusGroup = "operacao" | "parado" | "manutencao";

export function statusGroup(s: VehicleStatus): StatusGroup {
  if (s === "disponivel-oficina") return "manutencao";
  if (s.startsWith("rota")) return "operacao";
  if (s === "manutencao") return "manutencao";
  return "parado";
}

export type StatusTone = "success" | "warning" | "muted" | "destructive";

export function statusTone(s: VehicleStatus): StatusTone {
  if (s === "disponivel-patio") return "success";
  if (s.startsWith("rota")) return "success";
  if (s === "parado-quebrado") return "destructive";
  if (
    s === "parado-aguardando-carga" ||
    s === "parado-descarregando" ||
    s === "aguardando-cte" ||
    s === "aguardando-confirmacao"
  )
    return "warning";
  return "muted";
}

export const STATUS_HEX: Record<VehicleStatus, string> = {
  "disponivel-patio": "#2563eb",
  "disponivel-oficina": "#525252",
  "aguardando-motorista": "#0ea5e9",
  "rota-carregar": "#16a34a",
  "rota-descarregar": "#22c55e",
  "rota-retornando": "#15803d",
  "parado-aguardando-carga": "#f97316",
  "aguardando-cte": "#dc2626",
  "aguardando-confirmacao": "#dc2626",
  "parado-aguardando-comando": "#dc2626",
  "parado-descarregando": "#f97316",
  "parado-quebrado": "#dc2626",
  manutencao: "#525252",
};

export const TRAILER_TYPES = ["IMPLEMENTO"];
export const VEHICLE_TYPES = ["CAVALO TRATOR", "Truck", "Toco", "VUC", "Bitrem"];
export const UFS = ["SE", "BA", "AL", "SP", "MG", "PR", "RJ", "RS", "SC", "GO", "PE", "ES"];

export interface Sender {
  id: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  address?: string;
  locationLabel?: string;
  locationSource?: "geocoded" | "manual";
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Recipient {
  id: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  address?: string;
  locationLabel?: string;
  locationSource?: "geocoded" | "manual";
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type FleetEventSource = "Telemetria" | "Motorista" | "Operador" | "Sistema" | "Manutenção";

export interface FleetEvent {
  id: string;
  vehicleId: string;
  freightId?: string;
  status: VehicleStatus;
  freightStage?: VehicleFreightStage;
  city: string;
  state: string;
  source: FleetEventSource;
  description?: string;
  createdBy?: string;
  eventType?: string;
  actionOrigin?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export type FreightDocumentKind =
  | "nota_fiscal"
  | "cte"
  | "cte_mdfe"
  | "comprovante_descarga"
  | "balanca"
  | "recibo"
  | "canhoto"
  | "comprovante_entrega";

export interface FreightDocument {
  id: string;
  vehicleId: string;
  freightId?: string;
  driverId?: string;
  kind: FreightDocumentKind;
  source: "motorista_app" | "gestao_central" | "sistema";
  fileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  status: string;
  url?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FreightHistory {
  id: string;
  freightId?: string;
  vehicleId?: string;
  driverId?: string;
  trailerId?: string;
  senderId?: string;
  recipientId?: string;
  productId?: string;
  vehiclePlate: string;
  driverName?: string;
  trailerIdentifier?: string;
  senderName?: string;
  senderCity?: string;
  senderState?: string;
  recipientName?: string;
  recipientCity?: string;
  recipientState?: string;
  productName?: string;
  freightValue?: number;
  startedAt?: string;
  finishedAt: string;
  finishReason: string;
  finalStatus?: VehicleStatus;
  finalFreightStage?: VehicleFreightStage;
  events: Array<Record<string, unknown>>;
  stageTimeline: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt?: string;
}

export type FreightExpenseCategory =
  | "diesel_s10"
  | "arla"
  | "pedagio"
  | "alimentacao"
  | "estacionamento"
  | "manutencao"
  | "outros";

export const FREIGHT_EXPENSE_CATEGORY_LABEL: Record<FreightExpenseCategory, string> = {
  diesel_s10: "Diesel S10",
  arla: "Arla",
  pedagio: "Pedagio",
  alimentacao: "Alimentacao",
  estacionamento: "Estacionamento",
  manutencao: "Manutencao",
  outros: "Outros",
};

export interface FreightExpense {
  id: string;
  tenantId?: string;
  freightId: string;
  vehicleId?: string;
  driverId?: string;
  fuelRecordId?: string;
  category: FreightExpenseCategory;
  description: string;
  amount: number;
  notes?: string;
  source: "driver_app" | "operator" | "system";
  recordedBy?: string;
  recordedAt: string;
  createdAt: string;
  updatedAt?: string;
}

export type FuelType = "diesel_s10" | "arla";

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  diesel_s10: "Diesel S10",
  arla: "Arla",
};

export interface FuelRecord {
  id: string;
  vehicleId?: string;
  driverId?: string;
  vehiclePlate: string;
  driverName?: string;
  station: string;
  fuelType: FuelType;
  liters: number;
  amount: number;
  odometer: number;
  notes?: string;
  invoiceFileName?: string;
  storageBucket?: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  invoiceUrl?: string;
  recordedAt: string;
  createdAt: string;
  updatedAt?: string;
}

export type UserRole = "admin" | "operador" | "gestor";

export interface Profile {
  id: string;
  tenantId: string;
  workspaceId?: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  isOwner?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
