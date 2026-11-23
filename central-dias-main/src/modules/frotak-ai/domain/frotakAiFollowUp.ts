// Pergunta de continuacao do chat da Frotak IA: toda resposta por texto termina com uma pergunta
// curta que oferece o proximo passo ligado ao assunto (ex.: depois do financeiro, "Quer saber
// quanto a empresa faturou ontem?"). O prompt pede isso; aqui fica a garantia, porque o modelo nem
// sempre obedece e as respostas prontas do servidor nao passam pelo modelo.

export type FrotakAiTopic =
  | "financeiro"
  | "abastecimento"
  | "veiculos_parados"
  | "frota"
  | "fretes"
  | "motoristas"
  | "manutencao"
  | "alertas"
  | "geral";

const FOLLOW_UPS: Record<FrotakAiTopic, string> = {
  financeiro: "Quer saber quanto a empresa faturou ontem?",
  abastecimento: "Quer comparar o diesel desta semana com o da semana passada?",
  veiculos_parados: "Quer ver o rendimento da frota nesta semana?",
  frota: "Quer ver quais veículos estão parados agora?",
  fretes: "Quer ver os fretes em andamento agora?",
  motoristas: "Quer ver quais motoristas estão em viagem agora?",
  manutencao: "Quer ver as manutenções previstas para esta semana?",
  alertas: "Quer que eu detalhe algum desses pontos?",
  geral: "Quer que eu veja mais alguma coisa para você?",
};

const TOOL_TOPICS: Array<[RegExp, FrotakAiTopic]> = [
  [/^(consultar_financeiro|consultar_dre|consultar_rentabilidade)$/, "financeiro"],
  [/^consultar_abastecimentos$/, "abastecimento"],
  [/^(veiculos_parados|registrar_motivo_parado)$/, "veiculos_parados"],
  [
    /^(rendimento_frota|buscar_veiculo|consultar_posicao|atualizar_situacao_veiculo|buscar_implemento)$/,
    "frota",
  ],
  [/^(listar_fretes_ativos|consultar_frete|lancar_despesa_frete)$/, "fretes"],
  [/^consultar_motorista$/, "motoristas"],
  [/^alertas$/, "alertas"],
];

const WORD_TOPICS: Array<[RegExp, FrotakAiTopic]> = [
  [
    /financ|fatur|receita|despesa|lucro|caixa|a pagar|a receber|dre|boleto|parcela|rentab|margem/,
    "financeiro",
  ],
  [/diesel|abastec|combust|arla|litro|posto/, "abastecimento"],
  [/parad|ocios|sem viagem/, "veiculos_parados"],
  [/manuten|oficina|pneu|revis|preventiva/, "manutencao"],
  [/frete|carga|entrega|coleta|embarque/, "fretes"],
  [/motorist|jornada|diaria|condutor/, "motoristas"],
  [/veicul|caminh|frota|placa|carreta|cavalo|rota|posicao|rastre/, "frota"],
];

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Assunto da conversa: primeiro pelas ferramentas usadas, depois pelas palavras da pergunta. */
export function detectFrotakAiTopic(message: string, tools: readonly string[] = []): FrotakAiTopic {
  for (const tool of tools) {
    const match = TOOL_TOPICS.find(([pattern]) => pattern.test(tool));
    if (match) return match[1];
  }
  const text = normalize(message);
  const match = WORD_TOPICS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : "geral";
}

export function followUpQuestionFor(topic: FrotakAiTopic) {
  return FOLLOW_UPS[topic];
}

/** A resposta ja termina em pergunta? Ignora espacos, aspas, parenteses e emojis no fim. */
export function endsWithQuestion(text: string) {
  const trimmed = text.replace(/[\s"'”’)\]\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u, "");
  return trimmed.endsWith("?");
}

/** Garante a pergunta de continuacao no fim da resposta do chat. */
export function withFollowUpQuestion(
  text: string,
  input: { message: string; tools?: readonly string[] },
) {
  const answer = text.trim();
  if (!answer || endsWithQuestion(answer)) return answer;
  const question = followUpQuestionFor(detectFrotakAiTopic(input.message, input.tools));
  const separator = answer.includes("\n") ? "\n\n" : " ";
  return `${answer}${separator}${question}`;
}
