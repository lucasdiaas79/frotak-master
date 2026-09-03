import { supabase } from "@/lib/supabase";
import type {
  FleetEventSource,
  FreightPaymentType,
  Vehicle,
  VehicleFreightStage,
  VehicleStatus,
} from "@/lib/types";
import { vehicleFromRow, vehicleToRow } from "./mappers";

export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, vehicle_trailers(trailer_id, position, active)")
    .order("plate")
    .order("position", { referencedTable: "vehicle_trailers", ascending: true });
  if (error && error.code === "PGRST200") {
    const retry = await supabase.from("vehicles").select("*").order("plate");
    if (retry.error) throw retry.error;
    return (retry.data ?? []).map(vehicleFromRow);
  }
  if (error) throw error;
  return (data ?? []).map(vehicleFromRow);
}

export async function upsertVehicle(vehicle: Vehicle): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .upsert(vehicleToRow(vehicle))
    .select("*")
    .single();
  if (error) throw error;
  return vehicleFromRow(data);
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) throw error;
}

export async function updateVehicleStatus(
  id: string,
  status: VehicleStatus,
  source: FleetEventSource = "Operador",
  description?: string,
  freightStage?: VehicleFreightStage,
): Promise<Vehicle> {
  const { data, error } = await supabase.rpc("set_vehicle_status", {
    p_vehicle_id: id,
    p_status: status,
    p_source: source,
    p_description: description ?? null,
    p_freight_stage: freightStage ?? null,
  });
  if (error) throw error;
  return vehicleFromRow(Array.isArray(data) ? data[0] : data);
}

export async function linkVehicle(input: {
  vehicleId: string;
  driverId?: string;
  trailerId?: string;
  trailerIds?: string[];
  senderId?: string;
  recipientId?: string;
  productId?: string;
  freightValue?: number;
  freightPaymentType?: FreightPaymentType;
}): Promise<Vehicle> {
  const payload = {
    p_vehicle_id: input.vehicleId,
    p_driver_id: input.driverId ?? null,
    p_trailer_id: input.trailerId ?? null,
    p_trailer_ids: input.trailerIds ?? (input.trailerId ? [input.trailerId] : null),
    p_sender_id: input.senderId ?? null,
    p_recipient_id: input.recipientId ?? null,
    p_product_id: input.productId ?? null,
    p_freight_value: input.freightValue ?? null,
  };
  const { data, error } = input.freightPaymentType
    ? await supabase.rpc("link_vehicle_operation", {
        ...payload,
        p_freight_payment_type: input.freightPaymentType,
      })
    : await supabase.rpc("link_vehicle_operation", payload);
  if (error) throw error;
  return vehicleFromRow(Array.isArray(data) ? data[0] : data);
}

export async function archiveVehicleFreight(
  vehicleId: string,
  reason = "pronto_para_novo_frete",
): Promise<string | null> {
  const { data, error } = await supabase.rpc("archive_vehicle_freight", {
    p_vehicle_id: vehicleId,
    p_reason: reason,
    p_clear_vehicle: true,
  });
  if (error) throw error;
  return data ?? null;
}
