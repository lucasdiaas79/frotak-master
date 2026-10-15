import type { FrotakAiToolName } from "@/lib/frotakAiToolCatalog";

type RecordValue = Record<string, unknown>;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as RecordValue[]) : [];
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "nao informado") {
  const result = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return result || fallback;
}

function countLabel(value: unknown, singular: string, plural: string) {
  const count = number(value);
  return `${decimal.format(count)} ${count === 1 ? singular : plural}`;
}

function periodLabel(value: unknown) {
  const period = record(value);
  const start = text(period.startDate, "-");
  const end = text(period.endDate, "-");
  return `${start} a ${end}`;
}

function location(row: RecordValue) {
  const city = text(row.city, "");
  const state = text(row.state, "");
  return [city, state].filter(Boolean).join("/") || "local nao informado";
}

function list(items: RecordValue[], formatter: (item: RecordValue) => string) {
  if (!items.length) return "Nenhum registro encontrado.";
  const visible = items.slice(0, 5).map((item) => `- ${formatter(item)}`);
  if (items.length > visible.length)
    visible.push(`- Mais ${items.length - visible.length} registro(s).`);
  return visible.join("\n");
}

function formatTenant(data: RecordValue) {
  const totals = record(data.totals);
  return [
    `Tenant: ${text(data.tenantName)}. Workspace: ${text(data.workspaceName)}.`,
    [
      countLabel(totals.vehicles, "veiculo", "veiculos"),
      countLabel(totals.activeDrivers, "motorista ativo", "motoristas ativos"),
      countLabel(totals.trailers, "implemento", "implementos"),
      countLabel(totals.activeFreights, "frete ativo", "fretes ativos"),
    ].join("; ") + ".",
  ].join("\n");
}

function formatVehicles(data: RecordValue) {
  const items = rows(data.items);
  return `${countLabel(data.totalCount, "veiculo encontrado", "veiculos encontrados")}.
${list(items, (item) => {
  const details = [text(item.type, ""), text(item.status, ""), location(item)].filter(Boolean);
  const driver = text(item.driver_name, "");
  if (driver) details.push(`motorista ${driver}`);
  return `${text(item.plate)}: ${details.join("; ")}`;
})}`;
}

function formatTrailers(data: RecordValue) {
  return `${countLabel(data.totalCount, "implemento encontrado", "implementos encontrados")}.
${list(rows(data.items), (item) =>
  [text(item.identifier), text(item.type, ""), text(item.brand, ""), text(item.model, "")]
    .filter(Boolean)
    .join("; "),
)}`;
}

function formatPositions(data: RecordValue) {
  return list(rows(data.items), (item) => {
    const speed =
      item.speed === null || item.speed === undefined
        ? ""
        : `${decimal.format(number(item.speed))} km/h`;
    const details = [location(item), speed, text(item.recorded_at, "")].filter(Boolean);
    return `${text(item.plate)}: ${details.join("; ")}`;
  });
}

function formatActiveFreights(data: RecordValue) {
  const items = rows(data.items);
  return `${countLabel(data.totalCount, "frete ativo", "fretes ativos")}.
${list(items, (item) => {
  const details = [
    text(item.driver_name, ""),
    text(item.freight_stage, ""),
    text(item.status, ""),
    location(item),
  ].filter(Boolean);
  if (item.freight_value !== null && item.freight_value !== undefined) {
    details.push(money.format(number(item.freight_value)));
  }
  return `${text(item.plate)}: ${details.join("; ")}`;
})}`;
}

function formatFreights(data: RecordValue) {
  const sections: string[] = [];
  const active = record(data.active);
  if (Object.keys(active).length) sections.push(formatActiveFreights(active));
  const history = record(data.history);
  if (Object.keys(history).length) {
    sections.push(
      `${countLabel(history.totalCount, "frete no historico", "fretes no historico")}.
${list(rows(history.items), (item) => {
  const route = [text(item.sender_name, ""), text(item.recipient_name, "")]
    .filter(Boolean)
    .join(" -> ");
  const details = [text(item.driver_name, ""), route, text(item.final_status, "")].filter(Boolean);
  if (item.freight_value !== null && item.freight_value !== undefined) {
    details.push(money.format(number(item.freight_value)));
  }
  return `${text(item.vehicle_plate)}: ${details.join("; ")}`;
})}`,
    );
  }
  return sections.join("\n");
}

function formatDrivers(data: RecordValue) {
  return `${countLabel(data.totalCount, "motorista encontrado", "motoristas encontrados")}.
${list(rows(data.items), (item) => {
  const details = [
    item.active === true ? "ativo" : "inativo",
    text(item.vehicle_plate, ""),
    text(item.phone, ""),
  ].filter(Boolean);
  return `${text(item.name)}: ${details.join("; ")}`;
})}`;
}

function formatPartners(data: RecordValue) {
  return `${countLabel(data.totalCount, "parceiro encontrado", "parceiros encontrados")}.
${list(rows(data.items), (item) =>
  [text(item.trade_name, text(item.legal_name)), text(item.tax_id, "")].filter(Boolean).join("; "),
)}`;
}

function formatProducts(data: RecordValue) {
  return `${countLabel(data.totalCount, "produto encontrado", "produtos encontrados")}.
${list(rows(data.items), (item) => `${text(item.name)}: ${item.active === true ? "ativo" : "inativo"}`)}`;
}

function formatFuel(data: RecordValue) {
  const totals = record(data.totals);
  return [
    `Periodo: ${periodLabel(data.period)}. ${countLabel(data.totalCount, "abastecimento", "abastecimentos")}.`,
    `Litros: ${decimal.format(number(totals.liters))}. Valor: ${money.format(number(totals.amount))}. Preco medio: ${money.format(number(totals.averagePricePerLiter))}/L.`,
  ].join("\n");
}

function formatFinancial(data: RecordValue) {
  const totals = record(data.totals);
  return [
    `${countLabel(data.totalCount, "titulo encontrado", "titulos encontrados")}.`,
    `A receber em aberto: ${money.format(number(totals.receivable))}. A pagar em aberto: ${money.format(number(totals.payable))}.`,
  ].join("\n");
}

function formatDre(data: RecordValue) {
  const totals = record(data.totals);
  const margin =
    totals.managerialMargin === null || totals.managerialMargin === undefined
      ? "nao calculada"
      : `${decimal.format(number(totals.managerialMargin))}%`;
  return [
    `DRE de ${periodLabel(data.period)}.`,
    `Receita liquida: ${money.format(number(totals.netRevenue))}. Resultado bruto: ${money.format(number(totals.grossResult))}. Resultado operacional: ${money.format(number(totals.operatingResult))}. Resultado gerencial: ${money.format(number(totals.managerial_result))}. Margem gerencial: ${margin}.`,
  ].join("\n");
}

function formatProfitability(data: RecordValue) {
  const summary = record(data.summary);
  if (Object.keys(summary).length) {
    return [
      `Rentabilidade de ${periodLabel(data.period)}.`,
      `Receita: ${money.format(number(summary.revenue))}. Custos: ${money.format(number(summary.costs))}. Resultado: ${money.format(number(summary.result))}. Margem: ${decimal.format(number(summary.margin))}%. Custos nao alocados: ${money.format(number(summary.unallocatedCosts))}.`,
    ].join("\n");
  }
  return list(rows(data.items), (item) => {
    const name = text(item.plate, text(item.partnerName, text(item.freightId)));
    return `${name}: receita ${money.format(number(item.revenue))}; custos ${money.format(number(item.costs))}; resultado ${money.format(number(item.result))}; margem ${decimal.format(number(item.margin))}%.`;
  });
}

export function createDeterministicFrotakAnswer(name: FrotakAiToolName, data: RecordValue) {
  switch (name) {
    case "consultar_tenant":
      return formatTenant(data);
    case "buscar_veiculo":
      return formatVehicles(data);
    case "buscar_implemento":
      return formatTrailers(data);
    case "consultar_posicao":
      return formatPositions(data);
    case "listar_fretes_ativos":
      return formatActiveFreights(data);
    case "consultar_frete":
      return formatFreights(data);
    case "consultar_motorista":
      return formatDrivers(data);
    case "buscar_parceiro":
      return formatPartners(data);
    case "buscar_produto":
      return formatProducts(data);
    case "consultar_abastecimentos":
      return formatFuel(data);
    case "consultar_financeiro":
      return formatFinancial(data);
    case "consultar_dre":
      return formatDre(data);
    case "consultar_rentabilidade":
      return formatProfitability(data);
    case "consultar_suporte":
      return null;
  }
}

export function deterministicAnswerFromToolResult(value: unknown) {
  const result = record(value);
  return typeof result.deterministicAnswer === "string" && result.deterministicAnswer.trim()
    ? result.deterministicAnswer.trim()
    : null;
}
