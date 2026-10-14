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
