// Acoes que a Frotak IA pode preparar (a gravacao so acontece quando o usuario confirma).

export const FROTAK_AI_ACTION_TOOL_NAMES = [
  "lancar_despesa_frete",
  "atualizar_situacao_veiculo",
  "registrar_ocorrencia",
  "registrar_motivo_parado",
] as const;

export type FrotakAiActionName = (typeof FROTAK_AI_ACTION_TOOL_NAMES)[number];

export function isFrotakAiActionName(name: string): name is FrotakAiActionName {
  return (FROTAK_AI_ACTION_TOOL_NAMES as readonly string[]).includes(name);
}

export const FROTAK_AI_EXPENSE_CATEGORIES = [
  "pedagio",
  "alimentacao",
  "estacionamento",
  "manutencao",
  "outros",
] as const;

// Situacoes que a IA pode aplicar. Mudancas de etapa de frete continuam so pela Gestao da Frota.
export const FROTAK_AI_VEHICLE_SITUATIONS = {
  disponivel_patio: "disponivel-patio",
  disponivel_oficina: "disponivel-oficina",
  manutencao: "manutencao",
  quebrado: "parado-quebrado",
  parado: "parado-aguardando-comando",
} as const;
