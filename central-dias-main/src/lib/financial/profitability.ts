import { supabase } from "@/lib/supabase";
import type {
  FleetProfitabilitySummary,
  FreightProfitabilityRow,
  PartnerProfitabilityRow,
  ProfitabilityFilters,
  ProfitabilitySort,
  VehicleProfitabilityRow,
} from "./types";

function fail(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function params(filters: ProfitabilityFilters) {
  return {
    p_workspace_id: filters.workspaceId,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_vehicle_id: filters.vehicleId || null,
    p_billing_partner_id: filters.billingPartnerId || null,
    p_sender_id: filters.senderId || null,
    p_recipient_id: filters.recipientId || null,
    p_product_id: filters.productId || null,
    p_implement_model: filters.implementModel || null,
    p_payment_type: filters.paymentType || null,
  };
}

export async function getFleetProfitabilitySummary(
  filters: ProfitabilityFilters,
): Promise<FleetProfitabilitySummary> {
  const { data, error } = await supabase.rpc("get_fleet_profitability_summary", params(filters));
  fail("Nao foi possivel carregar o resumo de rentabilidade", error);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    revenue: numberValue(row.revenue),
    costs: numberValue(row.costs),
    result: numberValue(row.result),
    margin: numberValue(row.margin),
    unallocatedCosts: numberValue(row.unallocatedCosts),
  };
}

export async function getVehicleProfitability(
  filters: ProfitabilityFilters,
  sort: ProfitabilitySort,
  limit = 100,
): Promise<VehicleProfitabilityRow[]> {
  const { data, error } = await supabase.rpc("get_vehicle_profitability", {
    ...params(filters),
    p_sort: sort,
    p_limit: limit,
  });
  fail("Nao foi possivel carregar a rentabilidade por caminhao", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    vehicleId: String(row.vehicleId ?? ""),
    plate: String(row.plate ?? "-"),
    model: row.model ? String(row.model) : null,
    driverName: row.driverName ? String(row.driverName) : null,
    revenue: numberValue(row.revenue),
    costs: numberValue(row.costs),
    result: numberValue(row.result),
    margin: numberValue(row.margin),
    freightCount: numberValue(row.freightCount),
    implementModels: Array.isArray(row.implementModels)
      ? row.implementModels.map(String).filter(Boolean)
      : [],
  }));
}

export async function getFreightProfitability(
  filters: ProfitabilityFilters,
): Promise<FreightProfitabilityRow[]> {
  const { data, error } = await supabase.rpc("get_freight_profitability", params(filters));
  fail("Nao foi possivel carregar a rentabilidade por frete", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    freightId: String(row.freightId ?? ""),
    vehicleId: row.vehicleId ? String(row.vehicleId) : null,
    plate: String(row.plate ?? "-"),
    driverName: row.driverName ? String(row.driverName) : null,
    senderId: row.senderId ? String(row.senderId) : null,
    senderName: String(row.senderName ?? "-"),
    recipientId: row.recipientId ? String(row.recipientId) : null,
    recipientName: String(row.recipientName ?? "-"),
    productId: row.productId ? String(row.productId) : null,
    productName: String(row.productName ?? "-"),
    paymentType: row.paymentType === "CIF" || row.paymentType === "FOB" ? row.paymentType : null,
    billingPartnerId: row.billingPartnerId ? String(row.billingPartnerId) : null,
    billingPartnerName: String(row.billingPartnerName ?? "-"),
    revenue: numberValue(row.revenue),
    costs: numberValue(row.costs),
    result: numberValue(row.result),
    margin: numberValue(row.margin),
    completedAt: row.completedAt ? String(row.completedAt) : null,
  }));
}

export async function getPartnerProfitability(
  filters: ProfitabilityFilters,
): Promise<PartnerProfitabilityRow[]> {
  const { data, error } = await supabase.rpc("get_partner_profitability", params(filters));
  fail("Nao foi possivel carregar a rentabilidade por cliente", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    partnerId: row.partnerId ? String(row.partnerId) : null,
    partnerName: String(row.partnerName ?? "-"),
    revenue: numberValue(row.revenue),
    costs: numberValue(row.costs),
    result: numberValue(row.result),
    margin: numberValue(row.margin),
    freightCount: numberValue(row.freightCount),
  }));
}
