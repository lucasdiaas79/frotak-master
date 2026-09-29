import { Type, type FunctionCall, type FunctionDeclaration } from "@google/genai";
import {
  canReadFinancial,
  type FrotakAiContext,
  getSupabaseServerClient,
} from "@/lib/frotakAiContext";

export type FrotakAiToolName = "consultar_frotak";

export type FrotakAiToolCall = {
  id?: string;
  name: FrotakAiToolName;
  args?: Record<string, unknown>;
};

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 80;

function limitFromArgs(args: Record<string, unknown> | undefined) {
  const value = Number(args?.limit ?? LIMIT_DEFAULT);
  if (!Number.isFinite(value)) return LIMIT_DEFAULT;
  return Math.max(1, Math.min(LIMIT_MAX, Math.trunc(value)));
}

function textArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateArg(args: Record<string, unknown> | undefined, key: string) {
  const value = textArg(args, key);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
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

export const FROTAK_AI_TOOL_DECLARATIONS = [
  {
    name: "consultar_frotak",
    description:
      "Consulta dados reais do workspace/tenant autenticado da Frotak. Use antes de responder qualquer fato sobre empresa, frota, caminhoes, placas, motoristas, fretes, financeiro, abastecimentos ou posicoes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pergunta: {
          type: Type.STRING,
          description: "Pergunta original do usuario.",
        },
        topico: {
          type: Type.STRING,
          description:
            "Topico principal: empresa, veiculos, motoristas, fretes, financeiro, abastecimentos ou posicoes.",
        },
        query: {
          type: Type.STRING,
          description: "Texto para buscar placa, nome, codigo ou descricao.",
        },
        status: {
          type: Type.STRING,
          description: "Status operacional ou financeiro quando aplicavel.",
        },
        direction: {
          type: Type.STRING,
          description: "receivable para A Receber, payable para A Pagar ou all.",
        },
        days: {
          type: Type.INTEGER,
          description: "Janela em dias a partir de hoje para consulta por competencia/criacao.",
        },
        start_date: {
          type: Type.STRING,
          description: "Data inicial no formato YYYY-MM-DD quando a pergunta definir um periodo.",
        },
        end_date: {
          type: Type.STRING,
          description: "Data final no formato YYYY-MM-DD quando a pergunta definir um periodo.",
        },
        fuel_type: {
          type: Type.STRING,
          description: "diesel_s10, arla ou all.",
        },
        limit: {
          type: Type.INTEGER,
          description: "Quantidade maxima de registros. Use ate 80.",
        },
      },
    },
  },
] satisfies FunctionDeclaration[];

export function normalizeFrotakAiToolCall(call: FunctionCall): FrotakAiToolCall | null {
  if (!call.name || !isFrotakAiToolName(call.name)) return null;
  return {
    id: call.id,
    name: call.name,
    args: call.args ?? {},
  };
}

export function isFrotakAiToolName(name: string): name is FrotakAiToolName {
  return FROTAK_AI_TOOL_DECLARATIONS.some((declaration) => declaration.name === name);
}

export async function executeFrotakAiTool(
  context: FrotakAiContext,
  name: FrotakAiToolName,
  args: Record<string, unknown> = {},
) {
  const supabase = getSupabaseServerClient(context.accessToken);
  const result =
    name === "consultar_frotak"
      ? await executeConsultarFrotak(supabase, context, args)
      : { error: "Ferramenta indisponivel." };

  if (
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    typeof (result as Record<string, unknown>).error === "string"
  ) {
    console.error("[frotakAi] tool failed", {
      stage: "tool",
      workspaceId: context.workspaceId,
      tenantId: context.tenantId,
      tool: name,
      code:
        typeof (result as Record<string, unknown>).code === "string"
          ? (result as Record<string, unknown>).code
          : undefined,
      message: (result as Record<string, unknown>).error,
    });
  }

  return result;
}

type FrotakConsultaTopico =
  | "empresa"
  | "veiculos"
  | "motoristas"
  | "fretes"
  | "financeiro"
  | "abastecimentos"
  | "posicoes";

function normalizeIntentText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function classifyFrotakQuestion(question: string) {
  const normalized = normalizeIntentText(question);
  const mentionsTenant = /\b(empresa|companhia|tenant|workspace)\b/.test(normalized);
  const asksProfitability =
    /\b(lucro|rentabilidade|margem|resultado|faturamento|rentavel|rentaveis)\b/.test(normalized);
  const mentionsCounterparty =
    /\b(empresa|empresas|companhia|companhias|cliente|clientes|parceiro|parceiros|pagador|pagadores)\b/.test(
      normalized,
    );

  return {
    normalized,
    asksPartnerProfitability:
      asksProfitability &&
      (mentionsCounterparty || /\b(quem|qual|quais|maior|melhor)\b/.test(normalized)),
    asksTenantIdentity:
      mentionsTenant &&
      !asksProfitability &&
      /\b(nome|qual|quais|minha|meu|atual|logada|logado|cadastrada|cadastrado)\b/.test(normalized),
  };
}

function addTopic(topics: FrotakConsultaTopico[], topic: FrotakConsultaTopico) {
  if (!topics.includes(topic)) topics.push(topic);
}

function detectTopics(args: Record<string, unknown>) {
  const rawText = [
    textArg(args, "pergunta"),
    textArg(args, "question"),
    textArg(args, "topico"),
    textArg(args, "query"),
  ]
    .filter(Boolean)
    .join(" ");
  const { normalized: text, asksTenantIdentity } = classifyFrotakQuestion(rawText);
  const topics: FrotakConsultaTopico[] = [];

  if (asksTenantIdentity) addTopic(topics, "empresa");
  if (/\b(caminhao|caminhoes|veiculo|veiculos|frota|placa|placas)\b/.test(text))
    addTopic(topics, "veiculos");
  if (/\b(motorista|motoristas|condutor|condutores)\b/.test(text)) addTopic(topics, "motoristas");
  if (/\b(frete|fretes|viagem|viagens|rota|rotas|carga|descarga)\b/.test(text))
    addTopic(topics, "fretes");
  if (
    /\b(financeiro|receber|pagar|dre|caixa|titulo|titulos|receita|receitas|despesa|despesas|saldo|valor|valores|lucro|rentabilidade|margem|resultado|faturamento|cliente|clientes|parceiro|parceiros|pagador|pagadores)\b/.test(
      text,
    )
  )
    addTopic(topics, "financeiro");
  if (/\b(abastecimento|abastecimentos|diesel|arla|posto|combustivel)\b/.test(text))
    addTopic(topics, "abastecimentos");
  if (/\b(posicao|posicoes|localizacao|sascar|telemetria|mapa|onde)\b/.test(text))
    addTopic(topics, "posicoes");

  return { text, topics };
}

async function executeConsultarFrotak(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const { text, topics } = detectTopics(args);
  const consultas: Record<string, unknown> = {};
  const limit = limitFromArgs(args);

  if (topics.length === 0) {
    return {
      ok: false,
      error: "Nao foi possivel identificar qual dado da Frotak consultar.",
      tenant: {
        nome: context.tenantName,
        workspace: context.workspaceName,
      },
    };
  }

  if (topics.includes("empresa")) {
    consultas.empresa = {
      tenant_nome: context.tenantName,
      workspace_nome: context.workspaceName,
    };
  }

  if (topics.includes("veiculos")) {
    consultas.veiculos = await queryVehicles(supabase, context, {
      limit,
      query: textArg(args, "query"),
      status: textArg(args, "status"),
    });
  }

  if (topics.includes("motoristas")) {
    const inactive = /\b(inativo|inativos|inactive)\b/.test(text);
    consultas.motoristas = await queryDrivers(supabase, context, {
      limit,
      query: textArg(args, "query"),
      status: textArg(args, "status") ?? (inactive ? "inactive" : "active"),
    });
  }

  if (topics.includes("fretes")) {
    const activeOnly = /\b(em rota|andamento|ativo|ativos|aberto|abertos|rodando)\b/.test(text);
    consultas.fretes = await queryFreights(supabase, context, {
      limit,
      query: textArg(args, "query"),
      status: textArg(args, "status"),
      source: textArg(args, "source") ?? (activeOnly ? "active" : "all"),
    });
  }

  if (topics.includes("financeiro")) {
    const direction =
      textArg(args, "direction") ??
      (/\b(receber|recebiveis|entrada|entradas|receita|receitas)\b/.test(text)
        ? "receivable"
        : /\b(pagar|pagaveis|saida|saidas|despesa|despesas)\b/.test(text)
          ? "payable"
          : "all");
    const financialStatus =
      textArg(args, "status") ??
      (/\b(vencido|vencidos|vencida|vencidas|atrasado|atrasados)\b/.test(text)
        ? "overdue"
        : undefined);
    consultas.financeiro = await queryFinancial(supabase, context, {
      limit,
      direction,
      status: financialStatus,
      days: args.days ?? 365,
      start_date: args.start_date,
      end_date: args.end_date,
      question: text,
    });
  }

  if (topics.includes("abastecimentos")) {
    consultas.abastecimentos = await queryFuelRecords(supabase, context, {
      limit,
      query: textArg(args, "query"),
      fuel_type: textArg(args, "fuel_type") ?? "all",
    });
  }

  if (topics.includes("posicoes")) {
    consultas.posicoes = await queryPositions(supabase, context, {
      limit,
      query: textArg(args, "query"),
      status: textArg(args, "status"),
    });
  }

  return {
    ok: true,
    tenant: {
      nome: context.tenantName,
      workspace: context.workspaceName,
    },
    consultas,
  };
}

export async function buildFrotakAiOperationalSnapshot(context: FrotakAiContext) {
  const supabase = getSupabaseServerClient(context.accessToken);
  const [vehicles, drivers, fuel, activeFreights, financial] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, status", { count: "exact", head: true })
      .eq("tenant_id", context.tenantId),
    supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenantId)
      .eq("active", true),
    supabase
      .from("fuel_records")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenantId),
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", context.tenantId)
      .not("current_freight_id", "is", null),
    canReadFinancial(context)
      ? supabase
          .from("financial_documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", context.workspaceId)
      : Promise.resolve({ count: null, error: null }),
  ]);

  return {
    tenant: context.tenantName,
    workspace: context.workspaceName,
    vehicles: vehicles.error ? null : (vehicles.count ?? 0),
    activeDrivers: drivers.error ? null : (drivers.count ?? 0),
    activeFreights: activeFreights.error ? null : (activeFreights.count ?? 0),
    fuelRecords: fuel.error ? null : (fuel.count ?? 0),
    financialDocuments: financial.error ? null : (financial.count ?? 0),
    financialAccess: canReadFinancial(context),
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

  const search = textArg(args, "query");
  if (search)
    query = query.or(`plate.ilike.%${search}%,type.ilike.%${search}%,city.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return { error: error.message, code: error.code };

  return {
    count: data?.length ?? 0,
    totalCount: count ?? data?.length ?? 0,
    items: compactRows((data ?? []) as Array<Record<string, unknown>>, [
      "plate",
      "type",
      "status",
      "vehicle_situation",
      "freight_stage",
      "city",
      "state",
      "current_freight_id",
      "freight_value",
      "last_position_at",
      "updated_at",
    ]),
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

  const status = textArg(args, "status");
  if (status === "active" || status === "ativo") query = query.eq("active", true);
  if (status === "inactive" || status === "inativo") query = query.eq("active", false);

  const search = textArg(args, "query");
  if (search)
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,cnh.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return { error: error.message, code: error.code };

  return {
    count: data?.length ?? 0,
    totalCount: count ?? data?.length ?? 0,
    items: compactRows((data ?? []) as Array<Record<string, unknown>>, [
      "name",
      "phone",
      "cnh",
      "active",
      "vehicle_id",
      "updated_at",
    ]),
  };
}

async function queryFreights(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  const source = textArg(args, "source") ?? "all";
  const limit = limitFromArgs(args);
  const search = textArg(args, "query");
  const status = textArg(args, "status");
  const result: Record<string, unknown> = {};

  if (source === "all" || source === "active") {
    let activeQuery = supabase
      .from("vehicles")
      .select(
        "current_freight_id, plate, status, freight_stage, freight_value, freight_pricing_mode, freight_ton_price, unloaded_tons, city, state, updated_at",
      )
      .eq("tenant_id", context.tenantId)
      .not("current_freight_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (status) activeQuery = activeQuery.eq("status", status);
    if (search) activeQuery = activeQuery.or(`plate.ilike.%${search}%,city.ilike.%${search}%`);

    const { data, error } = await activeQuery;
    result.active = error
      ? { error: error.message, code: error.code }
      : compactRows((data ?? []) as Array<Record<string, unknown>>, [
          "current_freight_id",
          "plate",
          "status",
          "freight_stage",
          "freight_value",
          "freight_pricing_mode",
          "freight_ton_price",
          "unloaded_tons",
          "city",
          "state",
          "updated_at",
        ]);
  }

  if (source === "all" || source === "history") {
    let historyQuery = supabase
      .from("freight_history")
      .select(
        "freight_id, vehicle_plate, driver_name, sender_name, sender_city, sender_state, recipient_name, recipient_city, recipient_state, product_name, freight_value, finish_reason, final_status, final_freight_stage, started_at, finished_at",
      )
      .eq("tenant_id", context.tenantId)
      .order("finished_at", { ascending: false })
      .limit(limit);

    if (status) historyQuery = historyQuery.eq("final_status", status);
    if (search) {
      historyQuery = historyQuery.or(
        `vehicle_plate.ilike.%${search}%,driver_name.ilike.%${search}%,sender_name.ilike.%${search}%,recipient_name.ilike.%${search}%,product_name.ilike.%${search}%`,
      );
    }

    const { data, error } = await historyQuery;
    result.history = error
      ? { error: error.message, code: error.code }
      : compactRows((data ?? []) as Array<Record<string, unknown>>, [
          "freight_id",
          "vehicle_plate",
          "driver_name",
          "sender_name",
          "sender_city",
          "sender_state",
          "recipient_name",
          "recipient_city",
          "recipient_state",
          "product_name",
          "freight_value",
          "finish_reason",
          "final_status",
          "final_freight_stage",
          "started_at",
          "finished_at",
        ]);
  }

  return result;
}

async function queryFinancial(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  if (!canReadFinancial(context)) {
    return { error: "Usuario sem permissao financeira para consulta." };
  }

  const direction = textArg(args, "direction");
  const status = textArg(args, "status");
  const directions: Array<"receivable" | "payable"> =
    direction === "receivable" || direction === "payable" ? [direction] : ["receivable", "payable"];
  const pageSize = limitFromArgs(args);
  const { asksPartnerProfitability } = classifyFrotakQuestion(textArg(args, "question") ?? "");

  let partnerProfitability: Record<string, unknown> | null = null;
  if (asksPartnerProfitability) {
    const requestedDays = Number(args.days ?? 365);
    const days = Number.isFinite(requestedDays)
      ? Math.max(1, Math.min(3650, Math.trunc(requestedDays)))
      : 365;
    const endDate = dateArg(args, "end_date") ?? new Date().toISOString().slice(0, 10);
    const startFallback = new Date(`${endDate}T12:00:00.000Z`);
    startFallback.setUTCDate(startFallback.getUTCDate() - (days - 1));
    const startDate = dateArg(args, "start_date") ?? startFallback.toISOString().slice(0, 10);
    if (startDate > endDate) {
      return { error: "Periodo financeiro invalido.", code: "INVALID_FINANCIAL_PERIOD" };
    }
    const { data, error } = await supabase.rpc("get_partner_profitability", {
      p_workspace_id: context.workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_vehicle_id: null,
      p_billing_partner_id: null,
      p_sender_id: null,
      p_recipient_id: null,
      p_product_id: null,
      p_implement_model: null,
      p_payment_type: null,
    });
    if (error) return { error: error.message, code: error.code };

    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    partnerProfitability = {
      period: { startDate, endDate },
      count: rows.length,
      items: compactRows(rows, [
        "partnerName",
        "revenue",
        "costs",
        "result",
        "margin",
        "freightCount",
      ]),
    };
  }

  const pages = await Promise.all(
    directions.map(async (itemDirection) => {
      const { data, error } = await supabase.rpc("list_financial_documents_page", {
        p_payload: {
          workspaceId: context.workspaceId,
          direction: itemDirection,
          status: status ?? "all",
          page: 1,
          pageSize,
        },
      });
      return { direction: itemDirection, data, error };
    }),
  );

  const failedPage = pages.find((page) => page.error);
  if (failedPage?.error) {
    return { error: failedPage.error.message, code: failedPage.error.code };
  }

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

    const pageRows = Array.isArray(payload.rows)
      ? (payload.rows as Array<Record<string, unknown>>)
      : [];
    pageRows.forEach((row) => rows.push({ direction: page.direction, ...row }));
  });

  return {
    count: rows.length,
    totalCount,
    totals,
    basis: "open_installment_balance",
    ...(partnerProfitability ? { partnerProfitability } : {}),
    items: compactRows(rows, [
      "direction",
      "description",
      "originalAmount",
      "outstandingBalance",
      "competenceDate",
      "issueDate",
      "status",
      "sourceType",
      "partnerName",
    ]),
  };
}

async function queryFuelRecords(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("fuel_records")
    .select("vehicle_plate, driver_name, station, fuel_type, liters, amount, odometer, recorded_at")
    .eq("tenant_id", context.tenantId)
    .order("recorded_at", { ascending: false })
    .limit(limitFromArgs(args));

  const fuelType = textArg(args, "fuel_type");
  if (fuelType === "diesel_s10" || fuelType === "arla") query = query.eq("fuel_type", fuelType);

  const search = textArg(args, "query");
  if (search) {
    query = query.or(
      `vehicle_plate.ilike.%${search}%,driver_name.ilike.%${search}%,station.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) return { error: error.message, code: error.code };

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    liters: numberValue(row.liters),
    amount: numberValue(row.amount),
    odometer: numberValue(row.odometer),
  }));

  return {
    count: rows.length,
    totalLiters: rows.reduce((acc, row) => acc + numberValue(row.liters), 0),
    totalAmount: rows.reduce((acc, row) => acc + numberValue(row.amount), 0),
    items: rows,
  };
}

async function queryPositions(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Record<string, unknown>,
) {
  let query = supabase
    .from("vehicle_positions")
    .select("vehicle_id, lat, lng, city, state, speed, direction, source, recorded_at")
    .eq("tenant_id", context.tenantId)
    .order("recorded_at", { ascending: false })
    .limit(limitFromArgs(args));

  const source = textArg(args, "status");
  if (source) query = query.eq("source", source);

  const { data, error } = await query;
  if (error) return { error: error.message, code: error.code };

  return {
    count: data?.length ?? 0,
    items: compactRows((data ?? []) as Array<Record<string, unknown>>, [
      "vehicle_id",
      "lat",
      "lng",
      "city",
      "state",
      "speed",
      "direction",
      "source",
      "recorded_at",
    ]),
  };
}
