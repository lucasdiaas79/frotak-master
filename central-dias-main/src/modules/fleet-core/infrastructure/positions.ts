import { supabase } from "@/lib/supabase";

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

export async function registerVehiclePosition(input: RegisterVehiclePositionInput): Promise<void> {
  const { error } = await supabase.rpc("register_vehicle_position", {
    p_vehicle_id: input.vehicleId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_city: input.city ?? null,
    p_state: input.state ?? null,
    p_speed: input.speed ?? null,
    p_direction: input.direction ?? null,
    p_source: input.source ?? "manual",
    p_raw_payload: input.rawPayload ?? null,
  });
  if (error) throw error;
}
