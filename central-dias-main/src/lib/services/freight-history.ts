import { supabase } from "@/lib/supabase";
import type { FreightHistory, VehicleFreightStage, VehicleStatus } from "@/lib/types";

export interface LongTripHistoryMovement {
  id: string;
  type: "entry" | "expense";
  label: string;
  amount: number;
  notes?: string;
  recordedAt: string;
}

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

function relatedValue<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export async function listLongTripHistory(): Promise<LongTripHistory[]> {
  const { data, error } = await supabase
    .from("driver_trip_cycles")
    .select(`
      id,
      driver_id,
      vehicle_id,
      started_at,
      closed_at,
      close_reason,
      total_cash_entries,
      total_expenses,
      closing_balance,
      freight_count,
      completed_freight_count,
      driver:drivers(name),
      vehicle:vehicles(plate),
      trailer:trailers(identifier),
      allowance:driver_trip_daily_allowances(quantity, unit_amount, total_amount, status),
      entries:freight_cash_entries(id, origin, amount, notes, recorded_at),
      expenses:freight_expenses(id, category, description, amount, notes, payment_source, recorded_at)
    `)
    .eq("status", "closed")
    .order("closed_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const driver = relatedValue(row.driver as { name?: string } | Array<{ name?: string }> | null);
    const vehicle = relatedValue(row.vehicle as { plate?: string } | Array<{ plate?: string }> | null);
    const trailer = relatedValue(
      row.trailer as { identifier?: string } | Array<{ identifier?: string }> | null,
    );
    const allowance = relatedValue(
      row.allowance as
        | { quantity?: number; unit_amount?: number; total_amount?: number; status?: string }
        | Array<{ quantity?: number; unit_amount?: number; total_amount?: number; status?: string }>
        | null,
    );
    const entries = (row.entries ?? []) as Array<Record<string, unknown>>;
    const expenses = ((row.expenses ?? []) as Array<Record<string, unknown>>).filter(
      (expense) => expense.payment_source === "trip_cash",
    );
    const movements: LongTripHistoryMovement[] = [
      ...entries.map((entry) => ({
        id: String(entry.id),
        type: "entry" as const,
        label: String(entry.origin || "Entrada"),
        amount: Number(entry.amount || 0),
        notes: typeof entry.notes === "string" ? entry.notes : undefined,
        recordedAt: String(entry.recorded_at),
      })),
      ...expenses.map((expense) => ({
        id: String(expense.id),
        type: "expense" as const,
        label: String(expense.description || expense.category || "Despesa"),
        amount: Number(expense.amount || 0),
        notes: typeof expense.notes === "string" ? expense.notes : undefined,
        recordedAt: String(expense.recorded_at),
      })),
    ].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

    return {
      id: String(row.id),
      driverId: String(row.driver_id),
      driverName: driver?.name || "Motorista nao informado",
      vehicleId: typeof row.vehicle_id === "string" ? row.vehicle_id : undefined,
      vehiclePlate: vehicle?.plate || "Sem placa",
      trailerIdentifier: trailer?.identifier,
      startedAt: String(row.started_at),
      closedAt: String(row.closed_at),
      closeReason: typeof row.close_reason === "string" ? row.close_reason : undefined,
      totalEntries: Number(row.total_cash_entries || 0),
      totalExpenses: Number(row.total_expenses || 0),
      closingBalance: Number(row.closing_balance || 0),
      freightCount: Number(row.freight_count || 0),
      completedFreightCount: Number(row.completed_freight_count || 0),
      dailyAllowance: allowance?.status
        ? {
            quantity: Number(allowance.quantity || 0),
            unitAmount: Number(allowance.unit_amount || 0),
            totalAmount: Number(allowance.total_amount || 0),
            status: allowance.status as "submitted" | "approved" | "rejected" | "cancelled",
          }
        : undefined,
      movements,
    };
  });
}

export async function deleteFreightHistory(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("freight_history").delete().in("id", ids);
  if (error) throw error;
}
