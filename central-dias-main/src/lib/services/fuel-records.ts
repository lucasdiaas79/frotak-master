import { supabase } from "@/lib/supabase";
import type { FuelRecord, FuelType } from "@/lib/types";

type FuelRecordRow = {
  id: string;
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
