import { supabase } from "@/lib/supabase";
import type { FreightDocument, FreightDocumentKind } from "@/lib/types";

const BUCKET = "freight-documents";

interface FreightDocumentRow {
  id: string;
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
  if (error) return undefined;
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

export async function listFreightDocuments(
  refs: Array<{ vehicleId: string; freightId?: string }>,
) {
  if (refs.length === 0) return [];

  const vehicleIds = Array.from(new Set(refs.map((ref) => ref.vehicleId)));
  const freightByVehicle = new Map(refs.map((ref) => [ref.vehicleId, ref.freightId]));

  const { data, error } = await supabase
    .from("freight_documents")
    .select("*")
    .in("vehicle_id", vehicleIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const documents = await Promise.all((data ?? []).map((row) => fromRow(row as FreightDocumentRow)));

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
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${input.vehicleId}/${input.kind}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, input.file, {
    contentType: input.file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("freight_documents")
    .insert({
      vehicle_id: input.vehicleId,
      freight_id: input.freightId ?? null,
      driver_id: input.driverId ?? null,
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

  if (error) throw error;
  return fromRow(data as FreightDocumentRow);
}

export async function updateFreightDocumentStatus(id: string, status: string) {
  const { data, error } = await supabase
    .from("freight_documents")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return fromRow(data as FreightDocumentRow);
}
