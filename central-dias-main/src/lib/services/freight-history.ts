import { supabase } from "@/lib/supabase";
import type { FreightHistory, VehicleFreightStage, VehicleStatus } from "@/lib/types";

type FreightHistoryRow = {
  id: string;
  freight_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  trailer_id: string | null;
  sender_id: string | null;
  recipient_id: string | null;
  product_id: string | null;
  vehicle_plate: string;
  driver_name: string | null;
  trailer_identifier: string | null;
  sender_name: string | null;
  sender_city: string | null;
  sender_state: string | null;
  recipient_name: string | null;
  recipient_city: string | null;
  recipient_state: string | null;
  product_name: string | null;
  freight_value: number | string | null;
  started_at: string | null;
  finished_at: string;
  finish_reason: string;
  final_status: VehicleStatus | null;
  final_freight_stage: VehicleFreightStage | null;
  events: Array<Record<string, unknown>> | null;
  stage_timeline: Array<Record<string, unknown>> | null;
  documents: Array<Record<string, unknown>> | null;
  created_at: string;
  updated_at: string | null;
};

function optional(value?: string | null) {
  return value ?? undefined;
}

async function signedUrl(bucket?: string | null, path?: string | null) {
  if (!bucket || !path) return undefined;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return undefined;
  return data.signedUrl;
}

function numberOrUndefined(value: number | string | null) {
  if (value === null) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function freightHistoryFromRow(row: FreightHistoryRow): FreightHistory {
  return {
    id: row.id,
    freightId: optional(row.freight_id),
    vehicleId: optional(row.vehicle_id),
    driverId: optional(row.driver_id),
    trailerId: optional(row.trailer_id),
    senderId: optional(row.sender_id),
    recipientId: optional(row.recipient_id),
    productId: optional(row.product_id),
    vehiclePlate: row.vehicle_plate,
    driverName: optional(row.driver_name),
    trailerIdentifier: optional(row.trailer_identifier),
    senderName: optional(row.sender_name),
    senderCity: optional(row.sender_city),
    senderState: optional(row.sender_state),
    recipientName: optional(row.recipient_name),
    recipientCity: optional(row.recipient_city),
    recipientState: optional(row.recipient_state),
    productName: optional(row.product_name),
    freightValue: numberOrUndefined(row.freight_value),
    startedAt: optional(row.started_at),
    finishedAt: row.finished_at,
    finishReason: row.finish_reason,
    finalStatus: row.final_status ?? undefined,
    finalFreightStage: row.final_freight_stage ?? undefined,
    events: row.events ?? [],
    stageTimeline: row.stage_timeline ?? [],
    documents: row.documents ?? [],
    createdAt: row.created_at,
    updatedAt: optional(row.updated_at),
  };
}

export async function listFreightHistory(): Promise<FreightHistory[]> {
  const { data, error } = await supabase
    .from("freight_history")
    .select("*")
    .order("finished_at", { ascending: false });

  if (error) throw error;
  const records = ((data ?? []) as FreightHistoryRow[]).map(freightHistoryFromRow);
  return Promise.all(
    records.map(async (record) => ({
      ...record,
      documents: await Promise.all(
        record.documents.map(async (document) => {
          const bucket =
            typeof document.storageBucket === "string"
              ? document.storageBucket
              : typeof document.storage_bucket === "string"
                ? document.storage_bucket
                : undefined;
          const path =
            typeof document.storagePath === "string"
              ? document.storagePath
              : typeof document.storage_path === "string"
                ? document.storage_path
                : undefined;

          return {
            ...document,
            url: await signedUrl(bucket, path),
          };
        }),
      ),
    })),
  );
}

export async function deleteFreightHistory(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("freight_history").delete().in("id", ids);
  if (error) throw error;
}
