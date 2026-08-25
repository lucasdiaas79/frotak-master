import { supabase } from "@/lib/supabase";
import type { FreightDocument, FreightDocumentKind } from "@/lib/types";

const BUCKET = "freight-documents";

interface FreightDocumentRow {
  id: string;
  tenant_id?: string | null;
  vehicle_id: string;
  freight_id?: string | null;
  driver_id?: string | null;
  kind: FreightDocumentKind;
  source: FreightDocument["source"];
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
}

async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) {
    console.error("[freight-documents] signed url failed", {
      bucket,
      path,
      message: error.message,
    });
    return undefined;
  }
  return data.signedUrl;
}

async function fromRow(row: FreightDocumentRow): Promise<FreightDocument> {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    freightId: row.freight_id ?? undefined,
    driverId: row.driver_id ?? undefined,
    kind: row.kind,
    source: row.source,
    fileName: row.file_name,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    status: row.status,
    url: await signedUrl(row.storage_bucket, row.storage_path),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export async function listFreightDocuments(refs: Array<{ vehicleId: string; freightId?: string }>) {
  if (refs.length === 0) return [];

  const vehicleIds = Array.from(new Set(refs.map((ref) => ref.vehicleId)));
  const freightByVehicle = new Map(refs.map((ref) => [ref.vehicleId, ref.freightId]));

  const { data, error } = await supabase
    .from("freight_documents")
    .select("*")
    .in("vehicle_id", vehicleIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const documents = await Promise.all(
    (data ?? []).map((row) => fromRow(row as FreightDocumentRow)),
  );

  return documents.filter((document) => {
    const currentFreightId = freightByVehicle.get(document.vehicleId);
    if (!currentFreightId) return false;
    return document.freightId === currentFreightId;
  });
}

export async function uploadFreightDocument(input: {
  vehicleId: string;
  freightId?: string;
  driverId?: string;
  kind: FreightDocumentKind;
  file: File;
  source: FreightDocument["source"];
  status?: string;
}) {
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("tenant_id,current_freight_id,driver_id")
    .eq("id", input.vehicleId)
    .single();

  if (vehicleError) {
    console.error("[freight-documents] vehicle lookup failed", {
      vehicleId: input.vehicleId,
      message: vehicleError.message,
      code: vehicleError.code,
      details: vehicleError.details,
    });
    throw vehicleError;
  }

  const tenantId = vehicle?.tenant_id;
  const freightId = input.freightId ?? vehicle?.current_freight_id ?? undefined;
  const driverId = input.driverId ?? vehicle?.driver_id ?? undefined;

  if (!tenantId) {
    console.error("[freight-documents] vehicle tenant missing", {
      vehicleId: input.vehicleId,
      freightId,
      kind: input.kind,
    });
    throw new Error("Nao foi possivel identificar o tenant do documento.");
  }

  if (!freightId) {
    console.error("[freight-documents] active freight missing", {
      vehicleId: input.vehicleId,
      tenantId,
      kind: input.kind,
    });
    throw new Error("Nao foi possivel identificar o frete ativo do documento.");
  }

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${tenantId}/${freightId}/${input.kind}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, input.file, {
    contentType: input.file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) {
    console.error("[freight-documents] storage upload failed", {
      bucket: BUCKET,
      path,
      message: uploadError.message,
    });
    throw uploadError;
  }

  const { data, error } = await supabase
    .from("freight_documents")
    .insert({
      tenant_id: tenantId,
      vehicle_id: input.vehicleId,
      freight_id: freightId,
      driver_id: driverId ?? null,
      kind: input.kind,
      source: input.source,
      file_name: input.file.name,
      storage_bucket: BUCKET,
      storage_path: path,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      status: input.status ?? "anexado",
    })
    .select("*")
    .single();

  if (error) {
    void supabase.storage.from(BUCKET).remove([path]);
    console.error("[freight-documents] insert failed", {
      vehicleId: input.vehicleId,
      freightId,
      tenantId,
      kind: input.kind,
      message: error.message,
      code: error.code,
      details: error.details,
    });
    throw error;
  }
  return fromRow(data as FreightDocumentRow);
}

export async function updateFreightDocumentStatus(id: string, status: string) {
  const { data, error } = await supabase
    .from("freight_documents")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[freight-documents] status update failed", {
      id,
      status,
      message: error.message,
      code: error.code,
      details: error.details,
    });
    throw error;
  }
  return fromRow(data as FreightDocumentRow);
}
