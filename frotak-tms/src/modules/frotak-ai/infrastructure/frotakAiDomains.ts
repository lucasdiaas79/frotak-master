import { canReadFinancial, type FrotakAiContext } from "@/modules/frotak-ai/domain/frotakAiContext";
import type { getSupabaseServerClient } from "@/modules/frotak-ai/infrastructure/frotakAiContext";
import {
  FROTAK_AI_DOMAINS,
  FROTAK_AI_DOMAIN_NAMES,
  type ColumnKind,
  type DomainSpec,
  type FrotakAiDomainName,
} from "@/modules/frotak-ai/domain/frotakAiDomainCatalog";

// Catalogo de leitura da Frotak IA. Cada dominio aponta para uma tabela que ja tem RLS por
// tenant; as consultas rodam com o token do usuario, entao o banco continua decidindo o que
// ele pode ver. Uma tabela nova vira uma entrada aqui, nao uma ferramenta nova.

type SupabaseServer = ReturnType<typeof getSupabaseServerClient>;
type Row = Record<string, unknown>;

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
