import { canReadFinancial, type FrotakAiContext } from "@/lib/frotakAiContext";
import type { getSupabaseServerClient } from "@/lib/frotakAiContext";

// Catalogo de leitura da Frotak IA. Cada dominio aponta para uma tabela que ja tem RLS por
// tenant; as consultas rodam com o token do usuario, entao o banco continua decidindo o que
// ele pode ver. Uma tabela nova vira uma entrada aqui, nao uma ferramenta nova.

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type Row = Record<string, unknown>;

type ColumnKind = "text" | "number" | "date" | "bool" | "vehicle" | "driver" | "partner";

type DomainSpec = {
  table: string;
  description: string;
  columns: Record<string, ColumnKind>;
  dateColumn?: string;
  search?: string[];
  sums?: string[];
  groups?: string[];
  order: string;
  financial?: boolean;
  // Colunas vindas de tabela relacionada (nome -> caminho no PostgREST).
  embed?: { select: string; paths: Record<string, string> };
};

export const FROTAK_AI_DOMAINS = {
  frota: {
    table: "vehicles",
    description: "caminhoes e veiculos, situacao e etapa atual",
    columns: {
      plate: "text",
      type: "text",
      brand: "text",
      model: "text",
      manufacture_year: "number",
      status: "text",
      vehicle_situation: "text",
      freight_stage: "text",
      city: "text",
      state: "text",
      driver_id: "driver",
      freight_value: "number",
      last_position_at: "date",
      updated_at: "date",
    },
    search: ["plate", "type", "brand", "model", "city"],
    groups: ["vehicle_situation", "freight_stage"],
    order: "plate",
  },
  motoristas: {
    table: "drivers",
    description: "motoristas, contato, CNH e veiculo vinculado",
    columns: {
      name: "text",
      phone: "text",
      cnh: "text",
      active: "bool",
      partner_role: "text",
      vehicle_id: "vehicle",
      updated_at: "date",
    },
    search: ["name", "phone", "cnh"],
    groups: ["active"],
    order: "name",
  },
  implementos: {
    table: "trailers",
    description: "carretas, cacambas e implementos",
    columns: {
      identifier: "text",
      type: "text",
      brand: "text",
      model: "text",
      implement_type: "text",
      implement_model: "text",
      manufacture_year: "number",
      vehicle_id: "vehicle",
    },
    search: ["identifier", "type", "brand", "model"],
    groups: ["implement_type"],
    order: "identifier",
  },
  fretes: {
    table: "freights",
    description:
      "fretes do sistema (lifecycle_status: planned, active, completed, cancelled), com valor, etapa e datas",
    columns: {
      vehicle_id: "vehicle",
      driver_id: "driver",
      billing_partner_id: "partner",
      freight_value: "number",
      unloaded_tons: "number",
      freight_ton_price: "number",
      lifecycle_status: "text",
      operational_status: "text",
      freight_stage: "text",
      freight_payment_type: "text",
      freight_pricing_mode: "text",
      origin_uf: "text",
      destination_uf: "text",
      started_at: "date",
      delivered_at: "date",
      completed_at: "date",
    },
    dateColumn: "started_at",
    sums: ["freight_value", "unloaded_tons"],
    groups: ["lifecycle_status", "vehicle_id"],
    order: "started_at.desc",
  },
  fretes_encerrados: {
    table: "freight_history",
    description:
      "historico de fretes finalizados, com placa, motorista, cliente, produto e cidades",
    columns: {
      vehicle_plate: "text",
      driver_name: "text",
      sender_name: "text",
      sender_city: "text",
      recipient_name: "text",
      recipient_city: "text",
      product_name: "text",
      freight_value: "number",
      unloaded_tons: "number",
      final_status: "text",
      finish_reason: "text",
      origin_uf: "text",
      destination_uf: "text",
      started_at: "date",
      finished_at: "date",
    },
    dateColumn: "finished_at",
    search: ["vehicle_plate", "driver_name", "sender_name", "recipient_name", "product_name"],
    sums: ["freight_value", "unloaded_tons"],
    groups: ["vehicle_plate", "recipient_name"],
    order: "finished_at.desc",
  },
  despesas_frete: {
    table: "freight_expenses",
    description:
      "despesas lancadas nos fretes (category: diesel_s10, arla, pedagio, alimentacao, estacionamento, manutencao, outros)",
    columns: {
      vehicle_id: "vehicle",
      driver_id: "driver",
      category: "text",
      description: "text",
      amount: "number",
      source: "text",
      payment_source: "text",
      recorded_at: "date",
    },
    dateColumn: "recorded_at",
    search: ["description"],
    sums: ["amount"],
    groups: ["category", "vehicle_id"],
    order: "recorded_at.desc",
  },
  caixa_viagem: {
    table: "freight_cash_entries",
    description: "dinheiro entregue ao motorista para a viagem (adiantamentos de caixa)",
    columns: {
      vehicle_id: "vehicle",
      driver_id: "driver",
      business_partner_id: "partner",
      origin: "text",
      amount: "number",
      notes: "text",
      source: "text",
      recorded_at: "date",
    },
    dateColumn: "recorded_at",
    search: ["origin", "notes"],
    sums: ["amount"],
    groups: ["driver_id", "origin"],
    order: "recorded_at.desc",
  },
  documentos_frete: {
    table: "freight_documents",
    description: "notas, CT-e e comprovantes anexados aos fretes, com status",
    columns: {
      vehicle_id: "vehicle",
      driver_id: "driver",
      kind: "text",
      source: "text",
      file_name: "text",
      status: "text",
      created_at: "date",
    },
    dateColumn: "created_at",
    search: ["file_name"],
    groups: ["kind", "status"],
    order: "created_at.desc",
  },
  eventos_frota: {
    table: "fleet_events",
    description: "linha do tempo da frota: mudancas de status, ocorrencias e acoes",
    columns: {
      vehicle_id: "vehicle",
      status: "text",
      freight_stage: "text",
      city: "text",
      state: "text",
      source: "text",
      description: "text",
      event_type: "text",
      action_origin: "text",
      timestamp: "date",
    },
    dateColumn: "timestamp",
    search: ["description", "city"],
    groups: ["event_type", "vehicle_id"],
    order: "timestamp.desc",
  },
  viagens: {
    table: "driver_trip_cycles",
    description:
      "ciclos de viagem do motorista (status: open, closed, cancelled) com caixa, despesas, saldo e km",
    columns: {
      driver_id: "driver",
      vehicle_id: "vehicle",
      status: "text",
      close_reason: "text",
      total_cash_entries: "number",
      total_expenses: "number",
      closing_balance: "number",
      freight_count: "number",
      completed_freight_count: "number",
      start_odometer: "number",
      end_odometer: "number",
      started_at: "date",
      closed_at: "date",
    },
    dateColumn: "started_at",
    sums: ["total_cash_entries", "total_expenses", "closing_balance", "freight_count"],
    groups: ["status", "driver_id"],
    order: "started_at.desc",
  },
  diarias: {
    table: "driver_trip_daily_allowances",
    description:
      "diarias de motorista (status: submitted, approved, rejected, cancelled) com quantidade e valor",
    columns: {
      driver_id: "driver",
      vehicle_id: "vehicle",
      quantity: "number",
      unit_amount: "number",
      total_amount: "number",
      status: "text",
      notes: "text",
      submitted_at: "date",
      reviewed_at: "date",
    },
    dateColumn: "submitted_at",
    sums: ["quantity", "total_amount"],
    groups: ["status", "driver_id"],
    order: "submitted_at.desc",
  },
  abastecimentos: {
    table: "fuel_records",
    description: "abastecimentos com placa, motorista, posto, combustivel, litros e valor",
    columns: {
      vehicle_plate: "text",
      driver_name: "text",
      station: "text",
      fuel_type: "text",
      liters: "number",
      amount: "number",
      odometer: "number",
      recorded_at: "date",
    },
    dateColumn: "recorded_at",
    search: ["vehicle_plate", "driver_name", "station"],
    sums: ["liters", "amount"],
    groups: ["vehicle_plate", "station"],
    order: "recorded_at.desc",
  },
  folha: {
    table: "payroll_entries",
    description:
      "folha de pagamento por funcionario (status: draft, calculated, approved, posted, paid, voided)",
    columns: {
      employee_name_snapshot: "text",
      job_title_snapshot: "text",
      base_salary_snapshot: "number",
      gross_amount: "number",
      deduction_amount: "number",
      net_amount: "number",
      status: "text",
      due_date: "date",
    },
    dateColumn: "due_date",
    search: ["employee_name_snapshot", "job_title_snapshot"],
    sums: ["gross_amount", "deduction_amount", "net_amount"],
    groups: ["status", "job_title_snapshot"],
    order: "due_date.desc",
    financial: true,
  },
  adiantamentos_funcionarios: {
    table: "employee_advances",
    description: "adiantamentos salariais (status: available, applied, voided)",
    columns: { amount: "number", paid_on: "date", description: "text", status: "text" },
    dateColumn: "paid_on",
    search: ["description"],
    sums: ["amount"],
    groups: ["status"],
    order: "paid_on.desc",
    financial: true,
  },
  lancamentos_financeiros: {
    table: "financial_documents",
    description:
      "lancamentos financeiros (direction: receivable ou payable; status: draft, posted, partially_settled, settled, voided)",
    columns: {
      direction: "text",
      document_type: "text",
      document_number: "text",
      description: "text",
      partner_id: "partner",
      original_amount: "number",
      status: "text",
      competence_date: "date",
      issue_date: "date",
    },
    dateColumn: "competence_date",
    search: ["description", "document_number"],
    sums: ["original_amount"],
    groups: ["direction", "status"],
    order: "competence_date.desc",
    financial: true,
  },
  parcelas_financeiras: {
    table: "financial_installments",
    description:
      "parcelas a pagar e a receber com vencimento e saldo (direcao: receivable ou payable; status: open, partially_settled, settled, voided)",
    columns: {
      direcao: "text",
      descricao: "text",
      installment_number: "number",
      amount: "number",
      settled_amount: "number",
      balance: "number",
      status: "text",
      due_date: "date",
      settled_at: "date",
    },
    embed: {
      select: "financial_documents!inner(direction,description)",
      paths: {
        direcao: "financial_documents.direction",
        descricao: "financial_documents.description",
      },
    },
    dateColumn: "due_date",
    sums: ["amount", "settled_amount", "balance"],
    groups: ["status", "direcao"],
    order: "due_date",
    financial: true,
  },
  parceiros: {
    table: "business_partners",
    description: "clientes, fornecedores e postos",
    columns: { legal_name: "text", trade_name: "text", tax_id: "text", active: "bool" },
    search: ["legal_name", "trade_name", "tax_id"],
    groups: ["active"],
    order: "trade_name",
  },
  produtos: {
    table: "products",
    description: "produtos transportados",
    columns: { name: "text", active: "bool" },
    search: ["name"],
    groups: ["active"],
    order: "name",
  },
} satisfies Record<string, DomainSpec>;

export type FrotakAiDomainName = keyof typeof FROTAK_AI_DOMAINS;

export const FROTAK_AI_DOMAIN_NAMES = Object.keys(FROTAK_AI_DOMAINS) as FrotakAiDomainName[];

const OPERATORS = [
  "igual",
  "diferente",
  "contem",
  "maior",
  "maior_igual",
  "menor",
  "menor_igual",
  "vazio",
  "preenchido",
] as const;
type Operator = (typeof OPERATORS)[number];

// Campos "humanos" que viram filtro por id (ex.: placa -> vehicle_id).
const VIRTUAL_FILTERS = {
  placa: "vehicle",
  motorista: "driver",
  parceiro: "partner",
} as const satisfies Record<string, ColumnKind>;

const DATE_ONLY_COLUMNS = new Set(["due_date", "paid_on", "competence_date", "issue_date"]);

const LIST_LIMIT_DEFAULT = 20;
const LIST_LIMIT_MAX = 80;
const SCAN_PAGE = 1000;
const SCAN_MAX = 5000;
const GROUPS_MAX = 25;

export function frotakAiDomainCatalogText() {
  return FROTAK_AI_DOMAIN_NAMES.map((name) => {
    const spec: DomainSpec = FROTAK_AI_DOMAINS[name];
    const columns = Object.keys(spec.columns).join(", ");
    const owner = spec.financial ? " [somente owner]" : "";
    const date = spec.dateColumn ? ` Data: ${spec.dateColumn}.` : "";
    return `${name}${owner}: ${spec.description}. Campos: ${columns}.${date}`;
  }).join(" | ");
}

function domainSpec(name: unknown): { name: FrotakAiDomainName; spec: DomainSpec } | null {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase() as FrotakAiDomainName;
  return key in FROTAK_AI_DOMAINS ? { name: key, spec: FROTAK_AI_DOMAINS[key] } : null;
}

function cleanSearch(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/[,%()*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return text || undefined;
}

function plateKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function dateArg(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : undefined;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function resolvePeriod(args: Row, defaultDays?: number) {
  let start = dateArg(args.start_date);
  let end = dateArg(args.end_date);
  const days = Number(args.days ?? defaultDays);
  if (!start && Number.isFinite(days) && days > 0) {
    const base = new Date(`${end ?? today()}T12:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() - (Math.min(3650, Math.trunc(days)) - 1));
    start = base.toISOString().slice(0, 10);
    end = end ?? today();
  }
  if (start && end && start > end) {
    return {
      error: "Periodo invalido: a data inicial e posterior a data final.",
      code: "INVALID_PERIOD",
    };
  }
  return { start, end };
}

function readField(row: Row, spec: DomainSpec, column: string) {
  const path = spec.embed?.paths[column];
  if (!path) return row[column];
  const [relation, field] = path.split(".");
  const nested = row[relation];
  const record = Array.isArray(nested) ? nested[0] : nested;
  return record && typeof record === "object" ? (record as Row)[field] : undefined;
}

function filterPath(spec: DomainSpec, column: string) {
  return spec.embed?.paths[column] ?? column;
}

function selectList(spec: DomainSpec, columns: string[]) {
  const own = columns.filter((column) => !spec.embed?.paths[column]);
  const parts = Array.from(new Set(["id", ...own]));
  if (spec.embed) parts.push(spec.embed.select);
  return parts.join(", ");
}

type Lookups = {
  vehicle: Map<string, string>;
  driver: Map<string, string>;
  partner: Map<string, string>;
};

async function fetchLabels(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  kind: "vehicle" | "driver" | "partner",
  ids: string[],
) {
  const labels = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let index = 0; index < unique.length; index += 200) {
    const chunk = unique.slice(index, index + 200);
    const table =
      kind === "vehicle" ? "vehicles" : kind === "driver" ? "drivers" : "business_partners";
    const columns =
      kind === "vehicle"
        ? "id, plate"
        : kind === "driver"
          ? "id, name"
          : "id, trade_name, legal_name";
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("tenant_id", context.tenantId)
      .in("id", chunk);
    if (error) throw new Error(error.message);
    ((data ?? []) as unknown as Row[]).forEach((row) => {
      const label =
        kind === "vehicle"
          ? row.plate
          : kind === "driver"
            ? row.name
            : row.trade_name || row.legal_name;
      labels.set(String(row.id), String(label ?? ""));
    });
  }
  return labels;
}

async function resolveLookups(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  spec: DomainSpec,
  rows: Row[],
  columns: string[],
): Promise<Lookups> {
  const ids: Record<"vehicle" | "driver" | "partner", string[]> = {
    vehicle: [],
    driver: [],
    partner: [],
  };
  columns.forEach((column) => {
    const kind = spec.columns[column];
    if (kind === "vehicle" || kind === "driver" || kind === "partner") {
      rows.forEach((row) => {
        if (row[column]) ids[kind].push(String(row[column]));
      });
    }
  });
  const [vehicle, driver, partner] = await Promise.all([
    ids.vehicle.length ? fetchLabels(supabase, context, "vehicle", ids.vehicle) : new Map(),
    ids.driver.length ? fetchLabels(supabase, context, "driver", ids.driver) : new Map(),
    ids.partner.length ? fetchLabels(supabase, context, "partner", ids.partner) : new Map(),
  ]);
  return { vehicle, driver, partner };
}

function refLabelKey(kind: ColumnKind) {
  return kind === "vehicle" ? "placa" : kind === "driver" ? "motorista" : "parceiro";
}

function presentRow(row: Row, spec: DomainSpec, columns: string[], lookups: Lookups) {
  const item: Row = {};
  columns.forEach((column) => {
    const kind = spec.columns[column];
    const value = readField(row, spec, column);
    if (value === null || value === undefined || value === "") return;
    if (kind === "vehicle" || kind === "driver" || kind === "partner") {
      item[refLabelKey(kind)] = lookups[kind].get(String(value)) ?? null;
      return;
    }
    item[column] = kind === "number" ? numberValue(value) : value;
  });
  return item;
}

type Filter = { campo?: unknown; operador?: unknown; valor?: unknown };

async function idsForVirtualFilter(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  kind: "vehicle" | "driver" | "partner",
  value: string,
) {
  const search = cleanSearch(value);
  if (!search) return [];
  let query;
  if (kind === "vehicle") {
    const plate = plateKey(search);
    const pattern = plate.split("").join("%");
    query = supabase
      .from("vehicles")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .ilike("plate", `%${pattern}%`);
  } else if (kind === "driver") {
    query = supabase
      .from("drivers")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .ilike("name", `%${search}%`);
  } else {
    query = supabase
      .from("business_partners")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .or(`trade_name.ilike.%${search}%,legal_name.ilike.%${search}%,tax_id.ilike.%${search}%`);
  }
  const { data, error } = await query.limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => String(row.id));
}

type BuiltQuery = {
  // Aplica tenant, periodo, busca e filtros em uma consulta nova.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (query: any) => any;
  notFound?: string;
};

async function buildFilters(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  spec: DomainSpec,
  args: Row,
  period: { start?: string; end?: string },
): Promise<BuiltQuery | { error: string; code: string }> {
  const steps: Array<(query: any) => any> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  steps.push((query) => query.eq("tenant_id", context.tenantId));

  if (spec.dateColumn && period.start) {
    const column = spec.dateColumn;
    const start = period.start;
    steps.push((query) => query.gte(column, start));
  }
  if (spec.dateColumn && period.end) {
    const column = spec.dateColumn;
    // Colunas timestamp precisam ir ate o fim do dia; colunas date comparam a data pura.
    const end = DATE_ONLY_COLUMNS.has(column) ? period.end : `${period.end}T23:59:59.999Z`;
    steps.push((query) => query.lte(column, end));
  }

  const search = cleanSearch(args.busca);
  if (search && spec.search?.length) {
    const expression = spec.search.map((column) => `${column}.ilike.%${search}%`).join(",");
    steps.push((query) => query.or(expression));
  }

  const filters = Array.isArray(args.filtros) ? (args.filtros as Filter[]).slice(0, 8) : [];
  let notFound: string | undefined;
  for (const filter of filters) {
    const field = typeof filter.campo === "string" ? filter.campo.trim().toLowerCase() : "";
    const operator = (
      typeof filter.operador === "string" ? filter.operador.trim().toLowerCase() : "igual"
    ) as Operator;
    const raw = filter.valor === undefined || filter.valor === null ? "" : String(filter.valor);
    if (!OPERATORS.includes(operator)) {
      return { error: `Operador desconhecido: ${operator}.`, code: "INVALID_FILTER" };
    }

    if (field in VIRTUAL_FILTERS) {
      const kind = VIRTUAL_FILTERS[field as keyof typeof VIRTUAL_FILTERS];
      const column = Object.keys(spec.columns).find((name) => spec.columns[name] === kind);
      if (!column) {
        // Dominios que guardam o texto direto (ex.: vehicle_plate) usam a coluna de texto.
        const textColumn =
          kind === "vehicle"
            ? ["plate", "vehicle_plate"].find((name) => name in spec.columns)
            : kind === "driver"
              ? ["name", "driver_name"].find((name) => name in spec.columns)
              : undefined;
        if (!textColumn) {
          return { error: `O dominio nao tem o campo ${field}.`, code: "INVALID_FILTER" };
        }
        const value = cleanSearch(raw) ?? "";
        const pattern = kind === "vehicle" ? plateKey(value).split("").join("%") : value;
        steps.push((query) => query.ilike(textColumn, `%${pattern}%`));
        continue;
      }
      const ids = await idsForVirtualFilter(supabase, context, kind, raw);
      if (ids.length === 0) {
        notFound = `Nenhum ${field} encontrado para "${raw}".`;
        break;
      }
      steps.push((query) => query.in(column, ids));
      continue;
    }

    const kind = spec.columns[field];
    if (!kind) {
      return {
        error: `Campo ${field} nao existe neste dominio. Campos: ${Object.keys(spec.columns).join(", ")}.`,
        code: "INVALID_FILTER",
      };
    }
    const path = filterPath(spec, field);
    if (operator === "vazio") {
      steps.push((query) => query.is(path, null));
      continue;
    }
    if (operator === "preenchido") {
      steps.push((query) => query.not(path, "is", null));
      continue;
    }
    let value: string | number | boolean = raw.trim();
    if (kind === "number") {
      value = Number(String(value).replace(",", "."));
      if (!Number.isFinite(value)) {
        return { error: `Valor numerico invalido para ${field}.`, code: "INVALID_FILTER" };
      }
    } else if (kind === "bool") {
      value = /^(true|sim|1|ativo|yes)$/i.test(String(value));
    } else if (kind === "date") {
      if (!dateArg(String(value))) {
        return { error: `Use datas YYYY-MM-DD no campo ${field}.`, code: "INVALID_FILTER" };
      }
    } else if (kind !== "text") {
      return {
        error: `Filtre ${field} usando placa, motorista ou parceiro.`,
        code: "INVALID_FILTER",
      };
    }
    const textValue = typeof value === "string" ? (cleanSearch(value) ?? "") : value;
    switch (operator) {
      case "igual":
        steps.push((query) =>
          kind === "text" ? query.ilike(path, String(textValue)) : query.eq(path, textValue),
        );
        break;
      case "diferente":
        steps.push((query) =>
          kind === "text"
            ? query.not(path, "ilike", String(textValue))
            : query.neq(path, textValue),
        );
        break;
      case "contem":
        steps.push((query) => query.ilike(path, `%${textValue}%`));
        break;
      case "maior":
        steps.push((query) => query.gt(path, textValue));
        break;
      case "maior_igual":
        steps.push((query) => query.gte(path, textValue));
        break;
      case "menor":
        steps.push((query) => query.lt(path, textValue));
        break;
      case "menor_igual":
        steps.push((query) => query.lte(path, textValue));
        break;
    }
  }

  return {
    apply: (query) => steps.reduce((current, step) => step(current), query),
    notFound,
  };
}

function orderFor(spec: DomainSpec, args: Row) {
  const requested = typeof args.ordenar === "string" ? args.ordenar.trim().toLowerCase() : "";
  const direction = args.ordem === "asc" ? "asc" : args.ordem === "desc" ? "desc" : undefined;
  if (requested && requested in spec.columns && !spec.embed?.paths[requested]) {
    return { column: requested, ascending: direction ? direction === "asc" : false };
  }
  const [column, defaultDirection] = spec.order.split(".");
  return { column, ascending: direction ? direction === "asc" : defaultDirection !== "desc" };
}

type GroupKey = { column: string; by?: "mes" | "dia" };

function groupKeyFor(spec: DomainSpec, value: unknown): GroupKey | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = value.trim().toLowerCase();
  if ((key === "mes" || key === "dia") && spec.dateColumn)
    return { column: spec.dateColumn, by: key };
  if (key in VIRTUAL_FILTERS) {
    const kind = VIRTUAL_FILTERS[key as keyof typeof VIRTUAL_FILTERS];
    const column = Object.keys(spec.columns).find((name) => spec.columns[name] === kind);
    if (column) return { column };
    // Dominios que guardam o texto direto (ex.: abastecimentos.vehicle_plate).
    const textColumn = (
      kind === "vehicle"
        ? ["plate", "vehicle_plate"]
        : kind === "driver"
          ? ["name", "driver_name"]
          : []
    ).find((name) => name in spec.columns);
    if (textColumn) return { column: textColumn };
  }
  return key in spec.columns ? { column: key } : null;
}

async function scanRows(
  supabase: SupabaseServer,
  spec: DomainSpec,
  built: BuiltQuery,
  columns: string[],
) {
  const rows: Row[] = [];
  let total = 0;
  for (let from = 0; from < SCAN_MAX; from += SCAN_PAGE) {
    const query = built.apply(
      supabase.from(spec.table).select(selectList(spec, columns), { count: "exact" }),
    );
    const { data, error, count } = await query.order("id").range(from, from + SCAN_PAGE - 1);
    if (error) throw new Error(error.message);
    total = count ?? total;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < SCAN_PAGE) break;
  }
  return { rows, total: Math.max(total, rows.length), truncated: total > rows.length };
}

function sumRows(rows: Row[], spec: DomainSpec) {
  const totals: Row = { registros: rows.length };
  (spec.sums ?? []).forEach((column) => {
    totals[column] = round(
      rows.reduce((sum, row) => sum + numberValue(readField(row, spec, column)), 0),
    );
  });
  return totals;
}

function groupRows(rows: Row[], spec: DomainSpec, group: GroupKey, lookups: Lookups) {
  const kind = spec.columns[group.column];
  const buckets = new Map<string, Row[]>();
  rows.forEach((row) => {
    const value = readField(row, spec, group.column);
    let key = value === null || value === undefined || value === "" ? "(sem valor)" : String(value);
    if (group.by === "mes" && key !== "(sem valor)") key = key.slice(0, 7);
    if (group.by === "dia" && key !== "(sem valor)") key = key.slice(0, 10);
    if ((kind === "vehicle" || kind === "driver" || kind === "partner") && key !== "(sem valor)") {
      key = lookups[kind].get(key) || "(nao identificado)";
    }
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  });
  const metric = spec.sums?.[0];
  const groups: Row[] = Array.from(buckets.entries()).map(([key, bucket]) => ({
    grupo: key,
    ...sumRows(bucket, spec),
  }));
  groups.sort((a, b) => {
    if (group.by) return String(a.grupo).localeCompare(String(b.grupo));
    if (metric) return numberValue(b[metric]) - numberValue(a[metric]);
    return numberValue(b.registros) - numberValue(a.registros);
  });
  return {
    agrupado_por: group.by ?? group.column,
    grupos: groups.slice(0, GROUPS_MAX),
    total_grupos: groups.length,
  };
}

function domainAccess(context: FrotakAiContext, args: Row) {
  const domain = domainSpec(args.dominio);
  if (!domain) {
    return {
      error: `Dominio desconhecido. Use um de: ${FROTAK_AI_DOMAIN_NAMES.join(", ")}.`,
      code: "INVALID_DOMAIN",
    };
  }
  if (domain.spec.financial && !canReadFinancial(context)) {
    return {
      error: "Dados financeiros sao exclusivos para o owner da empresa.",
      code: "OWNER_REQUIRED",
    };
  }
  return domain;
}

export async function queryFrotakAiDomain(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Row,
): Promise<Row> {
  const domain = domainAccess(context, args);
  if ("error" in domain) return domain;
  const { name, spec } = domain;
  const period = resolvePeriod(args);
  if ("error" in period) return period;
  const built = await buildFilters(supabase, context, spec, args, period);
  if ("error" in built) return built;
  const periodo =
    period.start || period.end ? { inicio: period.start, fim: period.end } : undefined;
  if (built.notFound) {
    return { dominio: name, periodo, registros: 0, itens: [], aviso: built.notFound };
  }

  const columns = Object.keys(spec.columns);
  const group = groupKeyFor(spec, args.agrupar_por);
  if (args.agrupar_por && !group) {
    return {
      error: `Nao da para agrupar por ${String(args.agrupar_por)}. Use mes, dia, placa, motorista ou: ${Object.keys(spec.columns).join(", ")}.`,
      code: "INVALID_FILTER",
    };
  }

  if (group || args.totais === true) {
    const needed = Array.from(new Set([...(spec.sums ?? []), ...(group ? [group.column] : [])]));
    const scan = await scanRows(supabase, spec, built, needed);
    const lookups = group
      ? await resolveLookups(supabase, context, spec, scan.rows, [group.column])
      : { vehicle: new Map(), driver: new Map(), partner: new Map() };
    return {
      dominio: name,
      periodo,
      calculado_por: "servidor",
      totais: sumRows(scan.rows, spec),
      ...(group ? groupRows(scan.rows, spec, group, lookups) : {}),
      ...(scan.truncated
        ? {
            aviso: `Somei os primeiros ${scan.rows.length} de ${scan.total} registros. Peca um periodo menor para o total exato.`,
          }
        : {}),
    };
  }

  const limit = Math.max(
    1,
    Math.min(
      LIST_LIMIT_MAX,
      Math.trunc(Number(args.limite ?? LIST_LIMIT_DEFAULT)) || LIST_LIMIT_DEFAULT,
    ),
  );
  const order = orderFor(spec, args);
  const query = built.apply(
    supabase.from(spec.table).select(selectList(spec, columns), { count: "exact" }),
  );
  const { data, error, count } = await query
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .limit(limit);
  if (error) return { error: error.message, code: error.code };
  const rows = (data ?? []) as Row[];
  const lookups = await resolveLookups(supabase, context, spec, rows, columns);
  return {
    dominio: name,
    periodo,
    registros: count ?? rows.length,
    mostrando: rows.length,
    itens: rows.map((row) => presentRow(row, spec, columns, lookups)),
  };
}

export async function summarizeFrotakAiDomain(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Row,
): Promise<Row> {
  const domain = domainAccess(context, args);
  if ("error" in domain) return domain;
  const { spec } = domain;
  const withPeriod =
    spec.dateColumn && !args.start_date && !args.days ? { ...args, days: 30 } : args;
  const breakdowns = (spec.groups ?? []).slice(0, 2);
  const results = await Promise.all(
    (breakdowns.length ? breakdowns : [undefined]).map((group) =>
      queryFrotakAiDomain(supabase, context, { ...withPeriod, agrupar_por: group, totais: true }),
    ),
  );
  const failed = results.find((result) => typeof result.error === "string");
  if (failed) return failed;
  const [first, ...rest] = results;
  return {
    ...first,
    grupos: undefined,
    agrupado_por: undefined,
    total_grupos: undefined,
    detalhamentos: results
      .filter((result) => result.grupos)
      .map((result) => ({ por: result.agrupado_por, grupos: result.grupos })),
    ...(rest.find((result) => result.aviso)
      ? { aviso: rest.find((result) => result.aviso)?.aviso }
      : {}),
  };
}

export async function searchFrotakAiTenant(
  supabase: SupabaseServer,
  context: FrotakAiContext,
  args: Row,
): Promise<Row> {
  const text = cleanSearch(args.texto ?? args.query);
  if (!text) return { error: "Informe o que buscar.", code: "INVALID_FILTER" };
  const plate = plateKey(text).split("").join("%");
  const tenant = context.tenantId;
  const [vehicles, drivers, trailers, partners, products] = await Promise.all([
    supabase
      .from("vehicles")
      .select("plate, type, model, vehicle_situation, city")
      .eq("tenant_id", tenant)
      .or(`plate.ilike.%${plate}%,model.ilike.%${text}%,type.ilike.%${text}%`)
      .limit(5),
    supabase
      .from("drivers")
      .select("name, phone, active")
      .eq("tenant_id", tenant)
      .or(`name.ilike.%${text}%,phone.ilike.%${text}%,cnh.ilike.%${text}%`)
      .limit(5),
    supabase
      .from("trailers")
      .select("identifier, type, brand, model")
      .eq("tenant_id", tenant)
      .or(`identifier.ilike.%${text}%,model.ilike.%${text}%`)
      .limit(5),
    supabase
      .from("business_partners")
      .select("trade_name, legal_name, tax_id, active")
      .eq("tenant_id", tenant)
      .or(`trade_name.ilike.%${text}%,legal_name.ilike.%${text}%,tax_id.ilike.%${text}%`)
      .limit(5),
    supabase
      .from("products")
      .select("name, active")
      .eq("tenant_id", tenant)
      .ilike("name", `%${text}%`)
      .limit(5),
  ]);
  const failed = [vehicles, drivers, trailers, partners, products].find((result) => result.error);
  if (failed?.error) return { error: failed.error.message, code: failed.error.code };
  const results = {
    veiculos: vehicles.data ?? [],
    motoristas: drivers.data ?? [],
    implementos: trailers.data ?? [],
    parceiros: partners.data ?? [],
    produtos: products.data ?? [],
  };
  const total = Object.values(results).reduce((sum, list) => sum + list.length, 0);
  return { texto: text, encontrados: total, ...results };
}
