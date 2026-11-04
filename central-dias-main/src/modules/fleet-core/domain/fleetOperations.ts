// Tipos das operacoes da frota que as portas e as telas compartilham (antes declarados
// nos servicos Supabase). Sem dependencia de banco.
import type {
  FreightPaymentType,
  FreightPricingMode,
  FuelRecord,
  Vehicle,
  VehicleFreightStage,
  VehicleStatus,
} from "@/lib/types";
import type { ManualTargetCode } from "@/modules/fleet-core/domain/freightKanban";

// daily-allowances
export type DailyAllowanceStatus = "submitted" | "approved" | "rejected" | "cancelled";

// daily-allowances
export interface DailyAllowanceSettings {
  workspaceId: string;
  tenantId: string;
  available: boolean;
  enabled: boolean;
  dailyAmount: number;
  paymentDueDays: number;
}

// daily-allowances
export interface DriverDailyAllowance {
  id: string;
  tripCycleId: string;
  driverId: string;
  driverName: string;
  vehicleId?: string;
  vehiclePlate: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  status: DailyAllowanceStatus;
  notes?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewNotes?: string;
  financialDocumentId?: string;
  tripStartedAt: string;
  tripClosedAt?: string;
  freightCount: number;
}

// freight-history
export interface LongTripHistoryMovement {
  id: string;
  type: "entry" | "expense";
  label: string;
  amount: number;
  notes?: string;
  recordedAt: string;
}

// freight-history
export interface LongTripHistory {
  id: string;
  driverId: string;
  driverName: string;
  vehicleId?: string;
  vehiclePlate: string;
  trailerIdentifier?: string;
  startedAt: string;
  closedAt: string;
  closeReason?: string;
  totalEntries: number;
  totalExpenses: number;
  closingBalance: number;
  freightCount: number;
  completedFreightCount: number;
  dailyAllowance?: {
    quantity: number;
    unitAmount: number;
    totalAmount: number;
    status: "submitted" | "approved" | "rejected" | "cancelled";
  };
  movements: LongTripHistoryMovement[];
}

// fuel-records
export type TripFuelEfficiencyFreight = {
  id: string;
  sequence?: number | null;
  sourceKind?: string | null;
  lifecycleStatus?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  senderName?: string | null;
  recipientName?: string | null;
};

// fuel-records
export type TripFuelEfficiencyCycle = {
  id: string;
  vehicleId?: string | null;
  driverId?: string | null;
  status: string;
  startedAt: string;
  closedAt?: string | null;
  startOdometer?: number | null;
  endOdometer?: number | null;
  odometerStartedAt?: string | null;
  odometerEndedAt?: string | null;
  freightCount: number;
  completedFreightCount: number;
  freights: TripFuelEfficiencyFreight[];
  fuelRecords: FuelRecord[];
};

// manual-kanban
export interface ManualFreightMoveInput {
  vehicle: Vehicle;
  targetCode: ManualTargetCode;
  reason: string;
  informationSource: string;
  occurredAt: string;
  observation?: string;
  confirmDocuments: boolean;
}

// positions
export interface RegisterVehiclePositionInput {
  vehicleId: string;
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  speed?: number;
  direction?: number;
  source?: string;
  rawPayload?: unknown;
}

// custos de viagem (Dashboard)
export interface FreightCostMovement {
  id: string;
  vehicleId?: string | null;
  driverId?: string | null;
  freightId?: string | null;
  tripCycleId?: string | null;
  amount: number;
  recordedAt: string;
}

// vinculo entre cadastros antigos (remetente/destinatario) e parceiros financeiros
export interface LegacyPartnerLink {
  legacy_table: "senders" | "recipients";
  legacy_id: string;
  partner_id: string;
}

// tiro longo: varios fretes num ciclo de viagem
export interface LongTripFreightSegmentInput {
  trailerId?: string;
  senderId: string;
  recipientId: string;
  productId: string;
  freightValue?: number;
  freightPricingMode?: FreightPricingMode;
  freightTonPrice?: number;
  freightPaymentType: FreightPaymentType;
  paymentTermDays?: number | null;
  observations?: string;
}

export interface LongTripFreightsResult {
  tripCycleId: string;
  createdFreightIds: string[];
  startedNow: boolean;
  segmentCount: number;
}

// evento operacional registrado pela central (ex.: nota rejeitada)
export interface FleetEventRecordInput {
  vehicleId: string;
  freightId: string | null;
  status: VehicleStatus;
  freightStage: VehicleFreightStage;
  city: string;
  state: string;
  source: string;
  description: string;
  eventType: string;
  actionOrigin: string;
  metadata: Record<string, unknown>;
}

// conflito de versao ao mover card (outro operador mexeu antes)
export class WorkflowConflictError extends Error {
  constructor(message = "O card foi atualizado. Recarregue a tela e tente novamente.") {
    super(message);
    this.name = "WorkflowConflictError";
  }
}
