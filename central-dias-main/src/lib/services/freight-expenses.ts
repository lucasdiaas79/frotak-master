import { supabase } from "@/lib/supabase";
import type { FreightExpense, FreightExpenseCategory } from "@/lib/types";

type FreightExpenseRow = {
  id: string;
  tenant_id?: string | null;
  freight_id: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  fuel_record_id?: string | null;
  category: FreightExpenseCategory;
  description?: string | null;
  amount: number | string;
  notes?: string | null;
  source?: "driver_app" | "operator" | "system" | null;
  recorded_by?: string | null;
  recorded_at: string;
  created_at: string;
  updated_at?: string | null;
};

function optional(value?: string | null) {
  return value ?? undefined;
}

function expenseFromRow(row: FreightExpenseRow): FreightExpense {
  return {
    id: row.id,
    tenantId: optional(row.tenant_id),
    freightId: row.freight_id,
    vehicleId: optional(row.vehicle_id),
    driverId: optional(row.driver_id),
    fuelRecordId: optional(row.fuel_record_id),
    category: row.category,
    description: row.description?.trim() || "Despesa",
    amount: Number(row.amount ?? 0),
    notes: optional(row.notes),
    source: row.source ?? "operator",
    recordedBy: optional(row.recorded_by),
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: optional(row.updated_at),
  };
}

export async function listFreightExpenses(): Promise<FreightExpense[]> {
  const { data, error } = await supabase
    .from("freight_expenses")
    .select("*")
    .order("recorded_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as FreightExpenseRow[]).map(expenseFromRow);
}
