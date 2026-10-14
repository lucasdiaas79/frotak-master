import type { FrotakAiToolName } from "../src/lib/frotakAiToolCatalog.ts";

export type FrotakAiEvaluationCase = {
  category:
    | "frota"
    | "motoristas"
    | "fretes"
    | "posicao"
    | "abastecimento"
    | "financeiro"
    | "dre"
    | "rentabilidade";
  question: string;
  expectedTool: FrotakAiToolName;
  ownerOnly?: boolean;
};

export const FROTAK_AI_V2_EVALUATION_CASES: FrotakAiEvaluationCase[] = [
  {
    category: "frota",
    question: "Quantos caminhoes temos cadastrados?",
    expectedTool: "buscar_veiculo",
  },
  { category: "frota", question: "Liste as placas da frota", expectedTool: "buscar_veiculo" },
  { category: "frota", question: "Busque o veiculo TNX6J30", expectedTool: "buscar_veiculo" },
  {
    category: "frota",
    question: "Qual o status do caminhao QMF0384?",
    expectedTool: "buscar_veiculo",
  },
  {
    category: "frota",
    question: "Mostre os veiculos que estao em Sergipe",
    expectedTool: "buscar_veiculo",
  },
  {
    category: "frota",
    question: "Tem algum veiculo aguardando comando?",
    expectedTool: "buscar_veiculo",
  },
  {
    category: "frota",
    question: "Quais caminhoes estao vinculados a um frete?",
    expectedTool: "buscar_veiculo",
  },
  {
    category: "frota",
    question: "Procure a placa NVK0518 na frota",
    expectedTool: "buscar_veiculo",
  },

  {
    category: "motoristas",
    question: "Quantos motoristas ativos existem?",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Liste os motoristas ativos",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Consulte o motorista Ademilson",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Qual telefone do motorista Adelvan?",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Esse motorista esta ativo no sistema?",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Quem esta dirigindo a placa TNX6J30?",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Busque o condutor pela CNH",
    expectedTool: "consultar_motorista",
  },
  {
    category: "motoristas",
    question: "Mostre tambem os motoristas inativos",
    expectedTool: "consultar_motorista",
  },

  {
    category: "fretes",
    question: "Quais fretes estao ativos agora?",
    expectedTool: "listar_fretes_ativos",
  },
  {
    category: "fretes",
    question: "Liste os caminhoes em rota",
    expectedTool: "listar_fretes_ativos",
  },
  {
    category: "fretes",
    question: "Tem frete na etapa de carregamento?",
    expectedTool: "listar_fretes_ativos",
  },
  {
    category: "fretes",
    question: "Qual a etapa atual do frete da TNX6J30?",
    expectedTool: "listar_fretes_ativos",
  },
  {
    category: "fretes",
    question: "Mostre os fretes aguardando CTe",
    expectedTool: "listar_fretes_ativos",
  },
  {
    category: "fretes",
    question: "Qual foi o ultimo frete finalizado?",
    expectedTool: "consultar_frete",
  },
  {
    category: "fretes",
    question: "Consulte o historico de fretes da QMF0384",
    expectedTool: "consultar_frete",
  },
  {
    category: "fretes",
    question: "Quem foi o remetente do frete mais recente?",
    expectedTool: "consultar_frete",
  },
  {
    category: "fretes",
    question: "Qual era o destino da ultima viagem?",
    expectedTool: "consultar_frete",
  },
  {
    category: "fretes",
    question: "Que produto foi levado no frete 123?",
    expectedTool: "consultar_frete",
  },

  {
    category: "posicao",
    question: "Onde esta o caminhao TNX6J30?",
    expectedTool: "consultar_posicao",
  },
  {
    category: "posicao",
    question: "Qual a ultima posicao da QMF0384?",
    expectedTool: "consultar_posicao",
  },
  { category: "posicao", question: "Localize a placa NVK0518", expectedTool: "consultar_posicao" },
  {
    category: "posicao",
    question: "Mostre a localizacao atual da frota",
    expectedTool: "consultar_posicao",
  },
  {
    category: "posicao",
    question: "Em qual cidade esta o veiculo OEP2A18?",
    expectedTool: "consultar_posicao",
  },
  {
    category: "posicao",
    question: "Quando recebemos a ultima telemetria?",
    expectedTool: "consultar_posicao",
  },
  {
    category: "posicao",
    question: "A posicao da Sascar esta atualizada?",
    expectedTool: "consultar_posicao",
  },
  {
    category: "posicao",
    question: "Qual a velocidade informada para a placa QKP7F70?",
    expectedTool: "consultar_posicao",
  },

  {
    category: "abastecimento",
    question: "Liste os ultimos abastecimentos",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Quanto foi abastecido de diesel este mes?",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Quantos litros a TNX6J30 abasteceu?",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Qual o valor total gasto no posto Taicoca?",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Mostre somente os abastecimentos de ARLA",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Qual foi o preco medio por litro nos ultimos 30 dias?",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Consulte os abastecimentos do motorista Ademilson",
    expectedTool: "consultar_abastecimentos",
  },
  {
    category: "abastecimento",
    question: "Qual odometro foi informado no ultimo abastecimento?",
    expectedTool: "consultar_abastecimentos",
  },

  {
    category: "financeiro",
    question: "Quanto temos em contas a receber?",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Qual o total em titulos a pagar?",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Liste as contas vencidas",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Mostre os titulos em aberto do Posto Taicoca",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Qual e o saldo a receber em aberto?",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Tem alguma despesa atrasada?",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Quais receitas ainda nao foram recebidas?",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },
  {
    category: "financeiro",
    question: "Consulte os valores pendentes do financeiro",
    expectedTool: "consultar_financeiro",
    ownerOnly: true,
  },

  {
    category: "dre",
    question: "Qual o resultado da DRE deste mes?",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "Puxe a DRE de setembro",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "Quanto tivemos de receita bruta na DRE?",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "Qual foi o custo variavel do periodo?",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "Mostre as despesas operacionais da DRE",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "Qual a margem gerencial da empresa?",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "A reconciliacao da DRE esta correta?",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },
  {
    category: "dre",
    question: "Compare o resultado gerencial com o periodo anterior",
    expectedTool: "consultar_dre",
    ownerOnly: true,
  },

  {
    category: "rentabilidade",
    question: "Qual foi a rentabilidade da frota no ano?",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Qual caminhao deu mais lucro?",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Mostre a margem por veiculo",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Qual foi o frete mais rentavel?",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Liste os fretes que deram prejuizo",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Quem e o cliente com maior resultado?",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Quanto a TNX6J30 gerou de receita e custo?",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
  {
    category: "rentabilidade",
    question: "Qual a margem do cliente Pedra Branca?",
    expectedTool: "consultar_rentabilidade",
    ownerOnly: true,
  },
];
