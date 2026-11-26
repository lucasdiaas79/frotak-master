import { supabase } from "@/lib/supabase";
import { generateShareToken, hashShareToken, shareUrl } from "@/lib/freightShare";

// Cria o link de acompanhamento do frete atual de um veiculo. O token so existe
// na resposta desta funcao: no banco fica o hash, entao um link perdido nao pode
// ser recuperado, so gerado de novo.

const TABLE = "freight_share_links";
const DEFAULT_DAYS = 30;

export interface CreatedFreightShareLink {
  id: string;
  url: string;
  expiresAt: string;
}

export async function createFreightShareLink(input: {
  vehicleId: string;
  days?: number;
}): Promise<CreatedFreightShareLink> {
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("tenant_id, current_freight_id")
    .eq("id", input.vehicleId)
    .maybeSingle();

  if (vehicleError) {
    console.error("[freight-share] vehicle lookup failed", {
      vehicleId: input.vehicleId,
      message: vehicleError.message,
      code: vehicleError.code,
    });
    throw vehicleError;
  }
  if (!vehicle?.tenant_id || !vehicle.current_freight_id) {
    throw new Error("Este veículo não tem frete ativo para compartilhar.");
  }

  const token = generateShareToken();
  const tokenHash = await hashShareToken(token);
  const days = Math.min(Math.max(input.days ?? DEFAULT_DAYS, 1), 90);
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      tenant_id: vehicle.tenant_id,
      vehicle_id: input.vehicleId,
      freight_id: vehicle.current_freight_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error) {
    console.error("[freight-share] insert failed", {
      vehicleId: input.vehicleId,
      message: error.message,
      code: error.code,
    });
    throw error;
  }

  return {
    id: data.id as string,
    url: shareUrl(window.location.origin, token),
    expiresAt: data.expires_at as string,
  };
}

export interface FreightShareLinkSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  viewCount: number;
  lastViewedAt?: string;
}

// Links ja criados para o frete atual: mostra se o cliente abriu.
export async function listFreightShareLinks(input: {
  vehicleId: string;
  freightId: string;
}): Promise<FreightShareLinkSummary[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, created_at, expires_at, revoked_at, view_count, last_viewed_at")
    .eq("vehicle_id", input.vehicleId)
    .eq("freight_id", input.freightId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    revokedAt: (row.revoked_at as string | null) ?? undefined,
    viewCount: Number(row.view_count ?? 0),
    lastViewedAt: (row.last_viewed_at as string | null) ?? undefined,
  }));
}

export async function revokeFreightShareLink(id: string) {
  const { error } = await supabase
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
