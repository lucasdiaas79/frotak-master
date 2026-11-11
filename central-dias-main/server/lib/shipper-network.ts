import { getSupabaseAdmin } from "./supabase-admin.ts";
import { ShipperError, type ShipperSession } from "./shipper-portal.ts";
import {
  DRIVER_DOC_LABELS,
  REQUIRED_DRIVER_DOCS,
  docStateFor,
  initialsOf,
  worstDocState,
  type DriverDecision,
  type DriverDocKind,
  type DriverDocumentInfo,
  type DriverRelation,
  type DriverTripSummary,
  type NetworkDriver,
  type ShipperDriver,
  type ShipperFreight,
  type ShipperNetworkSettings,
  type ShipperPortalData,
  type ShipperThirdPartyData,
} from "../../src/lib/shipper/types.ts";

// Terceiros do embarcador e Rede Frotak. Roda so no servidor, com service role.
//
// O embarcador enxerga apenas motoristas que levaram carga dele (pelas transportadoras que
// aceitaram o convite). Na Rede, so motoristas que aceitaram entrar nela, e so se o proprio
// embarcador tambem compartilha. Nunca sai daqui: valor pago ao motorista, telefone, CPF,
// com qual transportadora ele rodou para outros clientes, ou observacoes de outra empresa.

type Row = Record<string, unknown>;

const DOC_KINDS: DriverDocKind[] = ["cnh", "rntrc", "seguro", "crlv", "gr"];
const DEFAULT_SETTINGS: ShipperNetworkSettings = {
  shareApproved: false,
  shareRatings: true,
  shareBlocks: false,
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

async function chunked(ids: string[], run: (chunk: string[]) => Promise<Row[]>) {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(await run(ids.slice(i, i + 150))));
  return out;
}

function mapDocuments(rows: Row[], now: number): DriverDocumentInfo[] {
  const byKind = new Map(rows.map((row) => [row.kind as DriverDocKind, row]));
  return DOC_KINDS.filter((kind) => byKind.has(kind) || REQUIRED_DRIVER_DOCS.includes(kind)).map(
    (kind) => {
      const row = byKind.get(kind);
      const expiresAt = text(row?.expires_at);
      return {
        kind,
        label: DRIVER_DOC_LABELS[kind],
        numberHint: text(row?.number_hint),
        expiresAt,
        state: row ? (expiresAt ? docStateFor(expiresAt, now) : "ok") : "faltando",
        informedBy: row?.informed_by === "transportadora" ? "transportadora" : "motorista",
      };
    },
  );
}

function requiredState(documents: DriverDocumentInfo[]) {
  return worstDocState(
    documents.filter((doc) => REQUIRED_DRIVER_DOCS.includes(doc.kind)).map((doc) => doc.state),
  );
}

function average(values: number[]) {
  if (!values.length) return undefined;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function routeOf(freight: ShipperFreight) {
  const from = freight.origin?.split("/")[0];
  const to = freight.destination?.split("/")[0];
  return [from, to].filter(Boolean).join(" → ") || freight.code;
}

// ------------------------------------------------------------ Leitura

export async function loadNetworkSettings(shipperId: string): Promise<ShipperNetworkSettings> {
  const { data } = await getSupabaseAdmin()
    .from("shipper_network_settings")
    .select("share_approved, share_ratings, share_blocks")
    .eq("shipper_id", shipperId)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    shareApproved: data.share_approved === true,
    shareRatings: data.share_ratings !== false,
    shareBlocks: data.share_blocks === true,
  };
}

/** Motoristas que levaram carga do embarcador, com documentos, nota e a decisao dele. */
export async function loadShipperThirdParties(
  session: ShipperSession,
  portal: ShipperPortalData,
): Promise<ShipperThirdPartyData> {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const settings = await loadNetworkSettings(session.shipper.id);

  const freightsByProfile = new Map<string, ShipperFreight[]>();
  for (const freight of portal.freights) {
    if (!freight.driverProfileId) continue;
    const list = freightsByProfile.get(freight.driverProfileId) ?? [];
    list.push(freight);
    freightsByProfile.set(freight.driverProfileId, list);
  }
  const profileIds = [...freightsByProfile.keys()];
  if (!profileIds.length) return { drivers: [], settings };

  const [profiles, links, documents, ratings, decisions, notes, approvals] = await Promise.all([
    chunked(profileIds, async (chunk) => {
      const { data } = await supabase
        .from("driver_network_profiles")
        .select("id, full_name, vehicle_kind, base_city, base_state, network_opt_in")
        .in("id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    chunked(profileIds, async (chunk) => {
      const { data } = await supabase
        .from("driver_network_links")
        .select("profile_id, tenant_id, relation")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    chunked(profileIds, async (chunk) => {
      const { data } = await supabase
        .from("driver_network_documents")
        .select("profile_id, kind, number_hint, expires_at, informed_by")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    chunked(profileIds, async (chunk) => {
      const { data } = await supabase
        .from("driver_trip_ratings")
        .select("profile_id, freight_id, shipper_id, rater, score, on_time")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    supabase
      .from("shipper_driver_decisions")
      .select("profile_id, status, reason")
      .eq("shipper_id", session.shipper.id)
      .then((r) => (r.data as Row[] | null) ?? []),
    supabase
      .from("shipper_driver_notes")
      .select("id, profile_id, body, author_name, created_at")
      .eq("shipper_id", session.shipper.id)
      .order("created_at", { ascending: false })
      .limit(500)
      .then((r) => (r.data as Row[] | null) ?? []),
    chunked(profileIds, async (chunk) => {
      const { data } = await supabase
        .from("shipper_driver_decisions")
        .select("profile_id, shipper_id")
        .eq("status", "aprovado")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
  ]);

  const tenantOfCarrier = new Map<string, string>();
  const tenantRows = await supabase
    .from("shipper_carriers")
    .select("id, tenant_id")
    .eq("shipper_id", session.shipper.id);
  for (const row of (tenantRows.data as Row[] | null) ?? []) {
    if (typeof row.tenant_id === "string") tenantOfCarrier.set(row.id as string, row.tenant_id);
  }

  const group = (rows: Row[]) => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.profile_id as string;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };
  const docsBy = group(documents);
  const ratingsBy = group(ratings);
  const linksBy = group(links);
  const notesBy = group(notes);
  const decisionBy = new Map(decisions.map((row) => [row.profile_id as string, row]));
  const approvedBy = group(approvals);

  const drivers: ShipperDriver[] = profiles.map((profile) => {
    const id = profile.id as string;
    const freights = (freightsByProfile.get(id) ?? []).sort(
      (a, b) =>
        new Date(b.lastEventAt ?? b.startedAt ?? 0).getTime() -
        new Date(a.lastEventAt ?? a.startedAt ?? 0).getTime(),
    );
    const myFreightIds = new Set(freights.map((f) => f.id));
    const allRatings = ratingsBy.get(id) ?? [];
    const myRatings = allRatings.filter(
      (row) => row.shipper_id === session.shipper.id && myFreightIds.has(row.freight_id as string),
    );
    const onTimeKnown = allRatings.filter(
      (row) => myFreightIds.has(row.freight_id as string) && typeof row.on_time === "boolean",
    );
    const docs = mapDocuments(docsBy.get(id) ?? [], now);
    // Vinculo com as transportadoras do embarcador (o mais "distante" vence: terceiro > agregado > frota).
    const myTenants = new Set(
      freights.map((f) => tenantOfCarrier.get(f.carrierId)).filter(Boolean),
    );
    const relations = (linksBy.get(id) ?? [])
      .filter((row) => myTenants.has(row.tenant_id as string))
      .map((row) => row.relation as DriverRelation);
    const relation: DriverRelation = relations.includes("terceiro")
      ? "terceiro"
      : relations.includes("agregado")
        ? "agregado"
        : "frota";
    const decision = decisionBy.get(id);
    const trips: DriverTripSummary[] = freights.map((freight) => {
      const rating = myRatings.find((row) => row.freight_id === freight.id);
      const anyOnTime = allRatings.find(
        (row) => row.freight_id === freight.id && typeof row.on_time === "boolean",
      );
      return {
        freightId: freight.id,
        date: freight.deliveredAt ?? freight.startedAt ?? freight.lastEventAt,
        route: routeOf(freight),
        carrierName: freight.carrierName,
        plate: freight.plate,
        finished: freight.finished,
        occurrence: freight.occurrence,
        onTime: anyOnTime ? anyOnTime.on_time === true : undefined,
        myScore: rating ? Number(rating.score) : undefined,
      };
    });
    const lastPlate = freights[0]?.plate;
    return {
      profileId: id,
      name: String(profile.full_name),
      initials: initialsOf(String(profile.full_name)),
      relation,
      plate: lastPlate,
      vehicleKind: text(profile.vehicle_kind),
      baseCity:
        [text(profile.base_city), text(profile.base_state)].filter(Boolean).join("/") || undefined,
      carrierNames: [...new Set(freights.map((f) => f.carrierName))],
      score: average(allRatings.map((row) => Number(row.score))),
      scoreCount: allRatings.length,
      tripsWithMe: freights.length,
      onTimeRate: onTimeKnown.length
        ? Math.round(
            (onTimeKnown.filter((row) => row.on_time === true).length / onTimeKnown.length) * 100,
          )
        : undefined,
      occurrences: freights.filter((f) => !!f.occurrence).length,
      documents: docs,
      docState: requiredState(docs),
      decision: decision ? (decision.status as DriverDecision) : undefined,
      decisionReason: text(decision?.reason),
      activeFreightIds: freights.filter((f) => !f.finished).map((f) => f.id),
      trips,
      notes: (notesBy.get(id) ?? []).map((row) => ({
        id: row.id as string,
        body: String(row.body),
        author: text(row.author_name),
        at: row.created_at as string,
      })),
      inNetwork: profile.network_opt_in === true,
      validatedBy: new Set((approvedBy.get(id) ?? []).map((row) => row.shipper_id as string)).size,
    };
  });

  drivers.sort((a, b) => b.tripsWithMe - a.tripsWithMe || a.name.localeCompare(b.name));
  return { drivers, settings };
}

/** Motoristas da Rede Frotak: so quem aceitou entrar, e so para quem tambem compartilha. */
export async function searchNetwork(
  session: ShipperSession,
  filters: { state?: string; city?: string; vehicle?: string; docsOk?: boolean; minScore?: number },
): Promise<{ drivers: NetworkDriver[]; total: number; locked: boolean }> {
  const settings = await loadNetworkSettings(session.shipper.id);
  if (!settings.shareApproved) return { drivers: [], total: 0, locked: true };

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  let query = supabase
    .from("driver_network_profiles")
    .select("id, full_name, vehicle_kind, base_city, base_state, available_from, available_note")
    .eq("network_opt_in", true)
    .limit(200);
  if (filters.state) query = query.eq("base_state", filters.state.toUpperCase().slice(0, 2));
  if (filters.city) query = query.ilike("base_city", `%${filters.city.replace(/[%_]/g, "")}%`);
  if (filters.vehicle)
    query = query.ilike("vehicle_kind", `%${filters.vehicle.replace(/[%_]/g, "")}%`);
  const { data: rows } = await query;
  const profiles = (rows as Row[] | null) ?? [];
  const ids = profiles.map((row) => row.id as string);
  if (!ids.length) return { drivers: [], total: 0, locked: false };

  // Avaliacoes e aprovacoes de embarcadores que tambem compartilham com a rede.
  const { data: sharingRows } = await supabase
    .from("shipper_network_settings")
    .select("shipper_id, share_ratings, share_blocks")
    .eq("share_approved", true);
  const sharing = (sharingRows as Row[] | null) ?? [];
  const ratingShippers = new Set(
    sharing.filter((row) => row.share_ratings !== false).map((row) => row.shipper_id as string),
  );
  const blockShippers = new Set(
    sharing.filter((row) => row.share_blocks === true).map((row) => row.shipper_id as string),
  );
  const sharingShippers = new Set(sharing.map((row) => row.shipper_id as string));

  const [documents, ratings, decisions, links] = await Promise.all([
    chunked(ids, async (chunk) => {
      const { data } = await supabase
        .from("driver_network_documents")
        .select("profile_id, kind, number_hint, expires_at, informed_by")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    chunked(ids, async (chunk) => {
      const { data } = await supabase
        .from("driver_trip_ratings")
        .select("profile_id, shipper_id, rater, score, on_time")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    chunked(ids, async (chunk) => {
      const { data } = await supabase
        .from("shipper_driver_decisions")
        .select("profile_id, shipper_id, status")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
    chunked(ids, async (chunk) => {
      const { data } = await supabase
        .from("driver_trip_links")
        .select("profile_id, freight_id")
        .in("profile_id", chunk);
      return (data as Row[] | null) ?? [];
    }),
  ]);

  const drivers: NetworkDriver[] = [];
  for (const profile of profiles) {
    const id = profile.id as string;
    // Bloqueio compartilhado por outro embarcador tira o motorista da busca (sem dizer quem bloqueou).
    const blocked = decisions.some(
      (row) =>
        row.profile_id === id &&
        row.status === "bloqueado" &&
        row.shipper_id !== session.shipper.id &&
        blockShippers.has(row.shipper_id as string),
    );
    if (blocked) continue;
    const docs = mapDocuments(
      documents.filter((row) => row.profile_id === id),
      now,
    );
    const docState = requiredState(docs);
    if (filters.docsOk && docState !== "ok" && docState !== "vencendo") continue;
    const visibleRatings = ratings.filter(
      (row) =>
        row.profile_id === id &&
        (row.rater === "transportadora" || ratingShippers.has(row.shipper_id as string)),
    );
    const score = average(visibleRatings.map((row) => Number(row.score)));
    if (filters.minScore && (score ?? 0) < filters.minScore) continue;
    const onTime = visibleRatings.filter((row) => typeof row.on_time === "boolean");
    drivers.push({
      profileId: id,
      name: String(profile.full_name),
      initials: initialsOf(String(profile.full_name)),
      vehicleKind: text(profile.vehicle_kind),
      baseCity:
        [text(profile.base_city), text(profile.base_state)].filter(Boolean).join("/") || undefined,
      score,
      scoreCount: visibleRatings.length,
      trips: new Set(links.filter((row) => row.profile_id === id).map((row) => row.freight_id))
        .size,
      onTimeRate: onTime.length
        ? Math.round((onTime.filter((row) => row.on_time === true).length / onTime.length) * 100)
        : undefined,
      docState,
      documents: docs,
      validatedBy: new Set(
        decisions
          .filter(
            (row) =>
              row.profile_id === id &&
              row.status === "aprovado" &&
              sharingShippers.has(row.shipper_id as string),
          )
          .map((row) => row.shipper_id),
      ).size,
      availableFrom: text(profile.available_from),
      availableNote: text(profile.available_note),
    });
  }
  drivers.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.validatedBy - a.validatedBy);
  const { count } = await supabase
    .from("driver_network_profiles")
    .select("id", { count: "exact", head: true })
    .eq("network_opt_in", true);
  return { drivers, total: count ?? drivers.length, locked: false };
}

// ------------------------------------------------------------ Escrita

async function assertProfileVisible(
  session: ShipperSession,
  portal: ShipperPortalData,
  profileId: string,
) {
  if (!uuid(profileId)) throw new ShipperError("invalid", "Motorista inválido.");
  const seen = portal.freights.some((freight) => freight.driverProfileId === profileId);
  if (seen) return;
  // Motorista da rede: o embarcador so pode decidir sobre ele se compartilha com a rede.
  const settings = await loadNetworkSettings(session.shipper.id);
  const { data } = await getSupabaseAdmin()
    .from("driver_network_profiles")
    .select("network_opt_in")
    .eq("id", profileId)
    .maybeSingle();
  if (!settings.shareApproved || data?.network_opt_in !== true) {
    throw new ShipperError("not_found", "Motorista não encontrado.");
  }
}

export async function setDriverDecision(
  session: ShipperSession,
  portal: ShipperPortalData,
  input: { profileId: string; status: DriverDecision | "limpar"; reason?: string },
) {
  await assertProfileVisible(session, portal, input.profileId);
  const supabase = getSupabaseAdmin();
  if (input.status === "limpar") {
    await supabase
      .from("shipper_driver_decisions")
      .delete()
      .eq("shipper_id", session.shipper.id)
      .eq("profile_id", input.profileId);
    return;
  }
  const { error } = await supabase.from("shipper_driver_decisions").upsert(
    {
      shipper_id: session.shipper.id,
      profile_id: input.profileId,
      status: input.status,
      reason: input.reason?.slice(0, 300) || null,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
    },
    { onConflict: "shipper_id,profile_id" },
  );
  if (error) throw error;
}

export async function addDriverNote(
  session: ShipperSession,
  portal: ShipperPortalData,
  input: { profileId: string; body: string },
) {
  await assertProfileVisible(session, portal, input.profileId);
  const body = input.body.trim().slice(0, 1000);
  if (!body) throw new ShipperError("invalid", "Escreva a observação.");
  const { error } = await getSupabaseAdmin()
    .from("shipper_driver_notes")
    .insert({
      shipper_id: session.shipper.id,
      profile_id: input.profileId,
      body,
      author_id: session.userId,
      author_name: session.fullName ?? session.email,
    });
  if (error) throw error;
}

export async function rateDriverTrip(
  session: ShipperSession,
  portal: ShipperPortalData,
  input: { freightId: string; score: number; onTime?: boolean; comment?: string },
) {
  const freight = portal.freights.find((item) => item.id === input.freightId);
  if (!freight) throw new ShipperError("not_found", "Carga não encontrada.");
  if (!freight.finished || freight.cancelled)
    throw new ShipperError("invalid", "Só dá para avaliar uma entrega concluída.");
  if (!freight.driverProfileId)
    throw new ShipperError("invalid", "A transportadora ainda não identificou este motorista.");
  const score = Math.round(input.score);
  if (score < 1 || score > 5) throw new ShipperError("invalid", "Dê uma nota de 1 a 5.");
  const supabase = getSupabaseAdmin();
  const { data: carrier } = await supabase
    .from("shipper_carriers")
    .select("tenant_id")
    .eq("id", freight.carrierId)
    .eq("shipper_id", session.shipper.id)
    .maybeSingle();
  if (!carrier?.tenant_id) throw new ShipperError("not_found", "Transportadora não encontrada.");
  const { error } = await supabase.from("driver_trip_ratings").upsert(
    {
      profile_id: freight.driverProfileId,
      tenant_id: carrier.tenant_id,
      freight_id: freight.id,
      shipper_id: session.shipper.id,
      rater: "embarcador",
      score,
      on_time: typeof input.onTime === "boolean" ? input.onTime : null,
      comment: input.comment?.trim().slice(0, 500) || null,
      rated_by: session.userId,
    },
    { onConflict: "freight_id,shipper_id" },
  );
  if (error) throw error;
}

export async function saveNetworkSettings(
  session: ShipperSession,
  settings: ShipperNetworkSettings,
) {
  if (session.role !== "admin")
    throw new ShipperError("forbidden", "Só o administrador da empresa muda o compartilhamento.");
  const { error } = await getSupabaseAdmin().from("shipper_network_settings").upsert(
    {
      shipper_id: session.shipper.id,
      share_approved: settings.shareApproved,
      share_ratings: settings.shareRatings,
      share_blocks: settings.shareBlocks,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shipper_id" },
  );
  if (error) throw error;
}
