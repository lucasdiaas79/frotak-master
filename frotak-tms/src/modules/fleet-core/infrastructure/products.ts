import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { productFromRow, productToRow } from "./mappers";

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) {
    if (error.code === "PGRST205" || error.message.includes("Could not find the table")) {
      console.warn(
        "Tabela public.products não encontrada. Aplique a migration de produtos no Supabase.",
      );
      return [];
    }
    throw error;
  }
  return (data ?? []).map(productFromRow);
}

export async function upsertProduct(product: Product): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .upsert(productToRow(product))
    .select("*")
    .single();
  if (error) throw error;
  return productFromRow(data);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}
