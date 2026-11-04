// Catalogo de leitura da Frotak IA: cada dominio aponta para uma tabela que ja tem RLS por
// tenant. Uma tabela nova vira uma entrada aqui, nao uma ferramenta nova. So dados, sem consulta.

export type ColumnKind = "text" | "number" | "date" | "bool" | "vehicle" | "driver" | "partner";

export type DomainSpec = {
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

export function frotakAiDomainCatalogText() {
  return FROTAK_AI_DOMAIN_NAMES.map((name) => {
    const spec: DomainSpec = FROTAK_AI_DOMAINS[name];
    const columns = Object.keys(spec.columns).join(", ");
    const owner = spec.financial ? " [somente owner]" : "";
    const date = spec.dateColumn ? ` Data: ${spec.dateColumn}.` : "";
    return `${name}${owner}: ${spec.description}. Campos: ${columns}.${date}`;
  }).join(" | ");
}
