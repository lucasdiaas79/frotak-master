import { supabase } from "@/lib/supabase";
import type { Driver } from "@/lib/types";
import { driverFromRow, driverToRow } from "./mappers";

export async function listDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase.from("drivers").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(driverFromRow);
}

export async function upsertDriver(driver: Driver): Promise<Driver> {
  const { data, error } = await supabase
    .from("drivers")
    .upsert(driverToRow(driver))
    .select("*")
    .single();
  if (error) throw error;
  return driverFromRow(data);
}

export async function deleteDriver(id: string): Promise<void> {
  const { error } = await supabase.from("drivers").delete().eq("id", id);
  if (error) throw error;
}
