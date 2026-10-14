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
