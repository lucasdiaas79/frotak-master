import { supabase } from "@/lib/supabase";
import type { Trailer } from "@/lib/types";
import { trailerFromRow, trailerToRow } from "./mappers";

export async function listTrailers(): Promise<Trailer[]> {
  const { data, error } = await supabase
    .from("trailers")
    .select("*")
    .order("fleet_seq", { nullsFirst: false })
    .order("identifier");
  if (error) throw error;
  return (data ?? []).map(trailerFromRow);
}

export async function upsertTrailer(trailer: Trailer): Promise<Trailer> {
  const { data, error } = await supabase
    .from("trailers")
    .upsert(trailerToRow(trailer))
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST204" || error.message.includes("implement_")) {
      const { implement_type: _implementType, implement_model: _implementModel, ...legacyRow } =
        trailerToRow(trailer);

      const retry = await supabase.from("trailers").upsert(legacyRow).select("*").single();
      if (retry.error) throw retry.error;
      return trailerFromRow(retry.data);
    }

    throw error;
  }
  return trailerFromRow(data);
}

export async function deleteTrailer(id: string): Promise<void> {
  const { error } = await supabase.from("trailers").delete().eq("id", id);
  if (error) throw error;
}
