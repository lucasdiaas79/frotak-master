export const FROTAK_AI_TOOL_NAMES = [
  "consultar_tenant",
  "buscar_veiculo",
  "buscar_implemento",
  "consultar_posicao",
  "listar_fretes_ativos",
  "consultar_frete",
  "consultar_motorista",
  "buscar_parceiro",
  "buscar_produto",
  "consultar_abastecimentos",
  "consultar_financeiro",
  "consultar_dre",
  "consultar_rentabilidade",
  "consultar_suporte",
  "consultar",
  "resumir",
  "buscar",
  "alertas",
  "lancar_despesa_frete",
  "atualizar_situacao_veiculo",
  "registrar_ocorrencia",
  "pesquisar_web",
] as const;

export type FrotakAiToolName = (typeof FROTAK_AI_TOOL_NAMES)[number];

export const FROTAK_AI_FINANCIAL_TOOL_NAMES = [
  "consultar_financeiro",
  "consultar_dre",
  "consultar_rentabilidade",
] as const satisfies readonly FrotakAiToolName[];

export function isKnownFrotakAiToolName(name: string): name is FrotakAiToolName {
  return (FROTAK_AI_TOOL_NAMES as readonly string[]).includes(name);
}

// Respostas de negocio: a consulta funcionou e a IA deve falar o resultado ("nao encontrado",
// "sem permissao"). Nao sao falhas tecnicas e nao devem calar a resposta por voz.
export const FROTAK_AI_BUSINESS_ERROR_CODES = [
  "OWNER_REQUIRED",
  "INVALID_PERIOD",
  "VEHICLE_NOT_FOUND",
  "INVALID_DOMAIN",
  "INVALID_FILTER",
  "INVALID_ACTION",
  "NO_ACTIVE_FREIGHT",
  "ACTIVE_FREIGHT",
] as const;

const BUSINESS_ERROR_CODES = new Set<string>(FROTAK_AI_BUSINESS_ERROR_CODES);

// Falha tecnica = a ferramenta nao conseguiu consultar (erro de banco, sessao, timeout).
// Olha so o envelope do resultado, nunca os dados de dentro.
export function isFrotakAiTechnicalFailure(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return true;
  const record = output as Record<string, unknown>;
  if (record.ok === true) return false;
  if (record.ok === false) {
    return !(typeof record.code === "string" && BUSINESS_ERROR_CODES.has(record.code));
  }
  return typeof record.error === "string";
}

// Texto enviado pela tela uma vez por dia, ao abrir a voz, para a IA abrir com o briefing.
export const FROTAK_AI_BRIEFING_TRIGGER = "BRIEFING_DO_DIA";

export type FrotakAiPendingAction = { token: string; resumo: string };

// O token de confirmacao vai so para a tela; a IA recebe apenas o resumo.
export function extractFrotakAiPendingAction(result: unknown): FrotakAiPendingAction | null {
  const data = (result as { data?: { confirmacao?: unknown } } | null)?.data;
  const confirmation = data?.confirmacao as Partial<FrotakAiPendingAction> | undefined;
  return confirmation &&
    typeof confirmation.token === "string" &&
    typeof confirmation.resumo === "string"
    ? { token: confirmation.token, resumo: confirmation.resumo }
    : null;
}

export function stripFrotakAiActionToken(result: unknown) {
  if (!extractFrotakAiPendingAction(result)) return result;
  const record = result as { data: Record<string, unknown> };
  const { confirmacao: _confirmacao, ...data } = record.data;
  return { ...record, data };
}
