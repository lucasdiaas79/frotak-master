import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.1-flash-lite";
export const FROTAK_AI_VOICE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

const FROTAK_AI_KNOWLEDGE_BASE = `
RELATORIO BASE DA FROTAK IA

Voce e a Frotak IA, assistente operacional da plataforma Frotak.
Sua funcao nesta etapa e consultar, explicar e gerar insights. Voce nao executa alteracoes no sistema e nao altera o banco.

Voce pode responder sobre:
- dados gerais do tenant autenticado
- frota, placas, status, situacao e etapa operacional
- motoristas, vinculos e disponibilidade
- implementos e modelos
- remetentes, embarcadores, destinatarios e produtos
- fretes ativos e historico de fretes
- faturamento de hoje, ontem, mes atual e periodo carregado
- despesas de hoje, ontem, mes atual e periodo carregado
- lucro estimado por frete, placa, embarcador e destinatario quando os dados existirem
- localizacao dos caminhoes usando a ultima posicao conhecida do rastreador/Sascar salva no sistema
- clientes ou locais com coordenadas pendentes
- rankings e alertas operacionais

Regras obrigatorias:
- Use exclusivamente o contexto do tenant autenticado.
- Nunca misture dados entre tenants.
- Nunca invente numeros, placas, motoristas, localizacoes, valores ou status.
- Se a informacao nao estiver no contexto, diga que nao encontrou essa informacao nesta consulta.
- Para faturamento, considere fretes finalizados no historico como receita registrada.
- Para fretes ativos, trate o valor como valor em andamento ou previsto, nao como faturamento concluido.
- Para lucro, use valor do frete menos despesas registradas. Se faltar dado, explique a limitacao.
- Para localizacao, use cidade, UF, latitude, longitude, velocidade e horario da ultima posicao disponivel.
- Nunca mostre tokens, refresh tokens, senhas, chaves, service role, anon key ou segredos.
- Nao use asteriscos para formatacao.
- Use quebras de linha, topicos e emojis com moderacao quando melhorar a leitura.
`.trim();

type FrotakAiMessage = {
  role: "assistant" | "user";
  text: string;
};

type TenantAiContext = {
  tenant: {
    id: string;
    name: string;
    workspaceId: string;
    workspaceName: string;
    userId: string;
  };
  generatedAt: string;
  totals: {
    vehicles: number;
    drivers: number;
    trailers: number;
    senders: number;
    recipients: number;
    products: number;
    activeFreights: number;
    freightHistory: number;
    fuelRecords: number;
    freightExpenses: number;
    trackerPositions: number;
  };
  financialSummary: {
    timezone: string;
    today: string;
    yesterday: string;
    revenueToday: number;
    revenueYesterday: number;
    revenueCurrentMonth: number;
    revenueLoaded: number;
    activeFreightValue: number;
    expensesToday: number;
    expensesYesterday: number;
    expensesCurrentMonth: number;
    expensesLoaded: number;
    estimatedProfitToday: number;
    estimatedProfitYesterday: number;
    estimatedProfitCurrentMonth: number;
    estimatedProfitLoaded: number;
  };
  rankings: {
    vehiclesByRevenue: Array<Record<string, unknown>>;
    vehiclesByEstimatedProfit: Array<Record<string, unknown>>;
    sendersByRevenue: Array<Record<string, unknown>>;
    recipientsByRevenue: Array<Record<string, unknown>>;
  };
  tracker: {
    lastSyncAt?: string;
    syncedVehicles?: number;
    packetsApplied?: number;
    positions: Array<Record<string, unknown>>;
  };
  fleetByStatus: Record<string, number>;
  fleetBySituation: Record<string, number>;
  activeFreights: Array<Record<string, unknown>>;
  vehicles: Array<Record<string, unknown>>;
  drivers: Array<Record<string, unknown>>;
  trailers: Array<Record<string, unknown>>;
  senders: Array<Record<string, unknown>>;
  recipients: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  recentFreights: Array<Record<string, unknown>>;
  recentFuelRecords: Array<Record<string, unknown>>;
  recentExpenses: Array<Record<string, unknown>>;
};

type WorkspaceContext = {
  actorUserId: string;
  workspaceId: string;
  tenantId: string;
  workspaceName: string;
  tenantName: string;
};

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada");
  return key;
}

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getSupabaseAdmin() {
  return createClient(
    readEnv("SUPABASE_URL") || requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("API key")) return "Chave Gemini invalida ou nao autorizada.";
  if (message.includes("not found")) return "Modelo Gemini nao encontrado ou indisponivel.";
  return "Nao foi possivel concluir a conversa com a Frotak IA.";
}

function historyToContents(messages: FrotakAiMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.text }],
  }));
}

function sanitizeAiResponse(text: string) {
  return text.replace(/\*/g, "").trim();
}

function looksLikeEnglishInternalAnswer(text: string) {
  return /\b(analyzing|identifying|pinpointing|locating|focusing|refining|examining|cross-referencing|initial scan|revealed|good lead|i'?m|i will|i have|i'?ve|therefore|ranking|proxy|context|requested|confirm)\b/i.test(
    text,
  );
}

async function ensurePortugueseFinalAnswer(ai: GoogleGenAI, model: string, text: string) {
  const cleanText = sanitizeAiResponse(text);
  if (!looksLikeEnglishInternalAnswer(cleanText)) return cleanText;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Reescreva a resposta abaixo em portugues do Brasil.",
              "Remova qualquer raciocinio interno, planejamento, analise em ingles ou explicacao de bastidores.",
              "Entregue apenas a resposta final para o usuario da Frotak.",
              "Use paragrafos curtos e topicos quando fizer sentido.",
              "Nao use asteriscos.",
              "",
              cleanText,
            ].join("\n"),
          },
        ],
      },
    ],
    config: {
      temperature: 0.1,
    },
  });

  return sanitizeAiResponse(response.text ?? cleanText);
}

function compactText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function compactNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function money(value: unknown) {
  return compactNumber(value) ?? 0;
}

function dateKey(value: unknown, timeZone = "America/Sao_Paulo") {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function monthKey(value: unknown, timeZone = "America/Sao_Paulo") {
  return dateKey(value, timeZone)?.slice(0, 7);
}

function yesterdayKey(timeZone = "America/Sao_Paulo") {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date.toISOString(), timeZone) ?? "";
}

function sumByDate<T extends Record<string, unknown>>(
  rows: T[],
  dateField: keyof T,
  amountField: keyof T,
  targetDate: string,
) {
  return rows.reduce((total, row) => {
    if (dateKey(row[dateField]) !== targetDate) return total;
    return total + money(row[amountField]);
  }, 0);
}

function sumByMonth<T extends Record<string, unknown>>(
  rows: T[],
  dateField: keyof T,
  amountField: keyof T,
  targetMonth: string,
) {
  return rows.reduce((total, row) => {
    if (monthKey(row[dateField]) !== targetMonth) return total;
    return total + money(row[amountField]);
  }, 0);
}

function sumAll<T extends Record<string, unknown>>(rows: T[], amountField: keyof T) {
  return rows.reduce((total, row) => total + money(row[amountField]), 0);
}

function topRankings(rows: Map<string, Record<string, unknown>>, amountKey: string, limit = 10) {
  return [...rows.values()]
    .sort((a, b) => money(b[amountKey]) - money(a[amountKey]))
    .slice(0, limit);
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = compactText(row[key]) ?? "sem-informacao";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function latestByVehicle(positions: Array<Record<string, unknown>>) {
  const latest = new Map<string, Record<string, unknown>>();
  positions.forEach((position) => {
    const vehicleId = compactText(position.vehicle_id);
    if (!vehicleId || latest.has(vehicleId)) return;
    latest.set(vehicleId, position);
  });
  return latest;
}

function byId<T extends { id?: string }>(rows: T[]) {
  return new Map(rows.filter((row) => row.id).map((row) => [row.id!, row]));
}

function relationName<T extends { id?: string; name?: string }>(map: Map<string, T>, id: unknown) {
  return compactText(id) ? map.get(String(id))?.name : undefined;
}

async function safeTenantRows<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  select: string,
  tenantId: string,
  options: { orderBy?: string; ascending?: boolean; limit?: number } = {},
) {
  let query = supabase.from(table).select(select).eq("tenant_id", tenantId);
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? true });
  }
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error("[frotakAi] tenant context query failed", {
      table,
      code: error.code,
      message: error.message,
    });
    return [] as T[];
  }

  return (data ?? []) as T[];
}

async function getTrackerSyncState(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from("integration_sync_state")
    .select("synced_at, metadata")
    .eq("integration", "sascar")
    .eq("scope", "positions")
    .maybeSingle();

  if (error) {
    console.error("[frotakAi] tracker sync state failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  const row = data as {
    synced_at?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  const metadata = row?.metadata ?? {};
  return {
    lastSyncAt: compactText(row?.synced_at),
    syncedVehicles: compactNumber(metadata.syncedVehicles ?? metadata.packetsApplied),
    packetsApplied: compactNumber(metadata.packetsApplied),
  };
}

async function resolveWorkspaceContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  accessToken: string,
): Promise<WorkspaceContext> {
  if (!compactText(accessToken)) throw new Error("Sessao expirada.");

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError) throw new Error(`auth.getUser: ${authError.message}`);
  if (!authData.user) throw new Error("Usuario autenticado ausente.");

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("id, workspace_id, status, is_owner, created_at")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (membershipError) throw new Error(`workspace_memberships: ${membershipError.message}`);
  const membership = memberships?.[0] as { workspace_id?: string } | undefined;
  if (!membership?.workspace_id) throw new Error("Membership ativa ausente.");

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, tenant_id, name, status")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (workspaceError) throw new Error(`workspaces: ${workspaceError.message}`);
  const workspaceRow = workspace as {
    id: string;
    tenant_id: string;
    name?: string | null;
    status?: string | null;
  } | null;
  if (!workspaceRow?.tenant_id) throw new Error("Workspace ausente.");
  if (workspaceRow.status && workspaceRow.status !== "active") {
    throw new Error("Workspace inativo.");
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, legal_name, trade_name, status")
    .eq("id", workspaceRow.tenant_id)
    .maybeSingle();

  if (tenantError) throw new Error(`tenants: ${tenantError.message}`);
  const tenantRow = tenant as {
    id: string;
    legal_name?: string | null;
    trade_name?: string | null;
    status?: string | null;
  } | null;
  if (!tenantRow) throw new Error("Tenant ausente.");
  if (tenantRow.status && !["active", "trial"].includes(tenantRow.status)) {
    throw new Error("Tenant inativo.");
  }

  return {
    actorUserId: authData.user.id,
    workspaceId: workspaceRow.id,
    tenantId: workspaceRow.tenant_id,
    workspaceName: workspaceRow.name || "Workspace",
    tenantName: tenantRow.trade_name || tenantRow.legal_name || workspaceRow.name || "Tenant",
  };
}

async function buildTenantAiContext(accessToken: string): Promise<TenantAiContext> {
  const supabase = getSupabaseAdmin();
  const context = await resolveWorkspaceContext(supabase, accessToken);

  const [
    vehicles,
    drivers,
    trailers,
    senders,
    recipients,
    products,
    freightHistory,
    fuelRecords,
    freightExpenses,
    trackerPositions,
    trackerSyncState,
  ] = await Promise.all([
    safeTenantRows(supabase, "vehicles", "*", context.tenantId, {
      orderBy: "plate",
      limit: 1000,
    }),
    safeTenantRows(
      supabase,
      "drivers",
      "id, name, phone, active, vehicle_id, fleet_seq, partner_role",
      context.tenantId,
      {
        orderBy: "name",
        limit: 1000,
      },
    ),
    safeTenantRows(
      supabase,
      "trailers",
      "id, identifier, type, implement_type, implement_model, vehicle_id, fleet_seq",
      context.tenantId,
      { orderBy: "identifier", limit: 1000 },
    ),
    safeTenantRows(
      supabase,
      "senders",
      "id, name, city, state, address, location_label, location_source, lat, lng, active",
      context.tenantId,
      { orderBy: "name", limit: 1000 },
    ),
    safeTenantRows(
      supabase,
      "recipients",
      "id, name, city, state, address, location_label, location_source, lat, lng, active",
      context.tenantId,
      { orderBy: "name", limit: 1000 },
    ),
    safeTenantRows(supabase, "products", "id, name, active", context.tenantId, {
      orderBy: "name",
      limit: 1000,
    }),
    safeTenantRows(supabase, "freight_history", "*", context.tenantId, {
      orderBy: "finished_at",
      ascending: false,
      limit: 1000,
    }),
    safeTenantRows(supabase, "fuel_records", "*", context.tenantId, {
      orderBy: "recorded_at",
      ascending: false,
      limit: 1000,
    }),
    safeTenantRows(supabase, "freight_expenses", "*", context.tenantId, {
      orderBy: "recorded_at",
      ascending: false,
      limit: 1000,
    }),
    safeTenantRows(
      supabase,
      "vehicle_positions",
      "id, vehicle_id, lat, lng, city, state, speed, direction, source, recorded_at",
      context.tenantId,
      {
        orderBy: "recorded_at",
        ascending: false,
        limit: 1000,
      },
    ),
    getTrackerSyncState(supabase),
  ]);

  const driverById = byId(
    drivers.map((driver) => ({
      id: compactText(driver.id),
      name: compactText(driver.name),
    })),
  );
  const trailerById = byId(
    trailers.map((trailer) => ({
      id: compactText(trailer.id),
      name:
        compactText(trailer.implement_model) ||
        compactText(trailer.identifier) ||
        compactText(trailer.type),
    })),
  );
  const senderById = byId(
    senders.map((sender) => ({ id: compactText(sender.id), name: compactText(sender.name) })),
  );
  const recipientById = byId(
    recipients.map((recipient) => ({
      id: compactText(recipient.id),
      name: compactText(recipient.name),
    })),
  );
  const productById = byId(
    products.map((product) => ({ id: compactText(product.id), name: compactText(product.name) })),
  );
  const activeFreights = vehicles.filter((vehicle) => compactText(vehicle.current_freight_id));
  const latestPositions = latestByVehicle(trackerPositions);
  const vehicleById = byId(
    vehicles.map((vehicle) => ({
      id: compactText(vehicle.id),
      plate: compactText(vehicle.plate),
      driver: relationName(driverById, vehicle.driver_id),
    })),
  );
  const today = dateKey(new Date().toISOString()) ?? "";
  const yesterday = yesterdayKey();
  const currentMonth = monthKey(new Date().toISOString()) ?? "";
  const revenueToday = sumByDate(freightHistory, "finished_at", "freight_value", today);
  const revenueYesterday = sumByDate(freightHistory, "finished_at", "freight_value", yesterday);
  const revenueCurrentMonth = sumByMonth(
    freightHistory,
    "finished_at",
    "freight_value",
    currentMonth,
  );
  const revenueLoaded = sumAll(freightHistory, "freight_value");
  const activeFreightValue = sumAll(activeFreights, "freight_value");
  const expensesToday = sumByDate(freightExpenses, "recorded_at", "amount", today);
  const expensesYesterday = sumByDate(freightExpenses, "recorded_at", "amount", yesterday);
  const expensesCurrentMonth = sumByMonth(freightExpenses, "recorded_at", "amount", currentMonth);
  const expensesLoaded = sumAll(freightExpenses, "amount");
  const vehicleRevenue = new Map<string, Record<string, unknown>>();
  const vehicleProfit = new Map<string, Record<string, unknown>>();
  const senderRevenue = new Map<string, Record<string, unknown>>();
  const recipientRevenue = new Map<string, Record<string, unknown>>();

  freightHistory.forEach((freight) => {
    const plate = compactText(freight.vehicle_plate) ?? "Sem placa";
    const revenue = money(freight.freight_value);
    const vehicleRow = vehicleRevenue.get(plate) ?? {
      plate,
      driver: compactText(freight.driver_name),
      revenue: 0,
      freights: 0,
    };
    vehicleRow.revenue = money(vehicleRow.revenue) + revenue;
    vehicleRow.freights = money(vehicleRow.freights) + 1;
    vehicleRevenue.set(plate, vehicleRow);

    const profitRow = vehicleProfit.get(plate) ?? {
      plate,
      driver: compactText(freight.driver_name),
      revenue: 0,
      expenses: 0,
      estimatedProfit: 0,
    };
    profitRow.revenue = money(profitRow.revenue) + revenue;
    profitRow.estimatedProfit = money(profitRow.revenue) - money(profitRow.expenses);
    vehicleProfit.set(plate, profitRow);

    const sender = compactText(freight.sender_name) ?? "Sem embarcador";
    const senderRow = senderRevenue.get(sender) ?? { sender, revenue: 0, freights: 0 };
    senderRow.revenue = money(senderRow.revenue) + revenue;
    senderRow.freights = money(senderRow.freights) + 1;
    senderRevenue.set(sender, senderRow);

    const recipient = compactText(freight.recipient_name) ?? "Sem destinatario";
    const recipientRow = recipientRevenue.get(recipient) ?? { recipient, revenue: 0, freights: 0 };
    recipientRow.revenue = money(recipientRow.revenue) + revenue;
    recipientRow.freights = money(recipientRow.freights) + 1;
    recipientRevenue.set(recipient, recipientRow);
  });

  freightExpenses.forEach((expense) => {
    const vehicle = vehicleById.get(String(expense.vehicle_id ?? ""));
    const plate = compactText(vehicle?.plate) ?? compactText(expense.vehicle_plate) ?? "Sem placa";
    const profitRow = vehicleProfit.get(plate) ?? {
      plate,
      driver: compactText(vehicle?.driver),
      revenue: 0,
      expenses: 0,
      estimatedProfit: 0,
    };
    profitRow.expenses = money(profitRow.expenses) + money(expense.amount);
    profitRow.estimatedProfit = money(profitRow.revenue) - money(profitRow.expenses);
    vehicleProfit.set(plate, profitRow);
  });

  return {
    tenant: {
      id: context.tenantId,
      name: context.tenantName,
      workspaceId: context.workspaceId,
      workspaceName: context.workspaceName,
      userId: context.actorUserId,
    },
    generatedAt: new Date().toISOString(),
    totals: {
      vehicles: vehicles.length,
      drivers: drivers.length,
      trailers: trailers.length,
      senders: senders.length,
      recipients: recipients.length,
      products: products.length,
      activeFreights: activeFreights.length,
      freightHistory: freightHistory.length,
      fuelRecords: fuelRecords.length,
      freightExpenses: freightExpenses.length,
      trackerPositions: trackerPositions.length,
    },
    financialSummary: {
      timezone: "America/Sao_Paulo",
      today,
      yesterday,
      revenueToday,
      revenueYesterday,
      revenueCurrentMonth,
      revenueLoaded,
      activeFreightValue,
      expensesToday,
      expensesYesterday,
      expensesCurrentMonth,
      expensesLoaded,
      estimatedProfitToday: revenueToday - expensesToday,
      estimatedProfitYesterday: revenueYesterday - expensesYesterday,
      estimatedProfitCurrentMonth: revenueCurrentMonth - expensesCurrentMonth,
      estimatedProfitLoaded: revenueLoaded - expensesLoaded,
    },
    rankings: {
      vehiclesByRevenue: topRankings(vehicleRevenue, "revenue"),
      vehiclesByEstimatedProfit: topRankings(vehicleProfit, "estimatedProfit"),
      sendersByRevenue: topRankings(senderRevenue, "revenue"),
      recipientsByRevenue: topRankings(recipientRevenue, "revenue"),
    },
    tracker: {
      lastSyncAt: trackerSyncState?.lastSyncAt,
      syncedVehicles: trackerSyncState?.syncedVehicles,
      packetsApplied: trackerSyncState?.packetsApplied,
      positions: vehicles.slice(0, 180).map((vehicle) => {
        const latestPosition = latestPositions.get(String(vehicle.id));
        const lat = compactNumber(latestPosition?.lat) ?? compactNumber(vehicle.lat);
        const lng = compactNumber(latestPosition?.lng) ?? compactNumber(vehicle.lng);
        return {
          plate: compactText(vehicle.plate),
          driver: relationName(driverById, vehicle.driver_id),
          city: compactText(latestPosition?.city) ?? compactText(vehicle.city),
          state: compactText(latestPosition?.state) ?? compactText(vehicle.state),
          lat,
          lng,
          speed: compactNumber(latestPosition?.speed),
          direction: compactText(latestPosition?.direction),
          source:
            compactText(latestPosition?.source) ??
            (compactText(vehicle.sascar_id) ? "sascar" : undefined),
          sascarId: compactText(vehicle.sascar_id),
          recordedAt:
            compactText(latestPosition?.recorded_at) ?? compactText(vehicle.last_position_at),
        };
      }),
    },
    fleetByStatus: countBy(vehicles, "status"),
    fleetBySituation: countBy(vehicles, "vehicle_situation"),
    activeFreights: activeFreights.slice(0, 120).map((vehicle) => {
      const latestPosition = latestPositions.get(String(vehicle.id));
      const city = compactText(latestPosition?.city) ?? compactText(vehicle.city);
      const state = compactText(latestPosition?.state) ?? compactText(vehicle.state);
      return {
        freightId: compactText(vehicle.current_freight_id),
        plate: compactText(vehicle.plate),
        status: compactText(vehicle.status),
        stage: compactText(vehicle.freight_stage),
        situation: compactText(vehicle.vehicle_situation),
        driver: relationName(driverById, vehicle.driver_id),
        implement: relationName(trailerById, vehicle.trailer_id),
        sender: relationName(senderById, vehicle.sender_id),
        recipient: relationName(recipientById, vehicle.recipient_id),
        product: relationName(productById, vehicle.product_id),
        freightValue: compactNumber(vehicle.freight_value),
        location: [city, state].filter(Boolean).join(" - "),
        lat: compactNumber(latestPosition?.lat) ?? compactNumber(vehicle.lat),
        lng: compactNumber(latestPosition?.lng) ?? compactNumber(vehicle.lng),
        speed: compactNumber(latestPosition?.speed),
        lastPositionAt:
          compactText(latestPosition?.recorded_at) ?? compactText(vehicle.last_position_at),
      };
    }),
    vehicles: vehicles.slice(0, 180).map((vehicle) => {
      const latestPosition = latestPositions.get(String(vehicle.id));
      const city = compactText(latestPosition?.city) ?? compactText(vehicle.city);
      const state = compactText(latestPosition?.state) ?? compactText(vehicle.state);
      return {
        plate: compactText(vehicle.plate),
        type: compactText(vehicle.type),
        brand: compactText(vehicle.brand),
        model: compactText(vehicle.model),
        status: compactText(vehicle.status),
        situation: compactText(vehicle.vehicle_situation),
        stage: compactText(vehicle.freight_stage),
        driver: relationName(driverById, vehicle.driver_id),
        implement: relationName(trailerById, vehicle.trailer_id),
        location: [city, state].filter(Boolean).join(" - "),
        lat: compactNumber(latestPosition?.lat) ?? compactNumber(vehicle.lat),
        lng: compactNumber(latestPosition?.lng) ?? compactNumber(vehicle.lng),
        speed: compactNumber(latestPosition?.speed),
        hasActiveFreight: Boolean(compactText(vehicle.current_freight_id)),
        freightValue: compactNumber(vehicle.freight_value),
        lastPositionAt:
          compactText(latestPosition?.recorded_at) ?? compactText(vehicle.last_position_at),
        updatedAt: compactText(vehicle.updated_at),
      };
    }),
    drivers: drivers.slice(0, 120).map((driver) => ({
      name: compactText(driver.name),
      phone: compactText(driver.phone),
      active: driver.active !== false,
      vehicle: compactText(driver.vehicle_id),
      fleetSeq: compactNumber(driver.fleet_seq),
      partnerRole: compactText(driver.partner_role),
    })),
    trailers: trailers.slice(0, 120).map((trailer) => ({
      identifier: compactText(trailer.identifier),
      type: compactText(trailer.type),
      implementType: compactText(trailer.implement_type),
      implementModel: compactText(trailer.implement_model),
      vehicle: compactText(trailer.vehicle_id),
    })),
    senders: senders.slice(0, 80).map((sender) => ({
      name: compactText(sender.name),
      city: compactText(sender.city),
      state: compactText(sender.state),
      address: compactText(sender.address),
      locationLabel: compactText(sender.location_label),
      hasCoordinates: Number.isFinite(Number(sender.lat)) && Number.isFinite(Number(sender.lng)),
      active: sender.active !== false,
    })),
    recipients: recipients.slice(0, 80).map((recipient) => ({
      name: compactText(recipient.name),
      city: compactText(recipient.city),
      state: compactText(recipient.state),
      address: compactText(recipient.address),
      locationLabel: compactText(recipient.location_label),
      hasCoordinates:
        Number.isFinite(Number(recipient.lat)) && Number.isFinite(Number(recipient.lng)),
      active: recipient.active !== false,
    })),
    products: products.slice(0, 80).map((product) => ({
      name: compactText(product.name),
      active: product.active !== false,
    })),
    recentFreights: freightHistory.slice(0, 25).map((freight) => ({
      plate: compactText(freight.vehicle_plate),
      driver: compactText(freight.driver_name),
      sender: compactText(freight.sender_name),
      recipient: compactText(freight.recipient_name),
      product: compactText(freight.product_name),
      value: compactNumber(freight.freight_value),
      finishedAt: compactText(freight.finished_at),
      reason: compactText(freight.finish_reason),
      finalStatus: compactText(freight.final_status),
    })),
    recentFuelRecords: fuelRecords.slice(0, 25).map((record) => ({
      plate: compactText(record.vehicle_plate),
      driver: compactText(record.driver_name),
      fuelType: compactText(record.fuel_type),
      liters: compactNumber(record.liters),
      amount: compactNumber(record.amount),
      station: compactText(record.station),
      recordedAt: compactText(record.recorded_at),
    })),
    recentExpenses: freightExpenses.slice(0, 35).map((expense) => ({
      freightId: compactText(expense.freight_id),
      category: compactText(expense.category),
      description: compactText(expense.description),
      amount: compactNumber(expense.amount),
      source: compactText(expense.source),
      recordedAt: compactText(expense.recorded_at),
    })),
  };
}

function tenantContextInstruction(context: TenantAiContext) {
  return [
    FROTAK_AI_KNOWLEDGE_BASE,
    "IDIOMA OBRIGATORIO: portugues do Brasil.",
    "Nunca responda em ingles, mesmo que o modelo pense, planeje ou organize a resposta internamente em ingles.",
    "Se qualquer rascunho sair em ingles, converta mentalmente e mostre somente a versao final em portugues.",
    "Responda sempre em portugues do Brasil, de forma objetiva, pratica e operacional.",
    "Toda a resposta visivel ao usuario deve estar em portugues. Nao escreva frases, titulos ou raciocinio em ingles.",
    "Nao mostre seu processo interno. Nao escreva 'Identifying', 'Analyzing', 'Pinpointing', 'Locating', 'focusing', 'refining', 'proxy' ou qualquer planejamento de resposta.",
    "Entregue somente a resposta final para o usuario.",
    "Formato preferido: paragrafos curtos, listas e linhas separadas quando houver varios dados.",
    "Nao escreva tudo em um unico bloco.",
    "Nao use markdown com asteriscos. Se quiser destacar algo, use texto simples e quebras de linha.",
    "CONTEXTO DO TENANT:",
    JSON.stringify(context),
  ].join("\n");
}

export const sendFrotakAiChatMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { accessToken: string; message: string; history: FrotakAiMessage[] }) => input,
  )
  .handler(async ({ data }) => {
    try {
      const message = data.message.trim();
      if (!message) throw new Error("Mensagem vazia");

      const tenantContext = await buildTenantAiContext(data.accessToken);
      const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
      const model = process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL;
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...historyToContents(data.history ?? []),
          { role: "user", parts: [{ text: message }] },
        ],
        config: {
          systemInstruction: tenantContextInstruction(tenantContext),
          temperature: 0.3,
        },
      });

      const text = await ensurePortugueseFinalAnswer(ai, model, response.text ?? "");
      if (!text) throw new Error("Resposta vazia do Gemini");
      return { text, model };
    } catch (error) {
      console.error("[frotakAi] chat failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });

export const createFrotakAiVoiceToken = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { accessToken: string; requestedAt?: string } | undefined) =>
      input ?? { accessToken: "" },
  )
  .handler(async ({ data }) => {
    try {
      const model = process.env.GEMINI_VOICE_MODEL || FROTAK_AI_VOICE_MODEL;
      const tenantContext = await buildTenantAiContext(data.accessToken);
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey(),
        httpOptions: { apiVersion: "v1alpha" },
      });
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          liveConnectConstraints: {
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              outputAudioTranscription: {},
              systemInstruction: tenantContextInstruction(tenantContext),
            },
          },
          lockAdditionalFields: ["model", "responseModalities", "systemInstruction"],
        },
      });

      if (!token.name) throw new Error("Token efemero vazio");
      return { token: token.name, model };
    } catch (error) {
      console.error("[frotakAi] voice token failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });
