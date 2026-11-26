// O que uma regra de notificacao pode observar. Contrato com o banco: as fontes, os nomes de campo e
// os rotulos sao os mesmos de private.notification_record em
// supabase/migrations/202611260001_notifications.sql. Mudou aqui, mude la (e vice-versa).

export type NotificationSource =
  "freights" | "vehicles" | "fleet_events" | "driver_compliance_documents";

export type TriggerKind = "insert" | "update" | "insert_or_update" | "schedule";

export type ConditionOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "contains"
  | "is_empty"
  | "not_empty"
  | "changed"
  | "changed_to"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "within_days"
  | "overdue";

export type FieldType = "enum" | "text" | "number" | "date" | "boolean";

export type FieldOption = { value: string; label: string };

export type CatalogField = {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
};

export type CatalogSource = {
  key: NotificationSource;
  label: string;
  description: string;
  triggers: TriggerKind[];
  defaultLink: string;
  fields: CatalogField[];
  /** Valores de exemplo para a previa do texto, ja no formato que o aviso mostra. */
  sample: Record<string, string>;
};

export const FREIGHT_STAGES: FieldOption[] = [
  { value: "DISPONIVEL", label: "Disponível" },
  { value: "EM_ROTA_CARREGAR", label: "Em rota indo carregar" },
  { value: "AGUARDANDO_NOTA", label: "Parado esperando carga" },
  { value: "NOTA_EM_CONFERENCIA", label: "Nota em conferência" },
  { value: "NOTA_APROVADA_AG_CTE", label: "Aguardando CT-e/MDF-e" },
  { value: "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA", label: "Aguardando confirmação do motorista" },
  { value: "EM_ROTA_ENTREGA", label: "Em rota indo descarregar" },
  { value: "ENTREGUE_AG_FINALIZACAO", label: "Parado esperando descarga" },
  { value: "ENTREGA_FINALIZADA", label: "Rota finalizada" },
];

export const VEHICLE_STATUSES: FieldOption[] = [
  { value: "disponivel-patio", label: "Disponível no pátio" },
  { value: "disponivel-oficina", label: "Disponível na oficina" },
  { value: "aguardando-motorista", label: "Aguardando motorista" },
  { value: "rota-carregar", label: "Em rota para carregar" },
  { value: "rota-descarregar", label: "Em rota para descarregar" },
  { value: "rota-retornando", label: "Retornando" },
  { value: "parado-aguardando-carga", label: "Parado aguardando carga" },
  { value: "aguardando-cte", label: "Aguardando CT-e" },
  { value: "aguardando-confirmacao", label: "Aguardando confirmação" },
  { value: "parado-aguardando-comando", label: "Parado aguardando comando" },
  { value: "parado-descarregando", label: "Descarregando" },
  { value: "parado-quebrado", label: "Parado quebrado" },
  { value: "manutencao", label: "Em manutenção" },
];

const FREIGHT_SITUATIONS: FieldOption[] = [
  { value: "planned", label: "Planejado" },
  { value: "active", label: "Em andamento" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const DOCUMENT_KINDS: FieldOption[] = [
  { value: "cnh", label: "CNH" },
  { value: "toxicologico", label: "Exame toxicológico" },
  { value: "aso", label: "ASO" },
  { value: "direcao_defensiva", label: "Direção defensiva" },
  { value: "nr11", label: "NR-11" },
  { value: "mopp", label: "MOPP" },
  { value: "integracao_cliente", label: "Integração do cliente" },
  { value: "outro", label: "Outro" },
];

const DOCUMENT_STATUSES: FieldOption[] = [
  { value: "valido", label: "Válido" },
  { value: "enviado", label: "Enviado" },
  { value: "recusado", label: "Recusado" },
];

const EVENT_ORIGINS: FieldOption[] = [
  { value: "Telemetria", label: "Telemetria" },
  { value: "Motorista", label: "Motorista" },
  { value: "Operador", label: "Operador" },
  { value: "Sistema", label: "Sistema" },
  { value: "Manutencao", label: "Manutenção" },
];

export const notificationSources: CatalogSource[] = [
  {
    key: "freights",
    label: "Fretes",
    description: "Frete criado ou alterado: etapa, situação, valor, entrega.",
    triggers: ["insert", "update", "insert_or_update", "schedule"],
    defaultLink: "/operacao",
    fields: [
      { key: "etapa", label: "Etapa", type: "enum", options: FREIGHT_STAGES },
      { key: "situacao", label: "Situação", type: "enum", options: FREIGHT_SITUATIONS },
      { key: "valor", label: "Valor do frete", type: "number" },
      { key: "placa", label: "Placa", type: "text" },
      { key: "motorista", label: "Motorista", type: "text" },
      { key: "remetente", label: "Remetente", type: "text" },
      { key: "destinatario", label: "Destinatário", type: "text" },
      { key: "origem_uf", label: "UF de origem", type: "text" },
      { key: "destino_uf", label: "UF de destino", type: "text" },
      { key: "iniciado_em", label: "Início", type: "date" },
      { key: "entregue_em", label: "Entrega", type: "date" },
    ],
    sample: {
      etapa: "Em rota indo descarregar",
      situacao: "Em andamento",
      valor: "R$ 8.450,00",
      placa: "ABC1D23",
      motorista: "João Silva",
      remetente: "Usina Norte",
      destinatario: "Porto Sul",
      origem_uf: "GO",
      destino_uf: "SP",
      iniciado_em: "24/11/2026 07:40",
      entregue_em: "",
    },
  },
  {
    key: "vehicles",
    label: "Veículos",
    description: "Situação e etapa de cada veículo da frota.",
    triggers: ["insert", "update", "insert_or_update", "schedule"],
    defaultLink: "/veiculos",
    fields: [
      { key: "placa", label: "Placa", type: "text" },
      { key: "modelo", label: "Modelo", type: "text" },
      { key: "etapa", label: "Etapa", type: "enum", options: FREIGHT_STAGES },
      { key: "status", label: "Situação do veículo", type: "enum", options: VEHICLE_STATUSES },
      { key: "motorista", label: "Motorista", type: "text" },
    ],
    sample: {
      placa: "ABC1D23",
      modelo: "FH 540",
      etapa: "Parado esperando carga",
      status: "Parado quebrado",
      motorista: "João Silva",
    },
  },
  {
    key: "fleet_events",
    label: "Eventos da operação",
    description: "Cada evento registrado pela operação, motorista ou telemetria.",
    triggers: ["insert"],
    defaultLink: "/operacao",
    fields: [
      { key: "placa", label: "Placa", type: "text" },
      { key: "etapa", label: "Etapa", type: "enum", options: FREIGHT_STAGES },
      { key: "status", label: "Situação do veículo", type: "enum", options: VEHICLE_STATUSES },
      { key: "origem", label: "Origem", type: "enum", options: EVENT_ORIGINS },
      { key: "descricao", label: "Descrição", type: "text" },
      { key: "cidade", label: "Cidade", type: "text" },
      { key: "uf", label: "UF", type: "text" },
    ],
    sample: {
      placa: "ABC1D23",
      etapa: "Em rota indo carregar",
      status: "Em rota para carregar",
      origem: "Motorista",
      descricao: "Saiu do pátio",
      cidade: "Rio Verde",
      uf: "GO",
    },
  },
  {
    key: "driver_compliance_documents",
    label: "Documentos do motorista",
    description: "CNH, toxicológico, ASO e outros documentos com vencimento.",
    triggers: ["insert", "update", "insert_or_update", "schedule"],
    defaultLink: "/motoristas",
    fields: [
      { key: "motorista", label: "Motorista", type: "text" },
      { key: "tipo", label: "Tipo", type: "enum", options: DOCUMENT_KINDS },
      { key: "documento", label: "Documento", type: "text" },
      { key: "numero", label: "Número", type: "text" },
      { key: "vencimento", label: "Vencimento", type: "date" },
      { key: "dias_para_vencer", label: "Dias para vencer", type: "number" },
      { key: "situacao", label: "Situação", type: "enum", options: DOCUMENT_STATUSES },
      { key: "bloqueante", label: "Bloqueia o motorista", type: "boolean" },
    ],
    sample: {
      motorista: "João Silva",
      tipo: "CNH",
      documento: "CNH",
      numero: "01234567890",
      vencimento: "15/12/2026",
      dias_para_vencer: "19",
      situacao: "Válido",
      bloqueante: "Sim",
    },
  },
];

export const triggerLabels: Record<TriggerKind, string> = {
  insert: "Quando um registro é criado",
  update: "Quando um registro é alterado",
  insert_or_update: "Quando é criado ou alterado",
  schedule: "Condição sobre o dado do banco (verifica a cada 15 min)",
};

export const opLabels: Record<ConditionOp, string> = {
  eq: "é igual a",
  neq: "é diferente de",
  in: "é um destes",
  not_in: "não é nenhum destes",
  contains: "contém",
  is_empty: "está vazio",
  not_empty: "está preenchido",
  changed: "mudou",
  changed_to: "mudou para",
  gt: "é maior que",
  gte: "é maior ou igual a",
  lt: "é menor que",
  lte: "é menor ou igual a",
  within_days: "vence nos próximos N dias",
  overdue: "já venceu",
};

/** Operadores sem valor a informar. */
export const valuelessOps: ConditionOp[] = ["is_empty", "not_empty", "changed", "overdue"];
/** Operadores que comparam com o valor anterior: so existem em alteracao. */
export const changeOps: ConditionOp[] = ["changed", "changed_to"];

const opsByType: Record<FieldType, ConditionOp[]> = {
  enum: ["eq", "neq", "in", "not_in", "changed", "changed_to"],
  text: ["eq", "neq", "contains", "is_empty", "not_empty", "changed", "changed_to"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "not_empty", "changed"],
  date: ["within_days", "overdue", "is_empty", "not_empty", "changed"],
  boolean: ["eq", "changed"],
};

export function triggerWatchesChanges(trigger: TriggerKind) {
  return trigger === "update" || trigger === "insert_or_update";
}

/** Operadores permitidos para um campo, conforme o tipo e o gatilho escolhido. */
export function opsFor(field: CatalogField, trigger: TriggerKind): ConditionOp[] {
  return opsByType[field.type].filter(
    (op) => !changeOps.includes(op) || triggerWatchesChanges(trigger),
  );
}

export function sourceOf(key: string): CatalogSource | undefined {
  return notificationSources.find((source) => source.key === key);
}

export function fieldOf(source: CatalogSource, key: string): CatalogField | undefined {
  return source.fields.find((field) => field.key === key);
}

/** Papeis do TMS que podem receber (vazio = todos os usuarios ativos da empresa). */
export const audienceRoles: FieldOption[] = [
  { value: "OWNER", label: "Dono" },
  { value: "ADMIN", label: "Administrador" },
  { value: "MANAGER", label: "Gestor" },
  { value: "DISPATCHER", label: "Operador" },
  { value: "FINANCIAL", label: "Financeiro" },
  { value: "VIEWER", label: "Visualizador" },
];

/** Caminhos do TMS para onde o aviso pode levar quem clica nele. */
export const linkTargets: FieldOption[] = [
  { value: "/operacao", label: "Operação do dia" },
  { value: "/gestao-frota", label: "Gestão de frota" },
  { value: "/veiculos", label: "Veículos" },
  { value: "/motoristas", label: "Motoristas" },
  { value: "/mapa", label: "Mapa" },
  { value: "/financeiro", label: "Financeiro" },
  { value: "/notificacoes", label: "Histórico de notificações" },
];
