import type {
  Driver,
  FleetEvent,
  FleetEventSource,
  Recipient,
  Product,
  Sender,
  Trailer,
  Vehicle,
  VehicleSituation,
  VehicleStatus,
} from "@/lib/types";

const nil = <T>(value: T | null | undefined) => value ?? undefined;

interface VehicleRow {
  id: string;
  current_freight_id?: string | null;
  workflow_version?: number | string | null;
  workflow_flags?: {
    pending_documents?: Array<"nota_fiscal" | "cte_mdfe">;
    last_manual_override?: {
      id?: string;
      target_code?: string;
      reason?: string;
      information_source?: string;
      occurred_at?: string;
      recorded_at?: string;
      created_by?: string;
    };
  } | null;
  last_transition_source?: string | null;
  last_transition_by?: string | null;
  last_transition_at?: string | null;
  plate: string;
  type: string;
  fleet_seq?: number | null;
  fleet_kind?: string | null;
  brand?: string | null;
  model?: string | null;
  manufacture_year?: number | null;
  renavam?: string | null;
  status: VehicleStatus;
  vehicle_situation?: VehicleSituation | null;
  freight_stage?: Vehicle["freightStage"] | null;
  driver_id?: string | null;
  trailer_id?: string | null;
  vehicle_trailers?: {
    trailer_id?: string | null;
    position?: number | null;
    active?: boolean | null;
  }[];
  sender_id?: string | null;
  recipient_id?: string | null;
  product_id?: string | null;
  freight_value?: number | string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  sascar_id?: string | null;
  last_position_at?: string | null;
  updated_at: string;
  created_at?: string;
}

interface DriverRow {
  id: string;
  auth_user_id?: string | null;
  name: string;
  phone?: string | null;
  cnh?: string | null;
  fleet_seq?: number | null;
  partner_role?: string | null;
  active: boolean;
  vehicle_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface TrailerRow {
  id: string;
  identifier: string;
  type: string;
  fleet_seq?: number | null;
  fleet_kind?: string | null;
  brand?: string | null;
  model?: string | null;
  manufacture_year?: number | null;
  renavam?: string | null;
  implement_type?: string | null;
  implement_model?: string | null;
  vehicle_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface PartyRow {
  id: string;
  name: string;
  cnpj?: string | null;
  city?: string | null;
  state?: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ProductRow {
  id: string;
  name: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface FleetEventRow {
  id: string;
  vehicle_id: string;
  freight_id?: string | null;
  status: VehicleStatus;
  freight_stage?: Vehicle["freightStage"] | null;
  city?: string | null;
  state?: string | null;
  source: FleetEventSource;
  description?: string | null;
  created_by?: string | null;
  event_type?: string | null;
  action_origin?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
}

export function vehicleFromRow(row: VehicleRow): Vehicle {
  const trailerIds =
    row.vehicle_trailers
      ?.filter((link) => link.active !== false && link.trailer_id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((link) => link.trailer_id!)
      .filter(Boolean) ?? [];
  const legacyTrailerId = nil(row.trailer_id);
  return {
    id: row.id,
    currentFreightId: nil(row.current_freight_id),
    workflowVersion: Number(row.workflow_version ?? 0),
    workflowFlags: {
      pendingDocuments: row.workflow_flags?.pending_documents ?? [],
      lastManualOverride: row.workflow_flags?.last_manual_override
        ? {
            id: row.workflow_flags.last_manual_override.id,
            targetCode: row.workflow_flags.last_manual_override.target_code,
            reason: row.workflow_flags.last_manual_override.reason,
            informationSource: row.workflow_flags.last_manual_override.information_source,
            occurredAt: row.workflow_flags.last_manual_override.occurred_at,
            recordedAt: row.workflow_flags.last_manual_override.recorded_at,
            createdBy: row.workflow_flags.last_manual_override.created_by,
          }
        : undefined,
    },
    lastTransitionSource: nil(row.last_transition_source),
    lastTransitionBy: nil(row.last_transition_by),
    lastTransitionAt: nil(row.last_transition_at),
    plate: row.plate,
    type: row.type,
    fleetSeq: nil(row.fleet_seq),
    fleetKind: nil(row.fleet_kind),
    brand: nil(row.brand),
    model: nil(row.model),
    manufactureYear: nil(row.manufacture_year),
    renavam: nil(row.renavam),
    status: row.status,
    situation: row.vehicle_situation ?? "parado",
    freightStage: nil(row.freight_stage),
    driverId: nil(row.driver_id),
    trailerId: trailerIds[0] ?? legacyTrailerId,
    trailerIds: trailerIds.length ? trailerIds : legacyTrailerId ? [legacyTrailerId] : [],
    senderId: nil(row.sender_id),
    recipientId: nil(row.recipient_id),
    productId: nil(row.product_id),
    freightValue: nil(row.freight_value == null ? undefined : Number(row.freight_value)),
    city: row.city ?? "",
    state: row.state ?? "",
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
    sascarId: nil(row.sascar_id),
    lastPositionAt: nil(row.last_position_at),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export function vehicleToRow(vehicle: Partial<Vehicle>) {
  return {
    id: vehicle.id || undefined,
    current_freight_id: vehicle.currentFreightId ?? null,
    workflow_version: vehicle.workflowVersion ?? 0,
    workflow_flags: {
      pending_documents: vehicle.workflowFlags?.pendingDocuments ?? [],
      last_manual_override: vehicle.workflowFlags?.lastManualOverride
        ? {
            id: vehicle.workflowFlags.lastManualOverride.id,
            target_code: vehicle.workflowFlags.lastManualOverride.targetCode,
            reason: vehicle.workflowFlags.lastManualOverride.reason,
            information_source: vehicle.workflowFlags.lastManualOverride.informationSource,
            occurred_at: vehicle.workflowFlags.lastManualOverride.occurredAt,
            recorded_at: vehicle.workflowFlags.lastManualOverride.recordedAt,
            created_by: vehicle.workflowFlags.lastManualOverride.createdBy,
          }
        : undefined,
    },
    last_transition_source: vehicle.lastTransitionSource ?? null,
    last_transition_by: vehicle.lastTransitionBy ?? null,
    last_transition_at: vehicle.lastTransitionAt ?? null,
    plate: vehicle.plate,
    type: vehicle.type,
    fleet_seq: vehicle.fleetSeq ?? null,
    fleet_kind: vehicle.fleetKind ?? null,
    brand: vehicle.brand ?? null,
    model: vehicle.model ?? null,
    manufacture_year: vehicle.manufactureYear ?? null,
    renavam: vehicle.renavam ?? null,
    status: vehicle.status,
    vehicle_situation: vehicle.situation ?? "parado",
    freight_stage: vehicle.freightStage ?? null,
    driver_id: vehicle.driverId ?? null,
    trailer_id: vehicle.trailerId ?? null,
    sender_id: vehicle.senderId ?? null,
    recipient_id: vehicle.recipientId ?? null,
    product_id: vehicle.productId ?? null,
    freight_value: vehicle.freightValue ?? null,
    city: vehicle.city ?? null,
    state: vehicle.state ?? null,
    lat: vehicle.lat ?? null,
    lng: vehicle.lng ?? null,
    sascar_id: vehicle.sascarId ?? null,
  };
}

export function driverFromRow(row: DriverRow): Driver {
  return {
    id: row.id,
    authUserId: nil(row.auth_user_id),
    name: row.name,
    phone: row.phone ?? "",
    cnh: row.cnh ?? "",
    fleetSeq: nil(row.fleet_seq),
    partnerRole: nil(row.partner_role),
    active: row.active,
    vehicleId: nil(row.vehicle_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function driverToRow(driver: Partial<Driver>) {
  return {
    id: driver.id || undefined,
    auth_user_id: driver.authUserId ?? null,
    name: driver.name,
    phone: driver.phone ?? null,
    cnh: driver.cnh ?? null,
    fleet_seq: driver.fleetSeq ?? null,
    partner_role: driver.partnerRole ?? null,
    active: driver.active ?? true,
    vehicle_id: driver.vehicleId ?? null,
  };
}

export function trailerFromRow(row: TrailerRow): Trailer {
  return {
    id: row.id,
    identifier: row.identifier,
    type: row.type,
    fleetSeq: nil(row.fleet_seq),
    fleetKind: nil(row.fleet_kind),
    brand: nil(row.brand),
    model: nil(row.model),
    manufactureYear: nil(row.manufacture_year),
    renavam: nil(row.renavam),
    implementType: nil(row.implement_type),
    implementModel: nil(row.implement_model),
    vehicleId: nil(row.vehicle_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function trailerToRow(trailer: Partial<Trailer>) {
  return {
    id: trailer.id || undefined,
    identifier: trailer.identifier,
    type: trailer.type,
    fleet_seq: trailer.fleetSeq ?? null,
    fleet_kind: trailer.fleetKind ?? null,
    brand: trailer.brand ?? null,
    model: trailer.model ?? null,
    manufacture_year: trailer.manufactureYear ?? null,
    renavam: trailer.renavam ?? null,
    implement_type: trailer.implementType ?? null,
    implement_model: trailer.implementModel ?? null,
    vehicle_id: trailer.vehicleId ?? null,
  };
}

export function senderFromRow(row: PartyRow): Sender {
  return {
    id: row.id,
    name: row.name,
    cnpj: row.cnpj ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function senderToRow(sender: Partial<Sender>) {
  return {
    id: sender.id || undefined,
    name: sender.name,
    cnpj: sender.cnpj ?? null,
    city: sender.city ?? null,
    state: sender.state ?? null,
    active: sender.active ?? true,
  };
}

export const recipientFromRow = senderFromRow as (row: PartyRow) => Recipient;
export const recipientToRow = senderToRow as (
  recipient: Partial<Recipient>,
) => ReturnType<typeof senderToRow>;

export function productFromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function productToRow(product: Partial<Product>) {
  return {
    id: product.id || undefined,
    name: product.name,
    active: product.active ?? true,
  };
}

export function fleetEventFromRow(row: FleetEventRow): FleetEvent {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    freightId: nil(row.freight_id),
    status: row.status,
    freightStage: nil(row.freight_stage),
    city: row.city ?? "",
    state: row.state ?? "",
    source: row.source,
    description: nil(row.description),
    createdBy: nil(row.created_by),
    eventType: nil(row.event_type),
    actionOrigin: nil(row.action_origin),
    metadata: row.metadata ?? {},
    timestamp: row.timestamp,
  };
}
