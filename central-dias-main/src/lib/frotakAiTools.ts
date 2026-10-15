import { Type, type FunctionCall, type FunctionDeclaration } from "@google/genai";
import {
  canReadFinancial,
  type FrotakAiContext,
  getSupabaseServerClient,
} from "@/lib/frotakAiContext";
import {
  FROTAK_AI_FINANCIAL_TOOL_NAMES,
  isKnownFrotakAiToolName,
  type FrotakAiToolName,
} from "@/lib/frotakAiToolCatalog";
import { createDeterministicFrotakAnswer } from "@/lib/frotakAiDeterministic";
import { searchManualSupport } from "@/routes/manual";

export type { FrotakAiToolName } from "@/lib/frotakAiToolCatalog";

export type FrotakAiToolCall = {
  id?: string;
  name: FrotakAiToolName;
  args?: Record<string, unknown>;
};

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type QueryResult = Record<string, unknown>;

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 80;

export const FROTAK_AI_FINANCIAL_TOOLS = new Set<FrotakAiToolName>(FROTAK_AI_FINANCIAL_TOOL_NAMES);

const queryProperty = {
  type: Type.STRING,
  description: "Placa, nome, telefone, documento, codigo ou trecho a pesquisar.",
};

const limitProperty = {
  type: Type.INTEGER,
  description: "Quantidade maxima de registros, entre 1 e 80.",
};

const periodProperties = {
  start_date: { type: Type.STRING, description: "Data inicial no formato YYYY-MM-DD." },
  end_date: { type: Type.STRING, description: "Data final no formato YYYY-MM-DD." },
  days: {
    type: Type.INTEGER,
    description: "Janela em dias quando o usuario nao informar datas exatas.",
  },
};

export const FROTAK_AI_TOOL_DECLARATIONS = [
  {
    name: "consultar_tenant",
    description:
      "Retorna identidade e totais operacionais do tenant/workspace autenticado. Use para saber qual empresa esta logada ou obter uma visao geral.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "buscar_veiculo",
    description:
      "Busca caminhoes e veiculos do tenant por placa, tipo, cidade ou status. Retorna cadastro e operacao atual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: queryProperty,
        status: { type: Type.STRING, description: "Status exato do veiculo, se informado." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "buscar_implemento",
    description:
      "Busca cacambas, carretas e implementos do tenant por identificador, tipo, marca ou modelo.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: queryProperty, limit: limitProperty },
    },
  },
  {
    name: "consultar_posicao",
    description:
      "Consulta a ultima posicao conhecida de um veiculo ou da frota. O servidor relaciona a posicao com a placa e informa a data da leitura.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Placa do veiculo. Omita para a frota." },
        source: { type: Type.STRING, description: "Fonte da posicao, como sascar, se pedida." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "listar_fretes_ativos",
    description:
      "Lista fretes em andamento no tenant, com placa, motorista, etapa, status, local e valor registrado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Placa, cidade ou codigo do frete." },
        status: { type: Type.STRING, description: "Status operacional exato, se informado." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_frete",
    description:
      "Consulta detalhes de fretes ativos e/ou encerrados por codigo, placa, motorista, cliente ou produto. Use para historico, ultimo frete, rota, partes e documentos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: queryProperty,
        source: {
          type: Type.STRING,
          enum: ["active", "history", "all"],
          description: "active, history ou all.",
        },
        status: { type: Type.STRING, description: "Status do frete, se informado." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_motorista",
    description:
      "Busca motoristas do tenant por nome, telefone ou CNH e informa atividade e veiculo vinculado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: queryProperty,
        status: {
          type: Type.STRING,
          enum: ["active", "inactive", "all"],
          description: "active, inactive ou all.",
        },
        limit: limitProperty,
      },
    },
  },
  {
    name: "buscar_parceiro",
    description:
      "Busca clientes, fornecedores e parceiros do tenant por nome ou documento, sem valores financeiros.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: queryProperty, limit: limitProperty },
    },
  },
  {
    name: "buscar_produto",
    description: "Busca produtos cadastrados no tenant por nome.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: queryProperty, limit: limitProperty },
    },
  },
  {
    name: "consultar_abastecimentos",
    description:
      "Consulta abastecimentos do tenant e calcula no servidor quantidade, litros, valor total e preco medio por litro. Filtra por placa, motorista, posto, combustivel e periodo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Placa, motorista ou posto." },
        fuel_type: {
          type: Type.STRING,
          enum: ["diesel_s10", "arla", "all"],
          description: "diesel_s10, arla ou all.",
        },
        ...periodProperties,
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_financeiro",
    description:
      "Somente owner. Consulta titulos a pagar ou receber e saldos em aberto calculados pelo backend.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        direction: {
          type: Type.STRING,
          enum: ["receivable", "payable", "all"],
          description: "receivable, payable ou all.",
        },
        status: { type: Type.STRING, description: "Status financeiro, como overdue ou all." },
        query: queryProperty,
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_dre",
    description:
      "Somente owner. Consulta a DRE gerencial. Receita, custos, despesas, resultado, margem e reconciliacao ja vem calculados pelo backend.",
    parameters: { type: Type.OBJECT, properties: { ...periodProperties } },
  },
  {
    name: "consultar_rentabilidade",
    description:
      "Somente owner. Consulta rentabilidade da frota, por veiculo, frete ou cliente. Todos os numeros sao calculados pelo backend.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dimension: {
          type: Type.STRING,
          enum: ["summary", "vehicle", "freight", "partner"],
          description: "summary, vehicle, freight ou partner.",
        },
        query: { type: Type.STRING, description: "Placa ou nome para filtrar o resultado." },
        ...periodProperties,
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_suporte",
    description:
      "Pesquisa o manual oficial da Frotak para explicar telas, procedimentos, app motorista, CTe, cadastros e dificuldades.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Pergunta ou termos a localizar no manual." },
        limit: { type: Type.INTEGER, description: "Quantidade de orientacoes, entre 3 e 8." },
      },
      required: ["query"],
    },
  },
] as const satisfies readonly FunctionDeclaration[];

export function normalizeFrotakAiToolCall(call: FunctionCall): FrotakAiToolCall | null {
  if (!call.name || !isFrotakAiToolName(call.name)) return null;
  return { id: call.id, name: call.name, args: call.args ?? {} };
}

export function isFrotakAiToolName(name: string): name is FrotakAiToolName {
  return (
    isKnownFrotakAiToolName(name) &&
    FROTAK_AI_TOOL_DECLARATIONS.some((declaration) => declaration.name === name)
  );
}

export function canExecuteFrotakAiTool(context: FrotakAiContext, name: FrotakAiToolName) {
  if (FROTAK_AI_FINANCIAL_TOOLS.has(name) && !canReadFinancial(context)) {
    return {
      allowed: false as const,
      error: "Dados financeiros sao exclusivos para o owner da empresa.",
      code: "OWNER_REQUIRED",
    };
  }
  return { allowed: true as const };
}

export async function executeFrotakAiTool(
  context: FrotakAiContext,
  name: FrotakAiToolName,
  args: Record<string, unknown> = {},
) {
  const access = canExecuteFrotakAiTool(context, name);
  if (!access.allowed) return { ...access, deterministicAnswer: access.error };

  const supabase = getSupabaseServerClient(context.accessToken);
  let data: QueryResult;
  switch (name) {
    case "consultar_tenant":
      data = await queryTenantSummary(supabase, context);
      break;
    case "buscar_veiculo":
      data = await queryVehicles(supabase, context, args);
      break;
    case "buscar_implemento":
      data = await queryTrailers(supabase, context, args);
      break;
    case "consultar_posicao":
      data = await queryPositions(supabase, context, args);
      break;
    case "listar_fretes_ativos":
      data = await queryActiveFreights(supabase, context, args);
      break;
    case "consultar_frete":
      data = await queryFreights(supabase, context, args);
      break;
    case "consultar_motorista":
      data = await queryDrivers(supabase, context, args);
      break;
    case "buscar_parceiro":
      data = await queryBusinessPartners(supabase, context, args);
      break;
    case "buscar_produto":
      data = await queryProducts(supabase, context, args);
      break;
    case "consultar_abastecimentos":
      data = await queryFuelRecords(supabase, context, args);
      break;
    case "consultar_financeiro":
      data = await queryFinancial(supabase, context, args);
      break;
    case "consultar_dre":
      data = await queryDre(supabase, context, args);
      break;
    case "consultar_rentabilidade":
      data = await queryProfitability(supabase, context, args);
      break;
    case "consultar_suporte":
      data = {
        items: searchManualSupport(textArg(args, "query") ?? "", limitFromArgs(args, 6, 8)),
      };
      break;
  }

  if (typeof data.error === "string") {
    console.error("[frotakAi] tool failed", {
      stage: "tool",
      workspaceId: context.workspaceId,
      tenantId: context.tenantId,
      tool: name,
      code: data.code,
      message: data.error,
    });
    return {
      ok: false,
      tool: name,
      error: data.error,
      code: data.code,
      deterministicAnswer: data.error,
    };
  }

  return {
    ok: true,
    tool: name,
    scope: { tenant: context.tenantName, workspace: context.workspaceName },
    data,
    deterministicAnswer: createDeterministicFrotakAnswer(name, data),
  };
}

function limitFromArgs(
  args: Record<string, unknown> | undefined,
  fallback = LIMIT_DEFAULT,
  max = LIMIT_MAX,
) {
  const value = Number(args?.limit ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function textArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeSearchArg(args: Record<string, unknown> | undefined, key = "query") {
  return textArg(args, key)
    ?.replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function dateArg(args: Record<string, unknown> | undefined, key: string) {
  const value = textArg(args, key);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolvePeriod(
  args: Record<string, unknown>,
  options: { defaultDays?: number; currentMonth?: boolean } = {},
) {
  const endDate = dateArg(args, "end_date") ?? dateOnly(new Date());
  let startDate = dateArg(args, "start_date");
  if (!startDate && options.currentMonth) startDate = `${endDate.slice(0, 7)}-01`;
  if (!startDate) {
    const requestedDays = Number(args.days ?? options.defaultDays ?? 30);
    const days = Number.isFinite(requestedDays)
      ? Math.max(1, Math.min(3650, Math.trunc(requestedDays)))
      : 30;
    const start = new Date(`${endDate}T12:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    startDate = dateOnly(start);
  }
  if (startDate > endDate) {
    return {
      error: "Periodo invalido: a data inicial e posterior a data final.",
      code: "INVALID_PERIOD",
    };
  }
  return { startDate, endDate };
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactRows(rows: Array<Record<string, unknown>>, fields: string[]) {
  return rows.map((row) => {
    const item: Record<string, unknown> = {};
    fields.forEach((field) => {
      if (row[field] !== undefined && row[field] !== null) item[field] = row[field];
    });
    return item;
  });
}

function errorResult(error: { message: string; code?: string } | null) {
  return error ? { error: error.message, code: error.code } : null;
}

async function queryTenantSummary(supabase: SupabaseServer, context: FrotakAiContext) {
  const [vehicles, drivers, trailers, partners, products, activeFreights, fuel] = await Promise.all(
    [
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId),
      supabase
        .from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId)
        .eq("active", true),
      supabase
        .from("trailers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId),
      supabase
        .from("business_partners")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId)
        .eq("active", true),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId)
        .eq("active", true),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId)
        .not("current_freight_id", "is", null),
      supabase
        .from("fuel_records")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", context.tenantId),
    ],
  );
  const failed = [vehicles, drivers, trailers, partners, products, activeFreights, fuel].find(
    (item) => item.error,
  );
  if (failed?.error) return errorResult(failed.error)!;
  return {
    tenantName: context.tenantName,
    workspaceName: context.workspaceName,
    totals: {
      vehicles: vehicles.count ?? 0,
      activeDrivers: drivers.count ?? 0,
      trailers: trailers.count ?? 0,
      activePartners: partners.count ?? 0,
      activeProducts: products.count ?? 0,
      activeFreights: activeFreights.count ?? 0,
      fuelRecords: fuel.count ?? 0,
    },
  };
}

async function queryVehicles(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("vehicles")
    .select(
      "id, plate, type, status, vehicle_situation, freight_stage, city, state, driver_id, trailer_id, current_freight_id, freight_value, updated_at, last_position_at",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenantId)
    .order("plate")
    .limit(limitFromArgs(args));
  const status = textArg(args, "status");
  if (status) query = query.eq("status", status);
  const search = safeSearchArg(args);
  if (search) {
    query = query.or(`plate.ilike.%${search}%,type.ilike.%${search}%,city.ilike.%${search}%`);
  }
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const driverIds = rows.map((row) => String(row.driver_id ?? "")).filter(Boolean);
  const driverNames = new Map<string, string>();
  if (driverIds.length) {
    const { data: drivers, error: driversError } = await supabase
      .from("drivers")
      .select("id, name")
      .eq("tenant_id", context.tenantId)
      .in("id", driverIds);
    if (driversError) return errorResult(driversError)!;
    (drivers ?? []).forEach((driver) =>
      driverNames.set(String(driver.id), String(driver.name ?? "")),
    );
  }
  return {
    count: rows.length,
    totalCount: count ?? rows.length,
    items: rows.map((row) => ({
      ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "driver_id")),
      driver_name: row.driver_id ? (driverNames.get(String(row.driver_id)) ?? null) : null,
    })),
  };
}

async function queryTrailers(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("trailers")
    .select(
      "identifier, type, brand, model, implement_type, implement_model, vehicle_id, updated_at",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenantId)
    .order("identifier")
    .limit(limitFromArgs(args));
  const search = safeSearchArg(args);
  if (search) {
    query = query.or(
      `identifier.ilike.%${search}%,type.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%`,
    );
  }
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  return {
    count: data?.length ?? 0,
    totalCount: count ?? data?.length ?? 0,
    items: data ?? [],
  };
}

async function queryDrivers(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("drivers")
    .select("id, name, phone, cnh, active, vehicle_id, updated_at", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .order("name")
    .limit(limitFromArgs(args));
  const status = textArg(args, "status") ?? "active";
  if (status === "active") query = query.eq("active", true);
  if (status === "inactive") query = query.eq("active", false);
  const search = safeSearchArg(args);
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,cnh.ilike.%${search}%`);
  }
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const vehicleIds = rows.map((row) => String(row.vehicle_id ?? "")).filter(Boolean);
  const plates = new Map<string, string>();
  if (vehicleIds.length) {
    const { data: vehicles, error: vehiclesError } = await supabase
      .from("vehicles")
      .select("id, plate")
      .eq("tenant_id", context.tenantId)
      .in("id", vehicleIds);
    if (vehiclesError) return errorResult(vehiclesError)!;
    (vehicles ?? []).forEach((vehicle) =>
      plates.set(String(vehicle.id), String(vehicle.plate ?? "")),
    );
  }
  return {
    count: rows.length,
    totalCount: count ?? rows.length,
    items: rows.map((row) => ({
      ...row,
      vehicle_plate: row.vehicle_id ? (plates.get(String(row.vehicle_id)) ?? null) : null,
    })),
  };
}

async function queryBusinessPartners(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("business_partners")
    .select("id, trade_name, legal_name, tax_id, active, requires_review, updated_at", {
      count: "exact",
    })
    .eq("tenant_id", context.tenantId)
    .order("trade_name")
    .limit(limitFromArgs(args));
  const search = safeSearchArg(args);
  if (search) {
    query = query.or(
      `trade_name.ilike.%${search}%,legal_name.ilike.%${search}%,tax_id.ilike.%${search}%`,
    );
  }
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  return {
    count: data?.length ?? 0,
    totalCount: count ?? data?.length ?? 0,
    items: data ?? [],
  };
}

async function queryProducts(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("products")
    .select("id, name, active, updated_at", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .order("name")
    .limit(limitFromArgs(args));
  const search = safeSearchArg(args);
  if (search) query = query.ilike("name", `%${search}%`);
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  return {
    count: data?.length ?? 0,
    totalCount: count ?? data?.length ?? 0,
    items: data ?? [],
  };
}

async function queryActiveFreights(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("vehicles")
    .select(
      "current_freight_id, plate, driver_id, status, freight_stage, freight_value, freight_pricing_mode, freight_ton_price, unloaded_tons, city, state, updated_at",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenantId)
    .not("current_freight_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limitFromArgs(args));
  const status = textArg(args, "status");
  if (status) query = query.eq("status", status);
  const search = safeSearchArg(args);
  if (search) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search)) {
      query = query.eq("current_freight_id", search);
    } else {
      query = query.or(`plate.ilike.%${search}%,city.ilike.%${search}%`);
    }
  }
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const driverIds = rows.map((row) => String(row.driver_id ?? "")).filter(Boolean);
  const names = new Map<string, string>();
  if (driverIds.length) {
    const { data: drivers, error: driverError } = await supabase
      .from("drivers")
      .select("id, name")
      .eq("tenant_id", context.tenantId)
      .in("id", driverIds);
    if (driverError) return errorResult(driverError)!;
    (drivers ?? []).forEach((driver) => names.set(String(driver.id), String(driver.name ?? "")));
  }
  return {
    count: rows.length,
    totalCount: count ?? rows.length,
    items: rows.map((row) => ({
      ...row,
      driver_name: row.driver_id ? (names.get(String(row.driver_id)) ?? null) : null,
    })),
  };
}

async function queryFreights(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const source = textArg(args, "source") ?? "all";
  const result: QueryResult = {};
  if (source === "active" || source === "all") {
    result.active = await queryActiveFreights(supabase, context, args);
  }
  if (source === "history" || source === "all") {
    let query = supabase
      .from("freight_history")
      .select(
        "freight_id, vehicle_plate, driver_name, sender_name, sender_city, sender_state, recipient_name, recipient_city, recipient_state, product_name, freight_value, finish_reason, final_status, final_freight_stage, started_at, finished_at",
        { count: "exact" },
      )
      .eq("tenant_id", context.tenantId)
      .order("finished_at", { ascending: false })
      .limit(limitFromArgs(args));
    const status = textArg(args, "status");
    if (status) query = query.eq("final_status", status);
    const search = safeSearchArg(args);
    if (search) {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search)
      ) {
        query = query.eq("freight_id", search);
      } else {
        query = query.or(
          `vehicle_plate.ilike.%${search}%,driver_name.ilike.%${search}%,sender_name.ilike.%${search}%,recipient_name.ilike.%${search}%,product_name.ilike.%${search}%`,
        );
      }
    }
    const { data, error, count } = await query;
    result.history = error
      ? errorResult(error)
      : {
          count: data?.length ?? 0,
          totalCount: count ?? data?.length ?? 0,
          items: data ?? [],
        };
  }
  return result;
}

async function queryPositions(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const search = safeSearchArg(args);
  let vehicleIds: string[] | undefined;
  const plateById = new Map<string, string>();
  if (search) {
    const { data: vehicles, error } = await supabase
      .from("vehicles")
      .select("id, plate")
      .eq("tenant_id", context.tenantId)
      .ilike("plate", `%${search}%`)
      .limit(limitFromArgs(args));
    if (error) return errorResult(error)!;
    vehicleIds = (vehicles ?? []).map((vehicle) => String(vehicle.id));
    (vehicles ?? []).forEach((vehicle) =>
      plateById.set(String(vehicle.id), String(vehicle.plate ?? "")),
    );
    if (!vehicleIds.length) return { count: 0, items: [] };
  }
  let query = supabase
    .from("vehicle_positions")
    .select("vehicle_id, lat, lng, city, state, speed, direction, source, recorded_at")
    .eq("tenant_id", context.tenantId)
    .order("recorded_at", { ascending: false })
    .limit(Math.min(500, limitFromArgs(args) * 20));
  if (vehicleIds) query = query.in("vehicle_id", vehicleIds);
  const source = textArg(args, "source");
  if (source) query = query.eq("source", source);
  const { data, error } = await query;
  if (error) return errorResult(error)!;
  const latest = new Map<string, Record<string, unknown>>();
  ((data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const vehicleId = String(row.vehicle_id ?? "");
    if (vehicleId && !latest.has(vehicleId)) latest.set(vehicleId, row);
  });
  const rows = [...latest.values()].slice(0, limitFromArgs(args));
  const missingIds = rows
    .map((row) => String(row.vehicle_id ?? ""))
    .filter((id) => id && !plateById.has(id));
  if (missingIds.length) {
    const { data: vehicles, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, plate")
      .eq("tenant_id", context.tenantId)
      .in("id", missingIds);
    if (vehicleError) return errorResult(vehicleError)!;
    (vehicles ?? []).forEach((vehicle) =>
      plateById.set(String(vehicle.id), String(vehicle.plate ?? "")),
    );
  }
  return {
    count: rows.length,
    items: rows.map((row) => ({
      plate: plateById.get(String(row.vehicle_id)) ?? null,
      ...row,
    })),
  };
}

async function queryFuelRecords(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const period = resolvePeriod(args, { defaultDays: 30 });
  if ("error" in period) return period;
  let query = supabase
    .from("fuel_records")
    .select(
      "vehicle_plate, driver_name, station, fuel_type, liters, amount, odometer, recorded_at",
      { count: "exact" },
    )
    .eq("tenant_id", context.tenantId)
    .gte("recorded_at", `${period.startDate}T00:00:00.000Z`)
    .lte("recorded_at", `${period.endDate}T23:59:59.999Z`)
    .order("recorded_at", { ascending: false })
    .limit(limitFromArgs(args));
  const fuelType = textArg(args, "fuel_type");
  if (fuelType === "diesel_s10" || fuelType === "arla") {
    query = query.eq("fuel_type", fuelType);
  }
  const search = safeSearchArg(args);
  if (search) {
    query = query.or(
      `vehicle_plate.ilike.%${search}%,driver_name.ilike.%${search}%,station.ilike.%${search}%`,
    );
  }
  const { data, error, count } = await query;
  if (error) return errorResult(error)!;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    liters: numberValue(row.liters),
    amount: numberValue(row.amount),
    odometer: numberValue(row.odometer),
  }));
  const totals = await queryFuelTotals(supabase, context, args, period);
  if ("error" in totals) return totals;
  return {
    period,
    count: rows.length,
    totalCount: count ?? rows.length,
    totals: {
      liters: totals.liters,
      amount: totals.amount,
      averagePricePerLiter: totals.liters > 0 ? totals.amount / totals.liters : 0,
    },
    items: rows,
  };
}

async function queryFuelTotals(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
  period: { startDate: string; endDate: string },
) {
  const pageSize = 1000;
  let offset = 0;
  let liters = 0;
  let amount = 0;
  while (true) {
    let query = supabase
      .from("fuel_records")
      .select("liters, amount")
      .eq("tenant_id", context.tenantId)
      .gte("recorded_at", `${period.startDate}T00:00:00.000Z`)
      .lte("recorded_at", `${period.endDate}T23:59:59.999Z`)
      .range(offset, offset + pageSize - 1);
    const fuelType = textArg(args, "fuel_type");
    if (fuelType === "diesel_s10" || fuelType === "arla") {
      query = query.eq("fuel_type", fuelType);
    }
    const search = safeSearchArg(args);
    if (search) {
      query = query.or(
        `vehicle_plate.ilike.%${search}%,driver_name.ilike.%${search}%,station.ilike.%${search}%`,
      );
    }
    const { data, error } = await query;
    if (error) return errorResult(error)!;
    const page = (data ?? []) as Array<Record<string, unknown>>;
    page.forEach((row) => {
      liters += numberValue(row.liters);
      amount += numberValue(row.amount);
    });
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return { liters, amount };
}

async function queryFinancial(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const direction = textArg(args, "direction") ?? "all";
  const directions: Array<"receivable" | "payable"> =
    direction === "receivable" || direction === "payable" ? [direction] : ["receivable", "payable"];
  const pages = await Promise.all(
    directions.map(async (itemDirection) => {
      const { data, error } = await supabase.rpc("list_financial_documents_page", {
        p_payload: {
          workspaceId: context.workspaceId,
          direction: itemDirection,
          status: textArg(args, "status") ?? "all",
          search: safeSearchArg(args) ?? null,
          page: 1,
          pageSize: limitFromArgs(args),
        },
      });
      return { direction: itemDirection, data, error };
    }),
  );
  const failed = pages.find((page) => page.error);
  if (failed?.error) return errorResult(failed.error)!;
  const totals = { receivable: 0, payable: 0 };
  let totalCount = 0;
  const rows: Array<Record<string, unknown>> = [];
  pages.forEach((page) => {
    const payload =
      page.data && typeof page.data === "object" && !Array.isArray(page.data)
        ? (page.data as Record<string, unknown>)
        : {};
    const summary =
      payload.summary && typeof payload.summary === "object" && !Array.isArray(payload.summary)
        ? (payload.summary as Record<string, unknown>)
        : {};
    totals[page.direction] = numberValue(summary.openBalance);
    totalCount += numberValue(payload.total);
    if (Array.isArray(payload.rows)) {
      payload.rows.forEach((row) =>
        rows.push({ direction: page.direction, ...(row as Record<string, unknown>) }),
      );
    }
  });
  return {
    count: rows.length,
    totalCount,
    totals,
    basis: "open_installment_balance",
    items: compactRows(rows, [
      "direction",
      "description",
      "originalAmount",
      "outstandingBalance",
      "competenceDate",
      "dueDate",
      "status",
      "sourceType",
      "partnerName",
    ]),
  };
}

async function queryDre(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const period = resolvePeriod(args, { currentMonth: true });
  if ("error" in period) return period;
  const { data, error } = await supabase.rpc("get_dre_summary", {
    p_payload: {
      workspaceId: context.workspaceId,
      startDate: period.startDate,
      endDate: period.endDate,
      costCenterId: null,
    },
  });
  if (error) return errorResult(error)!;
  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return {
    period,
    groups: payload.groups ?? [],
    totals: payload.totals ?? {},
    reconciliation: payload.reconciliation ?? {},
    previous: payload.previous ?? {},
  };
}

function profitabilityParams(
  context: FrotakAiContext,
  period: { startDate: string; endDate: string },
  vehicleId: string | null,
) {
  return {
    p_workspace_id: context.workspaceId,
    p_start_date: period.startDate,
    p_end_date: period.endDate,
    p_vehicle_id: vehicleId,
    p_billing_partner_id: null,
    p_sender_id: null,
    p_recipient_id: null,
    p_product_id: null,
    p_implement_model: null,
    p_payment_type: null,
  };
}

async function queryProfitability(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const period = resolvePeriod(args, { defaultDays: 365 });
  if ("error" in period) return period;
  const dimension = textArg(args, "dimension") ?? "summary";
  const search = safeSearchArg(args);
  let vehicleId: string | null = null;
  if (search && (dimension === "vehicle" || dimension === "summary")) {
    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("id, plate")
      .eq("tenant_id", context.tenantId)
      .ilike("plate", `%${search}%`)
      .limit(1)
      .maybeSingle();
    if (error) return errorResult(error)!;
    if (!vehicle) {
      return { error: "Veiculo nao encontrado no tenant atual.", code: "VEHICLE_NOT_FOUND" };
    }
    vehicleId = String(vehicle.id);
  }
  const params = profitabilityParams(context, period, vehicleId);
  if (dimension === "summary") {
    const { data, error } = await supabase.rpc("get_fleet_profitability_summary", params);
    if (error) return errorResult(error)!;
    const row =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    return {
      period,
      dimension,
      summary: {
        revenue: numberValue(row.revenue),
        costs: numberValue(row.costs),
        result: numberValue(row.result),
        margin: numberValue(row.margin),
        unallocatedCosts: numberValue(row.unallocatedCosts),
      },
    };
  }
  const rpc =
    dimension === "vehicle"
      ? "get_vehicle_profitability"
      : dimension === "freight"
        ? "get_freight_profitability"
        : "get_partner_profitability";
  const rpcArgs =
    dimension === "vehicle"
      ? { ...params, p_sort: "most_profitable", p_limit: limitFromArgs(args) }
      : params;
  const { data, error } = await supabase.rpc(rpc, rpcArgs);
  if (error) return errorResult(error)!;
  let rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  if (search && dimension !== "vehicle") {
    const needle = search.toLocaleLowerCase("pt-BR");
    rows = rows.filter((row) =>
      Object.values(row).some(
        (value) => typeof value === "string" && value.toLocaleLowerCase("pt-BR").includes(needle),
      ),
    );
  }
  rows = rows.slice(0, limitFromArgs(args));
  return { period, dimension, count: rows.length, items: rows };
}
