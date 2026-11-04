// Portas da Gestao de Frota. Os servicos Supabase em infrastructure/ as implementam;
// o store e as telas chegam a elas pelo container.
import type {
  Driver,
  FleetEvent,
  FleetEventSource,
  FreightDocument,
  FreightDocumentKind,
  FreightExpense,
  FreightHistory,
  FreightPaymentType,
  FreightPricingMode,
  FuelRecord,
  Product,
  Recipient,
  Sender,
  Trailer,
  Vehicle,
  VehicleFreightStage,
  VehicleStatus,
} from "@/lib/types";
import type {
  DailyAllowanceSettings,
  DailyAllowanceStatus,
  DriverDailyAllowance,
  FleetEventRecordInput,
  FreightCostMovement,
  LegacyPartnerLink,
  LongTripFreightSegmentInput,
  LongTripFreightsResult,
  LongTripHistory,
  ManualFreightMoveInput,
  RegisterVehiclePositionInput,
  TripFuelEfficiencyCycle,
} from "@/modules/fleet-core/domain/fleetOperations";

/** Cadastros e situacao da frota: veiculos, motoristas, reboques, remetentes, destinatarios, produtos e eventos. */
export interface FleetRepository {
  listVehicles(): Promise<Vehicle[]>;
  upsertVehicle(vehicle: Vehicle): Promise<Vehicle>;
  deleteVehicle(id: string): Promise<void>;
  updateVehicleStatus(
    id: string,
    status: VehicleStatus,
    source?: FleetEventSource,
    description?: string,
    freightStage?: VehicleFreightStage,
  ): Promise<Vehicle>;
  linkVehicle(input: {
    vehicleId: string;
    driverId?: string;
    trailerId?: string;
    trailerIds?: string[];
    senderId?: string;
    recipientId?: string;
    productId?: string;
    freightValue?: number;
    freightPricingMode?: FreightPricingMode;
    freightTonPrice?: number;
    freightPaymentType?: FreightPaymentType;
    paymentTermDays?: number | null;
  }): Promise<Vehicle>;
  archiveVehicleFreight(vehicleId: string, reason?: string): Promise<string | null>;
  listDrivers(): Promise<Driver[]>;
  upsertDriver(driver: Driver): Promise<Driver>;
  deleteDriver(id: string): Promise<void>;
  listTrailers(): Promise<Trailer[]>;
  upsertTrailer(trailer: Trailer): Promise<Trailer>;
  deleteTrailer(id: string): Promise<void>;
  listSenders(): Promise<Sender[]>;
  upsertSender(sender: Sender): Promise<Sender>;
  deleteSender(id: string): Promise<void>;
  listRecipients(): Promise<Recipient[]>;
  upsertRecipient(recipient: Recipient): Promise<Recipient>;
  deleteRecipient(id: string): Promise<void>;
  listProducts(): Promise<Product[]>;
  upsertProduct(product: Product): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  listFleetEvents(limit?: number): Promise<FleetEvent[]>;
}

/** Abastecimentos e eficiencia por ciclo de viagem. */
export interface FuelRecordsPort {
  listFuelRecords(): Promise<FuelRecord[]>;
  deleteFuelRecords(ids: string[]): Promise<void>;
  listTripFuelEfficiencyCycles(): Promise<TripFuelEfficiencyCycle[]>;
}

/** Historico de fretes e de viagens longas. */
export interface FreightHistoryPort {
  listFreightHistory(): Promise<FreightHistory[]>;
  listLongTripHistory(): Promise<LongTripHistory[]>;
  deleteFreightHistory(ids: string[]): Promise<void>;
}

/** Documentos do frete (nota, CT-e, comprovantes). */
export interface FreightDocumentsPort {
  listFreightDocuments(
    refs: Array<{ vehicleId: string; freightId?: string }>,
  ): Promise<FreightDocument[]>;
  uploadFreightDocument(input: {
    vehicleId: string;
    freightId?: string;
    driverId?: string;
    kind: FreightDocumentKind;
    file: File;
    source: FreightDocument["source"];
    status?: string;
  }): Promise<FreightDocument>;
  updateFreightDocumentStatus(id: string, status: string): Promise<FreightDocument>;
}

/** Despesas lancadas nos fretes. */
export interface FreightExpensesPort {
  listFreightExpenses(): Promise<FreightExpense[]>;
}

/** Movimentacao manual de cards no kanban de fretes. */
export interface ManualKanbanPort {
  manualMoveFreightCard(input: ManualFreightMoveInput): Promise<Vehicle>;
}

/** Diarias de viagem longa do motorista. */
export interface DailyAllowancesPort {
  getDailyAllowanceSettings(workspaceId: string): Promise<DailyAllowanceSettings>;
  saveDailyAllowanceSettings(input: {
    workspaceId: string;
    enabled: boolean;
    dailyAmount: number;
    paymentDueDays: number;
  }): Promise<DailyAllowanceSettings>;
  listDriverDailyAllowances(workspaceId: string): Promise<DriverDailyAllowance[]>;
  reviewDriverDailyAllowance(input: {
    allowanceId: string;
    action: "approve" | "reject";
    notes?: string;
  }): Promise<{ id: string; status: DailyAllowanceStatus; financialDocumentId?: string }>;
}

/** Registro manual de posicao do veiculo. */
export interface VehiclePositionsPort {
  registerVehiclePosition(input: RegisterVehiclePositionInput): Promise<void>;
}

export type FleetDomain =
  "vehicles" | "drivers" | "trailers" | "senders" | "recipients" | "products" | "events";

export interface FleetSnapshot {
  vehicles: Vehicle[];
  drivers: Driver[];
  trailers: Trailer[];
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  events: FleetEvent[];
}

/**
 * Mudanca recebida em tempo real, ja filtrada pelo tenant. O adaptador entrega uma funcao
 * que monta o objeto de dominio; se a conversao falhar, o store recarrega o dominio.
 */
export type FleetChange =
  | { type: "deleted"; domain: FleetDomain; id: string; eventType: string }
  | {
      type: "saved";
      domain: Exclude<FleetDomain, "vehicles" | "events">;
      id: string;
      eventType: string;
      toItem: () => Driver | Trailer | Sender | Recipient | Product;
    }
  | { type: "eventSaved"; id: string; eventType: string; toEvent: () => FleetEvent }
  | {
      type: "vehicleSaved";
      id: string;
      eventType: string;
      /** Os reboques vem de outra tabela: o store informa os que o veiculo ja tem. */
      toVehicle: (currentTrailerIds?: string[]) => Vehicle;
    }
  | {
      type: "position";
      vehicleId: string;
      eventType: string;
      lat?: number;
      lng?: number;
      city?: string;
      state?: string;
      recordedAt?: string;
    }
  /** Tabela relacionada mudou (reboques, documentos, fretes...): recarregar o dominio. */
  | { type: "stale"; domain: FleetDomain };

export interface FleetChangeStatus {
  ready: boolean;
  /** Conectou de novo depois de ja ter conectado uma vez. */
  reconnected: boolean;
  lost: boolean;
}

export interface FleetChangeFeed {
  watch(
    tenantId: string,
    handlers: {
      onChange(change: FleetChange): void;
      onStatus(status: FleetChangeStatus): void;
    },
  ): () => void;
}

/** Copia local da frota (modo sem backend). */
export interface LocalFleetStore {
  load(tenantId: string): FleetSnapshot;
  save(tenantId: string, snapshot: FleetSnapshot): void;
  nextId(prefix: string): string;
}

export interface TenantSession {
  activeTenantId(): string;
  /** true quando o app roda com a frota local, sem Supabase. */
  usesLocalData(): boolean;
}

export interface LongTripFreightsPort {
  createLongTripFreightsOperation(input: {
    vehicleId: string;
    driverId: string;
    segments: LongTripFreightSegmentInput[];
  }): Promise<LongTripFreightsResult>;
}

/** Entradas e despesas de caixa de viagem recentes, para o painel. */
export interface TripCostsReader {
  listRecentMovements(
    tenantId: string,
    since: Date,
  ): Promise<{ entries: FreightCostMovement[]; expenses: FreightCostMovement[] }>;
  watch(onChange: () => void): () => void;
}

/** Dados de apoio da central de fretes. */
export interface FleetSupportPort {
  listLegacyPartnerLinks(): Promise<LegacyPartnerLink[]>;
  getWorkspaceTenantSettings(workspaceId: string): Promise<unknown>;
  /** Registro informativo: falha nao interrompe a operacao. */
  recordFleetEvent(input: FleetEventRecordInput): Promise<void>;
}
