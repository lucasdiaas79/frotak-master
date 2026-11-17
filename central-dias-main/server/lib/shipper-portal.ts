import { getSupabaseAdmin } from "./supabase-admin.ts";
import {
  PUBLIC_DOCUMENT_LABELS,
  firstName,
  generateShareToken,
  hashShareToken,
  isPublicDocumentKind,
  isWellFormedShareToken,
  placeLabel,
  publicEventLabel,
  publicStatus,
  type PublicFreightEvent,
} from "../../src/lib/freightShare.ts";
import {
  DIESEL_KG_CO2_PER_LITER,
  PROOF_KINDS,
  type CarrierStatus,
  type ShipperCarrier,
  type ShipperDocument,
  type ShipperFreight,
  type ShipperPortalData,
  type ShipperProfile,
} from "../../src/lib/shipper/types.ts";

// Servidor do portal do embarcador. Tudo passa por aqui com service role, depois de
// conferir quem e o usuario. O embarcador so enxerga fretes de transportadoras que
// aceitaram o convite e em que o CNPJ dele e remetente ou destinatario.

type Row = Record<string, unknown>;

const HISTORY_DAYS = 90;
const POSITION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DELIVERED_STATUSES = new Set(["parado-aguardando-comando", "rota-retornando"]);
const AFTER_UNLOAD_STATUSES = new Set([
  "parado-aguardando-comando",
  "rota-retornando",
  "disponivel-patio",
  "aguardando-motorista",
  "rota-carregar",
]);

export class ShipperError extends Error {
  constructor(
    public code: "unauthorized" | "not_shipper" | "invalid" | "exists" | "not_found" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function onlyDigits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(cnpj[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

function freightCode(plate: unknown, vehicleId: unknown) {
  return `FRT-${String(plate ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()}-${String(vehicleId ?? "")
    .slice(0, 4)
    .toUpperCase()}`;
}

// ---------------------------------------------------------------- Sessao

export interface ShipperSession {
  userId: string;
  email: string;
  memberId: string;
  role: "admin" | "member";
  fullName?: string;
  shipper: { id: string; legalName: string; tradeName?: string; cnpj: string };
}

export async function resolveShipperSession(accessToken: string): Promise<ShipperSession> {
  if (!text(accessToken))
    throw new ShipperError("unauthorized", "Sessão expirada. Entre novamente.");
  const supabase = getSupabaseAdmin();
  const { data: auth, error } = await supabase.auth.getUser(accessToken);
  if (error || !auth.user)
    throw new ShipperError("unauthorized", "Sessão expirada. Entre novamente.");

  const { data: member } = await supabase
    .from("shipper_members")
    .select("id, shipper_id, role, status, full_name")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!member || member.status !== "active") {
    throw new ShipperError("not_shipper", "Esta conta não é de embarcador.");
  }
  const { data: shipper } = await supabase
    .from("shippers")
    .select("id, legal_name, trade_name, cnpj, status")
    .eq("id", member.shipper_id)
    .maybeSingle();
  if (!shipper || shipper.status !== "active") {
    throw new ShipperError("not_shipper", "Empresa do embarcador indisponível.");
  }
  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    memberId: member.id as string,
    role: member.role === "admin" ? "admin" : "member",
    fullName: text(member.full_name),
    shipper: {
      id: shipper.id as string,
      legalName: shipper.legal_name as string,
      tradeName: text(shipper.trade_name),
      cnpj: shipper.cnpj as string,
    },
  };
}

// ---------------------------------------------------------------- Cadastro

export async function signUpShipper(input: {
  companyName: string;
  cnpj: string;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}) {
  const companyName = input.companyName.trim();
  const cnpj = onlyDigits(input.cnpj);
  const email = input.email.trim().toLowerCase();
  if (!companyName || !input.fullName.trim())
    throw new ShipperError("invalid", "Preencha empresa e nome.");
  if (!isValidCnpj(cnpj)) throw new ShipperError("invalid", "CNPJ inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ShipperError("invalid", "E-mail inválido.");
  if (input.password.length < 8)
    throw new ShipperError("invalid", "A senha precisa ter pelo menos 8 caracteres.");

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("shippers")
    .select("id")
    .eq("cnpj", cnpj)
    .maybeSingle();
  if (existing) {
    throw new ShipperError(
      "exists",
      "Este CNPJ já tem conta. Peça ao administrador da sua empresa para liberar seu acesso.",
    );
  }

  const { data: created, error: userError } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), account_type: "shipper" },
  });
  if (userError || !created.user) {
    const message = userError?.message ?? "";
    if (/already|registered|exists/i.test(message)) {
      throw new ShipperError(
        "exists",
        "Este e-mail já tem cadastro. Use outro e-mail ou entre com ele.",
      );
    }
    throw new Error(`createUser failed: ${message}`);
  }

  const userId = created.user.id;
  const { data: shipper, error: shipperError } = await supabase
    .from("shippers")
    .insert({
      legal_name: companyName,
      trade_name: companyName,
      cnpj,
      phone: text(input.phone) ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (shipperError || !shipper) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(`shipper insert failed: ${shipperError?.message}`);
  }
  const { error: memberError } = await supabase.from("shipper_members").insert({
    shipper_id: shipper.id,
    user_id: userId,
    full_name: input.fullName.trim(),
    role: "admin",
  });
  if (memberError) {
    await supabase.from("shippers").delete().eq("id", shipper.id);
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(`member insert failed: ${memberError.message}`);
  }
  return { ok: true as const };
}

// ---------------------------------------------------------------- Transportadoras

function mapCarrier(row: Row, inviteUrl?: string): ShipperCarrier {
  return {
    id: row.id as string,
    name: row.carrier_name as string,
    cnpj: text(row.carrier_cnpj),
    status: row.status as CarrierStatus,
    contactName: text(row.contact_name),
    contactEmail: text(row.contact_email),
    contactPhone: text(row.contact_phone),
    invitedAt: row.invited_at as string,
    respondedAt: text(row.responded_at),
    inviteUrl,
  };
}

function inviteLink(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/embarcador/convite/${token}`;
}

export async function inviteCarrier(
  session: ShipperSession,
  input: {
    name: string;
    cnpj?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    origin: string;
  },
) {
  const name = input.name.trim();
  const cnpj = onlyDigits(input.cnpj);
  if (!name) throw new ShipperError("invalid", "Informe o nome da transportadora.");
  if (cnpj && !isValidCnpj(cnpj))
    throw new ShipperError("invalid", "CNPJ da transportadora inválido.");
  if (cnpj && cnpj === session.shipper.cnpj)
    throw new ShipperError("invalid", "Este é o CNPJ da sua própria empresa.");

  const supabase = getSupabaseAdmin();
  if (cnpj) {
    const { data: duplicate } = await supabase
      .from("shipper_carriers")
      .select("id")
      .eq("shipper_id", session.shipper.id)
      .eq("carrier_cnpj", cnpj)
      .maybeSingle();
    if (duplicate) throw new ShipperError("exists", "Esta transportadora já está na sua lista.");
  }

  // Se a transportadora ja usa a Frotak, o convite aparece direto na tela dela.
  let tenantId: string | null = null;
  if (cnpj) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("cnpj", cnpj)
      .maybeSingle();
    tenantId = (tenant?.id as string | undefined) ?? null;
  }

  const token = generateShareToken();
  const { data, error } = await supabase
    .from("shipper_carriers")
    .insert({
      shipper_id: session.shipper.id,
      tenant_id: tenantId,
      carrier_name: name,
      carrier_cnpj: cnpj || null,
      contact_name: text(input.contactName) ?? null,
      contact_email: text(input.email)?.toLowerCase() ?? null,
      contact_phone: onlyDigits(input.phone) || null,
      invite_token_hash: await hashShareToken(token),
      invited_by: session.userId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`invite insert failed: ${error?.message}`);
  return mapCarrier(data as Row, inviteLink(input.origin, token));
}

export async function renewCarrierInvite(
  session: ShipperSession,
  carrierId: string,
  origin: string,
) {
  const supabase = getSupabaseAdmin();
  const token = generateShareToken();
  const { data, error } = await supabase
    .from("shipper_carriers")
    .update({
      invite_token_hash: await hashShareToken(token),
      invited_at: new Date().toISOString(),
      status: "convidada",
    })
    .eq("id", carrierId)
    .eq("shipper_id", session.shipper.id)
    .in("status", ["convidada", "recusada"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`invite renew failed: ${error.message}`);
  if (!data) throw new ShipperError("not_found", "Convite não encontrado ou já aceito.");
  return mapCarrier(data as Row, inviteLink(origin, token));
}

export async function removeCarrier(session: ShipperSession, carrierId: string) {
  const { error } = await getSupabaseAdmin()
    .from("shipper_carriers")
    .delete()
    .eq("id", carrierId)
    .eq("shipper_id", session.shipper.id);
  if (error) throw new Error(`carrier delete failed: ${error.message}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------- Cargas

type RawEvent = { status?: string; at: string; place?: string };

function dwell(
  events: RawEvent[],
  startStatus: string,
  endStatuses: Set<string>,
  ongoingUntil?: number,
) {
  const startIndex = events.findIndex((event) => event.status === startStatus);
  if (startIndex < 0) return undefined;
  const start = new Date(events[startIndex].at).getTime();
  const end = events
    .slice(startIndex + 1)
    .find((event) => event.status && endStatuses.has(event.status));
  const endTime = end ? new Date(end.at).getTime() : ongoingUntil;
  if (!endTime || endTime < start) return undefined;
  return Math.round((endTime - start) / 60_000);
}

function publicEvents(events: RawEvent[]): PublicFreightEvent[] {
  const out: PublicFreightEvent[] = [];
  for (const event of events) {
    const label = publicEventLabel(event.status);
    if (!label || out[out.length - 1]?.label === label) continue;
    out.push({ label, at: event.at, place: event.place });
  }
  return out.reverse();
}

async function inChunks<T>(ids: string[], size: number, run: (chunk: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let index = 0; index < ids.length; index += size) {
    out.push(...(await run(ids.slice(index, index + size))));
  }
  return out;
}

export async function loadShipperPortal(session: ShipperSession): Promise<ShipperPortalData> {
  const supabase = getSupabaseAdmin();
  const now = Date.now();

  const { data: carrierRows } = await supabase
    .from("shipper_carriers")
    .select("*")
    .eq("shipper_id", session.shipper.id)
    .order("carrier_name");
  const carriers = ((carrierRows as Row[] | null) ?? []).map((row) => mapCarrier(row));
  const activeCarriers = ((carrierRows as Row[] | null) ?? []).filter(
    (row) => row.status === "ativa" && typeof row.tenant_id === "string",
  );
  const carrierByTenant = new Map(
    activeCarriers.map((row) => [
      row.tenant_id as string,
      { id: row.id as string, name: row.carrier_name as string },
    ]),
  );
  const tenantIds = [...carrierByTenant.keys()];

  const profile: ShipperProfile = {
    shipperId: session.shipper.id,
    companyName: session.shipper.tradeName ?? session.shipper.legalName,
    cnpj: session.shipper.cnpj,
    userName: session.fullName ?? session.email,
    email: session.email,
    role: session.role,
  };
  if (!tenantIds.length) {
    return { profile, carriers, freights: [], generatedAt: new Date(now).toISOString() };
  }

  // Remetentes e destinatarios com o CNPJ do embarcador, em cada transportadora conectada.
  const [{ data: senderRows }, { data: recipientRows }] = await Promise.all([
    supabase
      .from("senders")
      .select("id, tenant_id, name, city, state, cnpj")
      .in("tenant_id", tenantIds),
    supabase
      .from("recipients")
      .select("id, tenant_id, name, city, state, cnpj")
      .in("tenant_id", tenantIds),
  ]);
  const matches = (rows: Row[] | null) =>
    (rows ?? []).filter((row) => onlyDigits(text(row.cnpj)) === session.shipper.cnpj);
  const mySenders = matches(senderRows as Row[] | null);
  const myRecipients = matches(recipientRows as Row[] | null);
  const mySenderIds = new Set(mySenders.map((row) => row.id as string));
  const myRecipientIds = new Set(myRecipients.map((row) => row.id as string));
  if (!mySenderIds.size && !myRecipientIds.size) {
    return { profile, carriers, freights: [], generatedAt: new Date(now).toISOString() };
  }
  const allParties = new Map(
    [...((senderRows as Row[] | null) ?? []), ...((recipientRows as Row[] | null) ?? [])].map(
      (row) => [row.id as string, row],
    ),
  );

  const orFilter = (senderCol: string, recipientCol: string) =>
    [
      mySenderIds.size ? `${senderCol}.in.(${[...mySenderIds].join(",")})` : "",
      myRecipientIds.size ? `${recipientCol}.in.(${[...myRecipientIds].join(",")})` : "",
    ]
      .filter(Boolean)
      .join(",");

  const since = new Date(now - HISTORY_DAYS * 86_400_000).toISOString();
  const [{ data: vehicleRows }, { data: historyRows }] = await Promise.all([
    supabase
      .from("vehicles")
      .select(
        "id, tenant_id, plate, current_freight_id, freight_stage, status, driver_id, sender_id, recipient_id, product_id, lat, lng, city, state, last_position_at, sascar_id, last_transition_at",
      )
      .in("tenant_id", tenantIds)
      .not("current_freight_id", "is", null)
      .or(orFilter("sender_id", "recipient_id")),
    supabase
      .from("freight_history")
      .select(
        "freight_id, tenant_id, vehicle_id, vehicle_plate, driver_id, driver_name, sender_id, recipient_id, sender_name, sender_city, sender_state, recipient_name, recipient_city, recipient_state, product_name, final_status, final_freight_stage, started_at, finished_at",
      )
      .in("tenant_id", tenantIds)
      .gte("finished_at", since)
      .or(orFilter("sender_id", "recipient_id"))
      .order("finished_at", { ascending: false })
      .limit(300),
  ]);

  const vehicles = (vehicleRows as Row[] | null) ?? [];
  const activeFreightIds = new Set(vehicles.map((row) => row.current_freight_id as string));
  const history = ((historyRows as Row[] | null) ?? []).filter(
    (row) => typeof row.freight_id === "string" && !activeFreightIds.has(row.freight_id as string),
  );
  const freightIds = [...activeFreightIds, ...history.map((row) => row.freight_id as string)];
  if (!freightIds.length) {
    return { profile, carriers, freights: [], generatedAt: new Date(now).toISOString() };
  }

  const driverIds = [
    ...new Set(
      vehicles.map((row) => row.driver_id).filter((id): id is string => typeof id === "string"),
    ),
  ];
  const allDriverIds = [
    ...new Set(
      [...vehicles.map((row) => row.driver_id), ...history.map((row) => row.driver_id)].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];
  const productIds = [
    ...new Set(
      vehicles.map((row) => row.product_id).filter((id): id is string => typeof id === "string"),
    ),
  ];
  const vehicleIds = [
    ...new Set(
      [...vehicles.map((row) => row.id), ...history.map((row) => row.vehicle_id)].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ];

  const [events, documents, drivers, products, fuel, profileLinks] = await Promise.all([
    inChunks(freightIds, 100, async (chunk) => {
      const { data } = await supabase
        .from("fleet_events")
        .select("freight_id, status, city, state, timestamp")
        .in("freight_id", chunk)
        .in("tenant_id", tenantIds)
        .order("timestamp", { ascending: true })
        .limit(5000);
      return (data as Row[] | null) ?? [];
    }),
    inChunks(freightIds, 100, async (chunk) => {
      const { data } = await supabase
        .from("freight_documents")
        .select("id, freight_id, kind, mime_type, created_at")
        .in("freight_id", chunk)
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: true });
      return (data as Row[] | null) ?? [];
    }),
    driverIds.length
      ? supabase
          .from("drivers")
          .select("id, name")
          .in("id", driverIds)
          .then((r) => (r.data as Row[] | null) ?? [])
      : Promise.resolve([] as Row[]),
    productIds.length
      ? supabase
          .from("products")
          .select("id, name")
          .in("id", productIds)
          .then((r) => (r.data as Row[] | null) ?? [])
      : Promise.resolve([] as Row[]),
    vehicleIds.length
      ? supabase
          .from("fuel_records")
          .select("vehicle_id, liters, recorded_at")
          .in("vehicle_id", vehicleIds)
          .in("tenant_id", tenantIds)
          .gte("recorded_at", since)
          .then((r) => (r.data as Row[] | null) ?? [])
      : Promise.resolve([] as Row[]),
    inChunks(allDriverIds, 200, async (chunk) => {
      const { data } = await supabase
        .from("driver_network_links")
        .select("tenant_id, driver_id, profile_id")
        .in("driver_id", chunk)
        .in("tenant_id", tenantIds);
      return (data as Row[] | null) ?? [];
    }),
  ]);
  const profileByDriver = new Map(
    profileLinks.map((row) => [`${row.tenant_id}:${row.driver_id}`, row.profile_id as string]),
  );
  const profileOf = (tenantId: unknown, driverId: unknown) =>
    typeof driverId === "string" ? profileByDriver.get(`${tenantId}:${driverId}`) : undefined;

  const eventsByFreight = new Map<string, RawEvent[]>();
  for (const row of events) {
    const key = row.freight_id as string;
    const list = eventsByFreight.get(key) ?? [];
    list.push({
      status: text(row.status),
      at: row.timestamp as string,
      place: placeLabel(text(row.city), text(row.state)),
    });
    eventsByFreight.set(key, list);
  }
  const docsByFreight = new Map<string, ShipperDocument[]>();
  for (const row of documents) {
    const kind = text(row.kind);
    if (!kind || !isPublicDocumentKind(kind)) continue;
    const key = row.freight_id as string;
    const list = docsByFreight.get(key) ?? [];
    list.push({
      id: row.id as string,
      kind,
      label: PUBLIC_DOCUMENT_LABELS[kind],
      sentAt: row.created_at as string,
      isImage: (text(row.mime_type) ?? "").startsWith("image/"),
      isProof: PROOF_KINDS.has(kind),
    });
    docsByFreight.set(key, list);
  }
  const driverName = new Map(drivers.map((row) => [row.id as string, text(row.name)]));
  const productName = new Map(products.map((row) => [row.id as string, text(row.name)]));
  const litersBetween = (vehicleId: unknown, start?: string, end?: string) => {
    if (typeof vehicleId !== "string" || !start || !end) return undefined;
    const from = new Date(start).getTime();
    const to = new Date(end).getTime();
    const liters = fuel
      .filter((row) => row.vehicle_id === vehicleId)
      .filter((row) => {
        const at = new Date(row.recorded_at as string).getTime();
        return at >= from && at <= to;
      })
      .reduce((sum, row) => sum + Number(row.liters ?? 0), 0);
    return liters > 0 ? liters : undefined;
  };

  const freights: ShipperFreight[] = [];

  for (const vehicle of vehicles) {
    const carrier = carrierByTenant.get(vehicle.tenant_id as string);
    if (!carrier) continue;
    const freightId = vehicle.current_freight_id as string;
    const raw = eventsByFreight.get(freightId) ?? [];
    const status = publicStatus(text(vehicle.freight_stage), text(vehicle.status));
    const sender = allParties.get(vehicle.sender_id as string);
    const recipient = allParties.get(vehicle.recipient_id as string);
    const lat = num(vehicle.lat);
    const lng = num(vehicle.lng);
    const positionAt = text(vehicle.last_position_at);
    const fresh = !!positionAt && now - new Date(positionAt).getTime() < POSITION_MAX_AGE_MS;
    const delivered = status.step === "entregue";
    const deliveredEvent = raw.find(
      (event) => event.status && DELIVERED_STATUSES.has(event.status),
    );
    const stillUnloading = text(vehicle.status) === "parado-descarregando";
    freights.push({
      id: freightId,
      carrierId: carrier.id,
      carrierName: carrier.name,
      code: freightCode(vehicle.plate, vehicle.id),
      plate: String(vehicle.plate),
      driverFirstName: firstName(driverName.get(vehicle.driver_id as string)),
      driverProfileId: profileOf(vehicle.tenant_id, vehicle.driver_id),
      product: productName.get(vehicle.product_id as string),
      originName: text(sender?.name),
      origin: placeLabel(text(sender?.city), text(sender?.state)),
      destinationName: text(recipient?.name),
      destination: placeLabel(text(recipient?.city), text(recipient?.state)),
      role: mySenderIds.has(vehicle.sender_id as string) ? "remetente" : "destinatario",
      step: status.step,
      statusLabel: status.label,
      statusDetail: status.detail,
      occurrence: status.occurrence,
      finished: delivered,
      startedAt: raw[0]?.at,
      deliveredAt: delivered ? (deliveredEvent?.at ?? text(vehicle.last_transition_at)) : undefined,
      lastEventAt: raw[raw.length - 1]?.at ?? text(vehicle.last_transition_at),
      position:
        !delivered && lat !== undefined && lng !== undefined && fresh
          ? { lat, lng, at: positionAt, place: placeLabel(text(vehicle.city), text(vehicle.state)) }
          : undefined,
      tracked: !!text(vehicle.sascar_id) || fresh,
      events: publicEvents(raw),
      documents: docsByFreight.get(freightId) ?? [],
      loadingDwellMin: dwell(raw, "parado-aguardando-carga", new Set(["rota-descarregar"])),
      unloadingDwellMin: dwell(
        raw,
        "parado-descarregando",
        AFTER_UNLOAD_STATUSES,
        stillUnloading ? now : undefined,
      ),
    });
  }

  for (const row of history) {
    const carrier = carrierByTenant.get(row.tenant_id as string);
    if (!carrier) continue;
    const freightId = row.freight_id as string;
    const raw = eventsByFreight.get(freightId) ?? [];
    const delivered =
      publicStatus(text(row.final_freight_stage), text(row.final_status)).step === "entregue";
    const deliveredEvent = raw.find(
      (event) => event.status && DELIVERED_STATUSES.has(event.status),
    );
    const deliveredAt = delivered ? (deliveredEvent?.at ?? text(row.finished_at)) : undefined;
    const startedAt = text(row.started_at) ?? raw[0]?.at;
    const liters = litersBetween(row.vehicle_id, startedAt, text(row.finished_at));
    freights.push({
      id: freightId,
      carrierId: carrier.id,
      carrierName: carrier.name,
      code: freightCode(row.vehicle_plate, row.vehicle_id),
      plate: String(row.vehicle_plate ?? ""),
      driverFirstName: firstName(text(row.driver_name)),
      driverProfileId: profileOf(row.tenant_id, row.driver_id),
      product: text(row.product_name),
      originName: text(row.sender_name),
      origin: placeLabel(text(row.sender_city), text(row.sender_state)),
      destinationName: text(row.recipient_name),
      destination: placeLabel(text(row.recipient_city), text(row.recipient_state)),
      role: mySenderIds.has(row.sender_id as string) ? "remetente" : "destinatario",
      step: delivered ? "entregue" : "programado",
      statusLabel: delivered ? "Entregue" : "Frete encerrado",
      statusDetail: delivered ? undefined : "A transportadora encerrou este frete.",
      finished: true,
      cancelled: !delivered,
      startedAt,
      deliveredAt,
      lastEventAt: raw[raw.length - 1]?.at ?? text(row.finished_at),
      tracked: raw.length > 0,
      events: publicEvents(raw),
      documents: docsByFreight.get(freightId) ?? [],
      loadingDwellMin: dwell(raw, "parado-aguardando-carga", new Set(["rota-descarregar"])),
      unloadingDwellMin: dwell(
        raw,
        "parado-descarregando",
        AFTER_UNLOAD_STATUSES,
        text(row.finished_at) ? new Date(row.finished_at as string).getTime() : undefined,
      ),
      dieselLiters: liters,
      co2Kg: liters ? Math.round(liters * DIESEL_KG_CO2_PER_LITER) : undefined,
    });
  }

  freights.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? 1 : -1;
    return new Date(b.lastEventAt ?? 0).getTime() - new Date(a.lastEventAt ?? 0).getTime();
  });

  return { profile, carriers, freights, generatedAt: new Date(now).toISOString() };
}

/** Link temporario de um documento, so se ele pertence a uma carga visivel ao embarcador. */
export async function shipperDocumentUrl(session: ShipperSession, documentId: string) {
  const supabase = getSupabaseAdmin();
  const { data: doc } = await supabase
    .from("freight_documents")
    .select("id, tenant_id, freight_id, kind, storage_bucket, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || !isPublicDocumentKind(String(doc.kind)))
    throw new ShipperError("not_found", "Documento não encontrado.");
  const portal = await loadShipperPortal(session);
  const visible = portal.freights.some((freight) =>
    freight.documents.some((item) => item.id === documentId),
  );
  if (!visible) throw new ShipperError("forbidden", "Documento não disponível para sua empresa.");
  const { data } = await supabase.storage
    .from(String(doc.storage_bucket))
    .createSignedUrl(String(doc.storage_path), 60 * 10);
  if (!data?.signedUrl) throw new Error("signed url failed");
  return data.signedUrl;
}

// ---------------------------------------------------------------- Lado da transportadora

export interface TenantShipperLink {
  id: string;
  shipperName: string;
  shipperCnpj: string;
  status: CarrierStatus;
  invitedAt: string;
  respondedAt?: string;
}

async function tenantCnpj(tenantId: string) {
  const { data } = await getSupabaseAdmin()
    .from("tenants")
    .select("cnpj")
    .eq("id", tenantId)
    .maybeSingle();
  return onlyDigits(text(data?.cnpj));
}

export async function listTenantShipperLinks(tenantId: string): Promise<TenantShipperLink[]> {
  const supabase = getSupabaseAdmin();
  const cnpj = await tenantCnpj(tenantId);
  const filter = cnpj
    ? `tenant_id.eq.${tenantId},and(tenant_id.is.null,carrier_cnpj.eq.${cnpj})`
    : `tenant_id.eq.${tenantId}`;
  const { data } = await supabase
    .from("shipper_carriers")
    .select("id, status, invited_at, responded_at, shippers(legal_name, trade_name, cnpj)")
    .or(filter)
    .order("invited_at", { ascending: false });
  return ((data as Row[] | null) ?? []).map((row) => {
    const shipper = (row.shippers ?? {}) as Row;
    return {
      id: row.id as string,
      shipperName: text(shipper.trade_name) ?? text(shipper.legal_name) ?? "Embarcador",
      shipperCnpj: String(shipper.cnpj ?? ""),
      status: row.status as CarrierStatus,
      invitedAt: row.invited_at as string,
      respondedAt: text(row.responded_at),
    };
  });
}

export async function respondShipperLink(
  context: { tenantId: string; userId: string; isOwner: boolean },
  linkId: string,
  action: "aceitar" | "recusar" | "pausar",
) {
  if (!context.isOwner) {
    throw new ShipperError(
      "forbidden",
      "Só o responsável pela conta da transportadora pode decidir isso.",
    );
  }
  const links = await listTenantShipperLinks(context.tenantId);
  if (!links.some((link) => link.id === linkId))
    throw new ShipperError("not_found", "Convite não encontrado.");
  const status: CarrierStatus =
    action === "aceitar" ? "ativa" : action === "recusar" ? "recusada" : "pausada";
  const { error } = await getSupabaseAdmin()
    .from("shipper_carriers")
    .update({
      status,
      tenant_id: context.tenantId,
      responded_at: new Date().toISOString(),
      responded_by: context.userId,
      ...(status === "ativa" ? { invite_token_hash: null } : {}),
    })
    .eq("id", linkId);
  if (error) throw new Error(`respond failed: ${error.message}`);
  return { ok: true as const, status };
}

export async function inviteInfo(token: string) {
  if (!isWellFormedShareToken(token)) throw new ShipperError("not_found", "Convite inválido.");
  const { data } = await getSupabaseAdmin()
    .from("shipper_carriers")
    .select("id, carrier_name, status, shippers(legal_name, trade_name)")
    .eq("invite_token_hash", await hashShareToken(token))
    .maybeSingle();
  if (!data) throw new ShipperError("not_found", "Convite inválido ou já usado.");
  const shipper = ((data as Row).shippers ?? {}) as Row;
  return {
    id: data.id as string,
    carrierName: data.carrier_name as string,
    shipperName: text(shipper.trade_name) ?? text(shipper.legal_name) ?? "Embarcador",
    status: data.status as CarrierStatus,
  };
}

/** A transportadora logada na Frotak aceita pelo link do convite. */
export async function acceptInviteByToken(
  context: { tenantId: string; userId: string; isOwner: boolean },
  token: string,
) {
  const info = await inviteInfo(token);
  if (!context.isOwner) {
    throw new ShipperError(
      "forbidden",
      "Só o responsável pela conta da transportadora pode aceitar.",
    );
  }
  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("shipper_carriers")
    .select("shipper_id")
    .eq("id", info.id)
    .maybeSingle();
  const { data: other } = await supabase
    .from("shipper_carriers")
    .select("id")
    .eq("shipper_id", row?.shipper_id as string)
    .eq("tenant_id", context.tenantId)
    .neq("id", info.id)
    .maybeSingle();
  if (other)
    throw new ShipperError("exists", "Sua transportadora já está conectada a este embarcador.");
  const { error } = await supabase
    .from("shipper_carriers")
    .update({
      status: "ativa",
      tenant_id: context.tenantId,
      responded_at: new Date().toISOString(),
      responded_by: context.userId,
      invite_token_hash: null,
    })
    .eq("id", info.id);
  if (error) throw new Error(`accept failed: ${error.message}`);
  return { ok: true as const, shipperName: info.shipperName };
}
