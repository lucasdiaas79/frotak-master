import { supabase } from "@/lib/supabase";
import type { FleetEvent } from "@/lib/types";
import { fleetEventFromRow } from "./mappers";

export async function listFleetEvents(limit = 250): Promise<FleetEvent[]> {
  const { data, error } = await supabase
    .from("fleet_events")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(fleetEventFromRow);
}
