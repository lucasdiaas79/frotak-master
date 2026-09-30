import { supabase } from "@/lib/supabase";
import type { FuelRecord, FuelType } from "@/lib/types";

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

type FuelRecordRow = {
  id: string;
  fuel_document_id?: string | null;
  freight_id?: string | null;
  trip_cycle_id?: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  vehicle_plate: string;
  driver_name: string | null;
  station: string;
  fuel_type: FuelType;
  liters: number | string;
  amount: number | string;
  odometer: number | string;
  notes: string | null;
  invoice_file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string | null;
};

function optional(value?: string | null) {
  return value ?? undefined;
}

function toNumber(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function createInvoiceUrl(row: FuelRecordRow) {
  if (!row.storage_bucket || !row.storage_path) return undefined;
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, 60 * 60);
  if (error) return undefined;
  return data.signedUrl;
}

async function fuelRecordFromRow(row: FuelRecordRow): Promise<FuelRecord> {
  return {
    id: row.id,
    fuelDocumentId: optional(row.fuel_document_id),
    freightId: optional(row.freight_id),
    tripCycleId: optional(row.trip_cycle_id),
    vehicleId: optional(row.vehicle_id),
    driverId: optional(row.driver_id),
    vehiclePlate: row.vehicle_plate,
    driverName: optional(row.driver_name),
    station: row.station,
    fuelType: row.fuel_type,
    liters: toNumber(row.liters),
    amount: toNumber(row.amount),
    odometer: toNumber(row.odometer),
    notes: optional(row.notes),
    invoiceFileName: optional(row.invoice_file_name),
    storageBucket: optional(row.storage_bucket),
    storagePath: optional(row.storage_path),
    mimeType: optional(row.mime_type),
    sizeBytes: row.size_bytes == null ? undefined : toNumber(row.size_bytes),
    invoiceUrl: await createInvoiceUrl(row),
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: optional(row.updated_at),
  };
}

export async function listFuelRecords(): Promise<FuelRecord[]> {
  const { data, error } = await supabase
    .from("fuel_records")
    .select("*")
    .order("recorded_at", { ascending: false });

  if (error) throw error;
  return Promise.all(((data ?? []) as FuelRecordRow[]).map(fuelRecordFromRow));
}

export async function deleteFuelRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("fuel_records").delete().in("id", ids);
  if (error) throw error;
}

function cycleNumber(value: unknown) {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listTripFuelEfficiencyCycles(): Promise<TripFuelEfficiencyCycle[]> {
  const { data, error } = await supabase
    .from("driver_trip_cycles")
    .select(
      `
      id,
      vehicle_id,
      driver_id,
      status,
      started_at,
      closed_at,
      start_odometer,
      end_odometer,
      odometer_started_at,
      odometer_ended_at,
      freight_count,
      completed_freight_count,
      freights(
        id,
        trip_sequence,
        source_kind,
        lifecycle_status,
        started_at,
        completed_at,
        sender:senders(name),
        recipient:recipients(name)
      ),
      fuel_records(*)
    `,
    )
    .order("started_at", { ascending: false });

  if (error) throw error;

  return Promise.all(
    ((data ?? []) as any[]).map(async (row) => ({
      id: row.id,
      vehicleId: optional(row.vehicle_id),
      driverId: optional(row.driver_id),
      status: row.status,
      startedAt: row.started_at,
      closedAt: optional(row.closed_at),
      startOdometer: cycleNumber(row.start_odometer),
      endOdometer: cycleNumber(row.end_odometer),
      odometerStartedAt: optional(row.odometer_started_at),
      odometerEndedAt: optional(row.odometer_ended_at),
      freightCount: Number(row.freight_count ?? row.freights?.length ?? 0),
      completedFreightCount: Number(row.completed_freight_count ?? 0),
      freights: ((row.freights ?? []) as any[])
        .map((freight) => ({
          id: freight.id,
          sequence: cycleNumber(freight.trip_sequence),
          sourceKind: optional(freight.source_kind),
          lifecycleStatus: optional(freight.lifecycle_status),
          startedAt: optional(freight.started_at),
          completedAt: optional(freight.completed_at),
          senderName: optional(freight.sender?.name),
          recipientName: optional(freight.recipient?.name),
        }))
        .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999)),
      fuelRecords: await Promise.all(
        ((row.fuel_records ?? []) as FuelRecordRow[]).map(fuelRecordFromRow),
      ),
    })),
  );
}
