import { supabase } from "@/lib/supabase";

export type DailyAllowanceStatus = "submitted" | "approved" | "rejected" | "cancelled";

export interface DailyAllowanceSettings {
  workspaceId: string;
  tenantId: string;
  available: boolean;
  enabled: boolean;
  dailyAmount: number;
  paymentDueDays: number;
}

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

function rpcError(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export async function getDailyAllowanceSettings(
  workspaceId: string,
): Promise<DailyAllowanceSettings> {
  const { data, error } = await supabase.rpc("get_driver_daily_allowance_settings", {
    p_workspace_id: workspaceId,
  });
  rpcError("Nao foi possivel carregar a configuracao de diarias", error);
  const row = data as Record<string, unknown>;
  return {
    workspaceId: String(row.workspaceId),
    tenantId: String(row.tenantId),
    available: row.available === true,
    enabled: row.enabled === true,
    dailyAmount: Number(row.dailyAmount ?? 0),
    paymentDueDays: Number(row.paymentDueDays ?? 5),
  };
}

export async function saveDailyAllowanceSettings(input: {
  workspaceId: string;
  enabled: boolean;
  dailyAmount: number;
  paymentDueDays: number;
}): Promise<DailyAllowanceSettings> {
  const { data, error } = await supabase.rpc("save_driver_daily_allowance_settings", {
    p_workspace_id: input.workspaceId,
    p_enabled: input.enabled,
    p_daily_amount: input.dailyAmount,
    p_payment_due_days: input.paymentDueDays,
  });
  rpcError("Nao foi possivel salvar a configuracao de diarias", error);
  const row = data as Record<string, unknown>;
  return {
    workspaceId: String(row.workspaceId),
    tenantId: String(row.tenantId),
    available: row.available === true,
    enabled: row.enabled === true,
    dailyAmount: Number(row.dailyAmount ?? 0),
    paymentDueDays: Number(row.paymentDueDays ?? 5),
  };
}

export async function listDriverDailyAllowances(
  workspaceId: string,
): Promise<DriverDailyAllowance[]> {
  const { data, error } = await supabase.rpc("list_driver_daily_allowances", {
    p_workspace_id: workspaceId,
    p_status: null,
  });
  rpcError("Nao foi possivel carregar as diarias", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    tripCycleId: String(row.tripCycleId),
    driverId: String(row.driverId),
    driverName: String(row.driverName),
    vehicleId: typeof row.vehicleId === "string" ? row.vehicleId : undefined,
    vehiclePlate: String(row.vehiclePlate),
    quantity: Number(row.quantity),
    unitAmount: Number(row.unitAmount),
    totalAmount: Number(row.totalAmount),
    status: row.status as DailyAllowanceStatus,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    submittedAt: String(row.submittedAt),
    reviewedAt: typeof row.reviewedAt === "string" ? row.reviewedAt : undefined,
    reviewNotes: typeof row.reviewNotes === "string" ? row.reviewNotes : undefined,
    financialDocumentId:
      typeof row.financialDocumentId === "string" ? row.financialDocumentId : undefined,
    tripStartedAt: String(row.tripStartedAt),
    tripClosedAt: typeof row.tripClosedAt === "string" ? row.tripClosedAt : undefined,
    freightCount: Number(row.freightCount ?? 0),
  }));
}

export async function reviewDriverDailyAllowance(input: {
  allowanceId: string;
  action: "approve" | "reject";
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("review_driver_daily_allowance", {
    p_allowance_id: input.allowanceId,
    p_action: input.action,
    p_review_notes: input.notes ?? null,
  });
  rpcError(
    input.action === "approve"
      ? "Nao foi possivel aprovar a diaria"
      : "Nao foi possivel reprovar a diaria",
    error,
  );
  return data as { id: string; status: DailyAllowanceStatus; financialDocumentId?: string };
}
