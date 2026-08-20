import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.1-flash-lite";
export const FROTAK_AI_VOICE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

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

function compactText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function compactNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = compactText(row[key]) ?? "sem-informacao";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
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
  ] = await Promise.all([
    safeTenantRows(supabase, "vehicles", "*", context.tenantId, {
      orderBy: "plate",
      limit: 180,
    }),
    safeTenantRows(
      supabase,
      "drivers",
      "id, name, active, vehicle_id, fleet_seq, partner_role",
      context.tenantId,
      {
        orderBy: "name",
        limit: 220,
      },
    ),
    safeTenantRows(
      supabase,
      "trailers",
      "id, identifier, type, implement_type, implement_model, vehicle_id, fleet_seq",
      context.tenantId,
      { orderBy: "identifier", limit: 220 },
    ),
    safeTenantRows(
      supabase,
      "senders",
      "id, name, city, state, address, location_label, location_source, lat, lng, active",
      context.tenantId,
      { orderBy: "name", limit: 160 },
    ),
    safeTenantRows(
      supabase,
      "recipients",
      "id, name, city, state, address, location_label, location_source, lat, lng, active",
      context.tenantId,
      { orderBy: "name", limit: 160 },
    ),
    safeTenantRows(supabase, "products", "id, name, active", context.tenantId, {
      orderBy: "name",
      limit: 120,
    }),
    safeTenantRows(supabase, "freight_history", "*", context.tenantId, {
      orderBy: "finished_at",
      ascending: false,
      limit: 40,
    }),
    safeTenantRows(supabase, "fuel_records", "*", context.tenantId, {
      orderBy: "recorded_at",
      ascending: false,
      limit: 40,
    }),
    safeTenantRows(supabase, "freight_expenses", "*", context.tenantId, {
      orderBy: "recorded_at",
      ascending: false,
      limit: 60,
    }),
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
    },
    fleetByStatus: countBy(vehicles, "status"),
    fleetBySituation: countBy(vehicles, "vehicle_situation"),
    activeFreights: activeFreights.slice(0, 60).map((vehicle) => ({
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
      location: [compactText(vehicle.city), compactText(vehicle.state)].filter(Boolean).join(" - "),
      lastPositionAt: compactText(vehicle.last_position_at),
    })),
    vehicles: vehicles.slice(0, 120).map((vehicle) => ({
      plate: compactText(vehicle.plate),
      type: compactText(vehicle.type),
      model: compactText(vehicle.model),
      status: compactText(vehicle.status),
      situation: compactText(vehicle.vehicle_situation),
      stage: compactText(vehicle.freight_stage),
      driver: relationName(driverById, vehicle.driver_id),
      implement: relationName(trailerById, vehicle.trailer_id),
      location: [compactText(vehicle.city), compactText(vehicle.state)].filter(Boolean).join(" - "),
      hasActiveFreight: Boolean(compactText(vehicle.current_freight_id)),
      freightValue: compactNumber(vehicle.freight_value),
      updatedAt: compactText(vehicle.updated_at),
    })),
    drivers: drivers.slice(0, 120).map((driver) => ({
      name: compactText(driver.name),
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
    "Voce e a Frotak IA, assistente operacional da plataforma Frotak.",
    "Responda sempre em portugues do Brasil, de forma objetiva e pratica.",
    "Use exclusivamente o CONTEXTO DO TENANT abaixo para responder perguntas sobre dados da operacao.",
    "Nunca mencione, inferira, compare ou revele dados de outros tenants.",
    "Se a pergunta pedir dados que nao estao no contexto, diga que a informacao nao esta disponivel nesta consulta.",
    "Nao invente placas, motoristas, fretes, clientes, valores ou status.",
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
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL,
        contents: [
          ...historyToContents(data.history ?? []),
          { role: "user", parts: [{ text: message }] },
        ],
        config: {
          systemInstruction: tenantContextInstruction(tenantContext),
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Resposta vazia do Gemini");
      return { text, model: process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL };
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
              inputAudioTranscription: {},
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
