import { getSupabaseAdmin } from "./supabase-admin.ts";
import {
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  placeLabel,
  publicStatus,
} from "../../src/lib/freightShare.ts";
import {
  DRIVER_DOC_LABELS,
  docStateFor,
  type DriverDocKind,
  type DriverRelation,
} from "../../src/lib/shipper/types.ts";
import type {
  DriverLinkAction,
  DriverLinkSummary,
  DriverLinkView,
  DriverExpenseCategory,
} from "../../src/lib/driverLink/types.ts";

// Link do motorista: uma pagina por viagem, aberta pelo WhatsApp, sem instalar app nem senha.
//
// - A transportadora cria o link no detalhe do frete (Central de Fretes).
// - O motorista e identificado pelo telefone: links diferentes caem no mesmo cadastro
//   (driver_network_profiles), entao o historico e o acerto somam entre viagens.
// - O que ele lanca vai para as tabelas que a transportadora ja usa (fuel_records e
//   freight_expenses), e cada acao fica em driver_link_events.
// - Ele ve so o proprio acerto (valor combinado, adiantamentos e o que pagou do bolso),
//   nunca o valor do frete nem o resultado da viagem para a transportadora.

type Row = Record<string, unknown>;

export class DriverLinkError extends Error {
  constructor(
    public code: "not_found" | "expired" | "invalid" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_DAYS = 20;
const EXPENSE_CATEGORIES: DriverExpenseCategory[] = [
  "pedagio",
  "alimentacao",
  "estacionamento",
  "manutencao",
  "outros",
];
const STATUS_LABELS: Record<string, string> = {
  chegou_origem: "Cheguei para carregar",
  carregado: "Carregado, saindo",
  chegou_destino: "Cheguei no destino",
  parada: "Parada",
  ocorrencia: "Ocorrência",
  entregue: "Descarga concluída",
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function money(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function linkUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/motorista/${token}`;
}

// ------------------------------------------------------------ Lado da transportadora

export async function createDriverTripLink(
  ctx: { tenantId: string; userId: string },
  input: {
    vehicleId: string;
    phone: string;
    relation: DriverRelation;
    payAmount?: number;
    days?: number;
  },
  origin: string,
): Promise<{ url: string; expiresAt: string; driverName: string }> {
  const supabase = getSupabaseAdmin();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, tenant_id, current_freight_id, driver_id")
    .eq("id", input.vehicleId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!vehicle) throw new DriverLinkError("not_found", "Veículo não encontrado.");
  if (!vehicle.current_freight_id)
    throw new DriverLinkError("invalid", "Este veículo não tem frete ativo.");
  if (!vehicle.driver_id)
    throw new DriverLinkError("invalid", "Escolha o motorista do frete antes de mandar o link.");

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, name, phone")
    .eq("id", vehicle.driver_id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!driver) throw new DriverLinkError("not_found", "Motorista não encontrado.");

  const phone = phoneDigits(input.phone || String(driver.phone ?? ""));
  if (!/^[0-9]{12,13}$/.test(phone))
    throw new DriverLinkError("invalid", "Informe o celular do motorista com DDD.");
  const relation: DriverRelation = ["frota", "agregado", "terceiro"].includes(input.relation)
    ? input.relation
    : "terceiro";

  // Cadastro unico do motorista: o telefone e a chave.
  const { data: existing } = await supabase
    .from("driver_network_profiles")
    .select("id")
    .eq("phone_digits", phone)
    .maybeSingle();
  let profileId = existing?.id as string | undefined;
  if (!profileId) {
    const { data: created, error } = await supabase
      .from("driver_network_profiles")
      .insert({ phone_digits: phone, full_name: String(driver.name) })
      .select("id")
      .single();
    if (error) throw error;
    profileId = created.id as string;
  }

  const { error: linkError } = await supabase
    .from("driver_network_links")
    .upsert(
      { tenant_id: ctx.tenantId, driver_id: driver.id, profile_id: profileId, relation },
      { onConflict: "tenant_id,driver_id" },
    );
  if (linkError) throw linkError;
  if (!driver.phone) await supabase.from("drivers").update({ phone }).eq("id", driver.id);

  const token = generateShareToken();
  const days = Math.min(Math.max(input.days ?? DEFAULT_DAYS, 1), 60);
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const pay = input.payAmount && input.payAmount > 0 ? money(input.payAmount) : null;
  const { error } = await supabase.from("driver_trip_links").insert({
    tenant_id: ctx.tenantId,
    vehicle_id: vehicle.id,
    freight_id: vehicle.current_freight_id,
    driver_id: driver.id,
    profile_id: profileId,
    token_hash: await hashShareToken(token),
    phone_digits: phone,
    driver_pay_amount: pay,
    expires_at: expiresAt,
    created_by: ctx.userId,
  });
  if (error) throw error;
  return { url: linkUrl(origin, token), expiresAt, driverName: String(driver.name) };
}

export async function listDriverTripLinks(
  ctx: { tenantId: string },
  vehicleId: string,
): Promise<DriverLinkSummary[]> {
  const supabase = getSupabaseAdmin();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("current_freight_id")
    .eq("id", vehicleId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!vehicle?.current_freight_id) return [];
  const { data: links } = await supabase
    .from("driver_trip_links")
    .select("id, phone_digits, driver_pay_amount, expires_at, revoked_at, last_seen_at, created_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("freight_id", vehicle.current_freight_id)
    .order("created_at", { ascending: false });
  const rows = (links as Row[] | null) ?? [];
  if (!rows.length) return [];
  const { data: events } = await supabase
    .from("driver_link_events")
    .select("link_id, kind, payload, created_at")
    .in(
      "link_id",
      rows.map((row) => row.id as string),
    )
    .order("created_at", { ascending: false })
    .limit(60);
  return rows.map((row) => ({
    id: row.id as string,
    phoneEnd: String(row.phone_digits).slice(-4),
    payAmount: row.driver_pay_amount === null ? undefined : money(row.driver_pay_amount),
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    revokedAt: text(row.revoked_at),
    lastSeenAt: text(row.last_seen_at),
    events: ((events as Row[] | null) ?? [])
      .filter((event) => event.link_id === row.id && event.kind !== "aberto")
      .slice(0, 8)
      .map((event) => ({
        kind: String(event.kind),
        label: eventLabel(String(event.kind), (event.payload as Row) ?? {}),
        at: event.created_at as string,
      })),
  }));
}

export async function revokeDriverTripLink(ctx: { tenantId: string }, linkId: string) {
  const { error } = await getSupabaseAdmin()
    .from("driver_trip_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("tenant_id", ctx.tenantId)
    .is("revoked_at", null);
  if (error) throw error;
}

function eventLabel(kind: string, payload: Row) {
  if (kind === "status") return STATUS_LABELS[String(payload.status)] ?? "Status";
  if (kind === "posicao") return "Posição enviada";
  if (kind === "abastecimento")
    return `Abasteceu ${Number(payload.liters ?? 0).toLocaleString("pt-BR")} L`;
  if (kind === "despesa") return `Despesa: ${String(payload.description ?? payload.category)}`;
  if (kind === "documento")
    return `Documento: ${DRIVER_DOC_LABELS[payload.kind as DriverDocKind] ?? ""}`;
  if (kind === "rede") return payload.optIn ? "Entrou na Rede Frotak" : "Saiu da Rede Frotak";
  return kind;
}

// ------------------------------------------------------------ Lado do motorista

async function resolveLink(token: string): Promise<Row> {
  if (!isWellFormedShareToken(token)) throw new DriverLinkError("not_found", "Link inválido.");
  const { data } = await getSupabaseAdmin()
    .from("driver_trip_links")
    .select("*")
    .eq("token_hash", await hashShareToken(token))
    .maybeSingle();
  if (!data) throw new DriverLinkError("not_found", "Link inválido.");
  if (data.revoked_at || new Date(data.expires_at as string).getTime() < Date.now()) {
    throw new DriverLinkError("expired", "Este link já foi encerrado pela transportadora.");
  }
  return data as Row;
}

async function logEvent(link: Row, kind: string, payload: Row = {}) {
  await getSupabaseAdmin().from("driver_link_events").insert({
    link_id: link.id,
    tenant_id: link.tenant_id,
    freight_id: link.freight_id,
    kind,
    payload,
  });
}

async function settlementOf(link: Row) {
  const supabase = getSupabaseAdmin();
  const [{ data: cash }, { data: expenses }] = await Promise.all([
    supabase
      .from("freight_cash_entries")
      .select("amount, origin, recorded_at")
      .eq("tenant_id", link.tenant_id as string)
      .eq("freight_id", link.freight_id as string),
    supabase
      .from("freight_expenses")
      .select("id, category, description, amount, recorded_at, source")
      .eq("tenant_id", link.tenant_id as string)
      .eq("freight_id", link.freight_id as string)
      .eq("driver_id", link.driver_id as string)
      .eq("source", "driver_app")
      .order("recorded_at", { ascending: false }),
  ]);
  const advances = ((cash as Row[] | null) ?? []).reduce((sum, row) => sum + money(row.amount), 0);
  const expenseRows = (expenses as Row[] | null) ?? [];
  const reimbursable = expenseRows.reduce((sum, row) => sum + money(row.amount), 0);
  const pay = link.driver_pay_amount === null ? undefined : money(link.driver_pay_amount);
  return {
    pay,
    advances: money(advances),
    reimbursable: money(reimbursable),
    balance: money((pay ?? 0) + reimbursable - advances),
    expenses: expenseRows.map((row) => ({
      id: row.id as string,
      category: String(row.category),
      description: String(row.description),
      amount: money(row.amount),
      at: row.recorded_at as string,
    })),
  };
}

export async function loadDriverLinkView(token: string): Promise<DriverLinkView> {
  const link = await resolveLink(token);
  const supabase = getSupabaseAdmin();
  const tenantId = link.tenant_id as string;

  const [{ data: vehicle }, { data: tenant }, { data: profile }, { data: docs }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "id, plate, current_freight_id, freight_stage, status, sender_id, recipient_id, product_id, sascar_id, lat, lng, last_position_at",
        )
        .eq("id", link.vehicle_id as string)
        .maybeSingle(),
      supabase.from("tenants").select("trade_name, legal_name").eq("id", tenantId).maybeSingle(),
      supabase
        .from("driver_network_profiles")
        .select(
          "full_name, network_opt_in, vehicle_kind, base_city, base_state, available_from, available_note",
        )
        .eq("id", link.profile_id as string)
        .maybeSingle(),
      supabase
        .from("driver_network_documents")
        .select("kind, number_hint, expires_at")
        .eq("profile_id", link.profile_id as string),
    ]);
  if (!vehicle) throw new DriverLinkError("not_found", "Viagem não encontrada.");
  const active = vehicle.current_freight_id === link.freight_id;

  const [{ data: sender }, { data: recipient }, { data: product }] = await Promise.all([
    vehicle.sender_id
      ? supabase
          .from("senders")
          .select("name, city, state")
          .eq("id", vehicle.sender_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    vehicle.recipient_id
      ? supabase
          .from("recipients")
          .select("name, city, state")
          .eq("id", vehicle.recipient_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    vehicle.product_id
      ? supabase.from("products").select("name").eq("id", vehicle.product_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Abastecimentos deste motorista neste caminhao desde o inicio do link.
  const { data: fuelRows } = await supabase
    .from("fuel_records")
    .select("id, station, liters, amount, odometer, recorded_at")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", vehicle.id as string)
    .gte(
      "recorded_at",
      new Date(new Date(link.created_at as string).getTime() - 3 * 86_400_000).toISOString(),
    )
    .order("recorded_at", { ascending: true });
  const fuel = ((fuelRows as Row[] | null) ?? []).map((row, index, all) => {
    const prev = all[index - 1];
    const km = prev ? Number(row.odometer) - Number(prev.odometer) : 0;
    const liters = Number(row.liters);
    return {
      id: row.id as string,
      station: String(row.station),
      liters,
      amount: money(row.amount),
      odometer: Number(row.odometer),
      at: row.recorded_at as string,
      kmPerLiter: prev && km > 0 && liters > 0 ? Math.round((km / liters) * 100) / 100 : undefined,
    };
  });
  const fleetAvg = await averageKmPerLiter(tenantId, vehicle.id as string);

  // Acerto desta viagem e das anteriores com a mesma transportadora.
  const current = await settlementOf(link);
  const { data: otherLinks } = await supabase
    .from("driver_trip_links")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("profile_id", link.profile_id as string)
    .neq("freight_id", link.freight_id as string)
    .order("created_at", { ascending: false })
    .limit(6);
  const seen = new Set<string>();
  const previous = [];
  for (const other of (otherLinks as Row[] | null) ?? []) {
    if (seen.has(other.freight_id as string)) continue;
    seen.add(other.freight_id as string);
    const s = await settlementOf(other);
    previous.push({
      freightId: other.freight_id as string,
      date: other.created_at as string,
      balance: s.balance,
      pay: s.pay,
    });
  }

  await supabase
    .from("driver_trip_links")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", link.id as string);
  const status = publicStatus(text(vehicle.freight_stage), text(vehicle.status));
  const docMap = new Map(((docs as Row[] | null) ?? []).map((row) => [row.kind as string, row]));

  return {
    driverName: String(profile?.full_name ?? "Motorista").split(" ")[0],
    carrierName: String(tenant?.trade_name || tenant?.legal_name || "Transportadora"),
    plate: String(vehicle.plate),
    active,
    step: status.step,
    statusLabel: status.label,
    product: text(product?.name),
    origin: {
      name: text(sender?.name),
      place: placeLabel(text(sender?.city), text(sender?.state)),
    },
    destination: {
      name: text(recipient?.name),
      place: placeLabel(text(recipient?.city), text(recipient?.state)),
    },
    hasTracker: !!text(vehicle.sascar_id),
    lastPositionAt: text(vehicle.last_position_at),
    expiresAt: link.expires_at as string,
    fuel,
    fleetKmPerLiter: fleetAvg,
    settlement: { ...current, previous },
    documents: (["cnh", "rntrc", "seguro", "crlv", "gr"] as DriverDocKind[]).map((kind) => {
      const row = docMap.get(kind);
      const expiresAt = text(row?.expires_at);
      return {
        kind,
        label: DRIVER_DOC_LABELS[kind],
        numberHint: text(row?.number_hint),
        expiresAt,
        state: row ? (expiresAt ? docStateFor(expiresAt) : "ok") : "faltando",
        informedBy: "motorista" as const,
      };
    }),
    network: {
      optIn: profile?.network_opt_in === true,
      vehicleKind: text(profile?.vehicle_kind),
      city: text(profile?.base_city),
      state: text(profile?.base_state),
      availableFrom: text(profile?.available_from),
      availableNote: text(profile?.available_note),
    },
  };
}

async function averageKmPerLiter(tenantId: string, vehicleId: string) {
  const { data } = await getSupabaseAdmin()
    .from("fuel_records")
    .select("liters, odometer, recorded_at")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", vehicleId)
    .gt("odometer", 0)
    .order("recorded_at", { ascending: false })
    .limit(30);
  const rows = ((data as Row[] | null) ?? []).reverse();
  if (rows.length < 2) return undefined;
  const km = Number(rows[rows.length - 1].odometer) - Number(rows[0].odometer);
  const liters = rows.slice(1).reduce((sum, row) => sum + Number(row.liters), 0);
  return km > 0 && liters > 0 ? Math.round((km / liters) * 100) / 100 : undefined;
}

export async function runDriverLinkAction(token: string, action: DriverLinkAction) {
  const link = await resolveLink(token);
  const supabase = getSupabaseAdmin();
  const base = {
    tenant_id: link.tenant_id,
    vehicle_id: link.vehicle_id,
    driver_id: link.driver_id,
  };

  if (action.type === "status") {
    if (!STATUS_LABELS[action.status]) throw new DriverLinkError("invalid", "Status inválido.");
    await logEvent(link, "status", { status: action.status, note: action.note?.slice(0, 300) });
    return { ok: true as const, message: "Status enviado para a transportadora." };
  }

  if (action.type === "posicao") {
    const { lat, lng } = action;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      throw new DriverLinkError("invalid", "Posição inválida.");
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("sascar_id, current_freight_id")
      .eq("id", link.vehicle_id as string)
      .maybeSingle();
    if (vehicle?.current_freight_id !== link.freight_id)
      throw new DriverLinkError("expired", "Esta viagem já foi encerrada.");
    await supabase.from("vehicle_positions").insert({
      tenant_id: link.tenant_id,
      vehicle_id: link.vehicle_id,
      lat,
      lng,
      source: "driver_link",
    });
    // Rastreador de verdade manda mais: o celular so atualiza quem nao tem.
    if (!vehicle?.sascar_id) {
      await supabase
        .from("vehicles")
        .update({ lat, lng, last_position_at: new Date().toISOString() })
        .eq("id", link.vehicle_id as string);
    }
    await logEvent(link, "posicao", {});
    return { ok: true as const, message: "Posição enviada." };
  }

  if (action.type === "abastecimento") {
    const liters = Number(action.liters);
    const amount = money(action.amount);
    const odometer = Number(action.odometer);
    if (!(liters > 0 && liters < 2000)) throw new DriverLinkError("invalid", "Informe os litros.");
    if (!(amount > 0)) throw new DriverLinkError("invalid", "Informe o valor.");
    if (!(odometer > 0)) throw new DriverLinkError("invalid", "Informe o km do painel.");
    const station = (action.station || "Posto").trim().slice(0, 120);
    const [{ data: vehicle }, { data: driver }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("plate")
        .eq("id", link.vehicle_id as string)
        .maybeSingle(),
      supabase
        .from("drivers")
        .select("name")
        .eq("id", link.driver_id as string)
        .maybeSingle(),
    ]);
    const { data: record, error } = await supabase
      .from("fuel_records")
      .insert({
        ...base,
        vehicle_plate: String(vehicle?.plate ?? ""),
        driver_name: text(driver?.name),
        station,
        fuel_type: action.fuelType === "arla" ? "arla" : "diesel_s10",
        liters,
        amount,
        odometer,
        notes: "Lançado pelo link do motorista",
        recorded_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    if (action.paidByDriver) {
      const { error: expenseError } = await supabase.from("freight_expenses").insert({
        ...base,
        freight_id: link.freight_id,
        fuel_record_id: record.id,
        category: action.fuelType === "arla" ? "arla" : "diesel_s10",
        description: `Abastecimento em ${station}`,
        amount,
        notes: "Pago pelo motorista (link)",
        source: "driver_app",
      });
      if (expenseError) throw expenseError;
    }
    await logEvent(link, "abastecimento", { liters, amount, odometer, station });
    return { ok: true as const, message: "Abastecimento salvo." };
  }

  if (action.type === "despesa") {
    const amount = money(action.amount);
    if (!(amount > 0)) throw new DriverLinkError("invalid", "Informe o valor.");
    const category = EXPENSE_CATEGORIES.includes(action.category) ? action.category : "outros";
    const description = (action.description || category).trim().slice(0, 120);
    const { error } = await supabase.from("freight_expenses").insert({
      ...base,
      freight_id: link.freight_id,
      category,
      description,
      amount,
      notes: "Lançado pelo link do motorista",
      source: "driver_app",
    });
    if (error) throw error;
    await logEvent(link, "despesa", { category, description, amount });
    return { ok: true as const, message: "Despesa lançada." };
  }

  if (action.type === "documento") {
    if (!DRIVER_DOC_LABELS[action.kind])
      throw new DriverLinkError("invalid", "Documento inválido.");
    if (action.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(action.expiresAt))
      throw new DriverLinkError("invalid", "Data de validade inválida.");
    const hint = action.number?.replace(/\s/g, "").slice(-4) || null;
    const { error } = await supabase.from("driver_network_documents").upsert(
      {
        profile_id: link.profile_id,
        kind: action.kind,
        number_hint: hint,
        expires_at: action.expiresAt || null,
        informed_by: "motorista",
        verified_at: null,
      },
      { onConflict: "profile_id,kind" },
    );
    if (error) throw error;
    await logEvent(link, "documento", { kind: action.kind });
    return { ok: true as const, message: "Documento atualizado." };
  }

  if (action.type === "rede") {
    const { error } = await supabase
      .from("driver_network_profiles")
      .update({
        network_opt_in: action.optIn,
        network_opt_in_at: action.optIn ? new Date().toISOString() : null,
        vehicle_kind: action.vehicleKind?.slice(0, 60) || null,
        base_city: action.city?.slice(0, 80) || null,
        base_state: action.state?.toUpperCase().slice(0, 2) || null,
        available_from: action.availableFrom || null,
        available_note: action.availableNote?.slice(0, 120) || null,
      })
      .eq("id", link.profile_id as string);
    if (error) throw error;
    await logEvent(link, "rede", { optIn: action.optIn });
    return {
      ok: true as const,
      message: action.optIn ? "Você entrou na Rede Frotak." : "Você saiu da Rede Frotak.",
    };
  }

  throw new DriverLinkError("invalid", "Ação inválida.");
}

export async function markDriverLinkOpened(token: string) {
  try {
    const link = await resolveLink(token);
    await logEvent(link, "aberto");
  } catch {
    // abrir um link invalido nao gera registro
  }
}
