import {
  FROTAK_AI_EXPENSE_CATEGORIES,
  FROTAK_AI_VEHICLE_SITUATIONS,
} from "@/modules/frotak-ai/domain/frotakAiActionCatalog";
import {
  FROTAK_AI_DOMAIN_NAMES,
  frotakAiDomainCatalogText,
} from "@/modules/frotak-ai/domain/frotakAiDomainCatalog";
import {
  isKnownFrotakAiToolName,
  type FrotakAiToolName,
} from "@/modules/frotak-ai/domain/frotakAiToolCatalog";

// Ferramentas que a IA pode chamar, em formato neutro. O adaptador de cada provedor de modelo
// converte estas declaracoes para o formato dele.

export type FrotakAiSchemaType = "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN" | "ARRAY" | "OBJECT";

export interface FrotakAiToolSchema {
  type: FrotakAiSchemaType;
  description?: string;
  enum?: readonly string[];
  items?: FrotakAiToolSchema;
  properties?: Readonly<Record<string, FrotakAiToolSchema>>;
  required?: readonly string[];
}

export interface FrotakAiToolDeclaration {
  name: string;
  description: string;
  parameters: FrotakAiToolSchema;
}

export type FrotakAiToolCall = {
  id?: string;
  name: FrotakAiToolName;
  args?: Record<string, unknown>;
};

const Type = {
  STRING: "STRING",
  INTEGER: "INTEGER",
  NUMBER: "NUMBER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY",
  OBJECT: "OBJECT",
} as const;

const queryProperty = {
  type: Type.STRING,
  description: "Placa, nome, telefone, documento, codigo ou trecho a pesquisar.",
};

const limitProperty = {
  type: Type.INTEGER,
  description: "Quantidade maxima de registros, entre 1 e 80.",
};

const periodProperties = {
  start_date: { type: Type.STRING, description: "Data inicial no formato YYYY-MM-DD." },
  end_date: { type: Type.STRING, description: "Data final no formato YYYY-MM-DD." },
  days: {
    type: Type.INTEGER,
    description: "Janela em dias quando o usuario nao informar datas exatas.",
  },
};

export const FROTAK_AI_TOOL_DECLARATIONS = [
  {
    name: "consultar_tenant",
    description:
      "Retorna identidade e totais operacionais do tenant/workspace autenticado. Use para saber qual empresa esta logada ou obter uma visao geral.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "buscar_veiculo",
    description:
      "Busca caminhoes e veiculos do tenant por placa, tipo, cidade ou status. Retorna cadastro e operacao atual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: queryProperty,
        status: { type: Type.STRING, description: "Status exato do veiculo, se informado." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "buscar_implemento",
    description:
      "Busca cacambas, carretas e implementos do tenant por identificador, tipo, marca ou modelo.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: queryProperty, limit: limitProperty },
    },
  },
  {
    name: "consultar_posicao",
    description:
      "Consulta a ultima posicao conhecida de um veiculo ou da frota. O servidor relaciona a posicao com a placa e informa a data da leitura.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Placa do veiculo. Omita para a frota." },
        source: { type: Type.STRING, description: "Fonte da posicao, como sascar, se pedida." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "listar_fretes_ativos",
    description:
      "Lista fretes em andamento no tenant, com placa, motorista, etapa, status, local e valor registrado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Placa, cidade ou codigo do frete." },
        status: { type: Type.STRING, description: "Status operacional exato, se informado." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_frete",
    description:
      "Consulta detalhes de fretes ativos e/ou encerrados por codigo, placa, motorista, cliente ou produto. Use para historico, ultimo frete, rota, partes e documentos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: queryProperty,
        source: {
          type: Type.STRING,
          enum: ["active", "history", "all"],
          description: "active, history ou all.",
        },
        status: { type: Type.STRING, description: "Status do frete, se informado." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_motorista",
    description:
      "Busca motoristas do tenant por nome, telefone ou CNH e informa atividade e veiculo vinculado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: queryProperty,
        status: {
          type: Type.STRING,
          enum: ["active", "inactive", "all"],
          description: "active, inactive ou all.",
        },
        limit: limitProperty,
      },
    },
  },
  {
    name: "buscar_parceiro",
    description:
      "Busca clientes, fornecedores e parceiros do tenant por nome ou documento, sem valores financeiros.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: queryProperty, limit: limitProperty },
    },
  },
  {
    name: "buscar_produto",
    description: "Busca produtos cadastrados no tenant por nome.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: queryProperty, limit: limitProperty },
    },
  },
  {
    name: "consultar_abastecimentos",
    description:
      "Consulta abastecimentos do tenant e calcula no servidor quantidade, litros, valor total e preco medio por litro. Filtra por placa, motorista, posto, combustivel e periodo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Placa, motorista ou posto." },
        fuel_type: {
          type: Type.STRING,
          enum: ["diesel_s10", "arla", "all"],
          description: "diesel_s10, arla ou all.",
        },
        ...periodProperties,
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_financeiro",
    description:
      "Somente owner. Consulta titulos a pagar ou receber e saldos em aberto calculados pelo backend.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        direction: {
          type: Type.STRING,
          enum: ["receivable", "payable", "all"],
          description: "receivable, payable ou all.",
        },
        status: { type: Type.STRING, description: "Status financeiro, como overdue ou all." },
        query: queryProperty,
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_dre",
    description:
      "Somente owner. Consulta a DRE gerencial. Receita, custos, despesas, resultado, margem e reconciliacao ja vem calculados pelo backend. Use detalhar=true para abrir cada custo, despesa ou receita por conta gerencial e os maiores lancamentos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ...periodProperties,
        detalhar: {
          type: Type.BOOLEAN,
          description: "true para listar contas gerenciais e lancamentos que compoem a DRE.",
        },
        grupo: {
          type: Type.STRING,
          enum: [
            "gross_revenue",
            "discounts_obtained",
            "revenue_deduction",
            "variable_cost",
            "operating_expense",
            "depreciation_amortization",
            "financial_result",
            "income_tax",
            "other_result",
          ],
          description:
            "Grupo da DRE a detalhar: variable_cost (custos operacionais), operating_expense (despesas), gross_revenue (receita) etc. Omita para todos.",
        },
      },
    },
  },
  {
    name: "consultar_rentabilidade",
    description:
      "Somente owner. Consulta rentabilidade da frota, por veiculo, frete ou cliente. Todos os numeros sao calculados pelo backend.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dimension: {
          type: Type.STRING,
          enum: ["summary", "vehicle", "freight", "partner"],
          description: "summary, vehicle, freight ou partner.",
        },
        query: { type: Type.STRING, description: "Placa ou nome para filtrar o resultado." },
        ...periodProperties,
        limit: limitProperty,
      },
    },
  },
  {
    name: "consultar_suporte",
    description:
      "Pesquisa o manual oficial da Frotak para explicar telas, procedimentos, app motorista, CTe, cadastros e dificuldades.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Pergunta ou termos a localizar no manual." },
        limit: { type: Type.INTEGER, description: "Quantidade de orientacoes, entre 3 e 8." },
      },
      required: ["query"],
    },
  },
  {
    name: "consultar",
    description:
      "Consulta generica de qualquer area do tenant. Use quando nenhuma ferramenta especifica cobre a pergunta, ou para totais, somas e agrupamentos (por mes, placa, motorista, categoria, status). Somas e contagens sao calculadas pelo servidor. Dominios: " +
      frotakAiDomainCatalogText(),
    parameters: {
      type: Type.OBJECT,
      properties: {
        dominio: {
          type: Type.STRING,
          enum: [...FROTAK_AI_DOMAIN_NAMES],
          description: "Area a consultar.",
        },
        filtros: {
          type: Type.ARRAY,
          description:
            "Filtros por campo do dominio. Tambem aceita os campos placa, motorista e parceiro em dominios ligados a veiculo, motorista ou parceiro.",
          items: {
            type: Type.OBJECT,
            properties: {
              campo: { type: Type.STRING },
              operador: {
                type: Type.STRING,
                enum: [
                  "igual",
                  "diferente",
                  "contem",
                  "maior",
                  "maior_igual",
                  "menor",
                  "menor_igual",
                  "vazio",
                  "preenchido",
                ],
              },
              valor: { type: Type.STRING },
            },
            required: ["campo"],
          },
        },
        busca: {
          type: Type.STRING,
          description: "Texto livre procurado nos campos de texto do dominio.",
        },
        agrupar_por: {
          type: Type.STRING,
          description:
            "Campo para agrupar com totais: mes, dia, placa, motorista, parceiro ou um campo do dominio.",
        },
        totais: { type: Type.BOOLEAN, description: "true para receber so a contagem e as somas." },
        ordenar: { type: Type.STRING, description: "Campo para ordenar a lista." },
        ordem: { type: Type.STRING, enum: ["asc", "desc"] },
        ...periodProperties,
        limite: limitProperty,
      },
      required: ["dominio"],
    },
  },
  {
    name: "resumir",
    description:
      "Resumo pronto de um dominio no periodo (padrao 30 dias): contagem, somas e os principais grupos. Use para perguntas abertas como 'como estao as despesas' ou 'resumo das viagens'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dominio: { type: Type.STRING, enum: [...FROTAK_AI_DOMAIN_NAMES] },
        ...periodProperties,
      },
      required: ["dominio"],
    },
  },
  {
    name: "buscar",
    description:
      "Procura um nome, placa, documento ou telefone em todo o tenant (veiculos, motoristas, implementos, parceiros e produtos). Use quando nao souber a que se refere um termo.",
    parameters: {
      type: Type.OBJECT,
      properties: { texto: { type: Type.STRING, description: "Termo a procurar." } },
      required: ["texto"],
    },
  },
  {
    name: "alertas",
    description:
      "Lista o que precisa de atencao agora: veiculos sem viagem ha mais de 24h (com o motivo), veiculos parados ou quebrados, rastreados sem sinal, fretes longos, diarias pendentes, abastecimentos fora do padrao e, para o owner, contas vencidas ou vencendo. Use para 'como esta a operacao', 'o que precisa da minha atencao' e para o briefing do dia.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "veiculos_parados",
    description:
      "Lista os veiculos sem viagem ha mais de X horas (padrao 24): placa, motorista, ha quantos dias, data da ultima viagem e o motivo (manutencao, sem motorista, motorista de folga, frete planejado, aguardando carga ou o motivo informado pelo gestor). Use para 'quais carros estao parados', 'quem nao esta rodando e por que'. Quando vier precisa_motivo, pergunte o motivo ao gestor.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        horas: {
          type: Type.INTEGER,
          description: "Minimo de horas sem viagem. Padrao 24; '2 dias' = 48.",
        },
        limit: limitProperty,
      },
    },
  },
  {
    name: "rendimento_frota",
    description:
      "Rendimento da frota no periodo (padrao 30 dias): dias em viagem, dias parados e percentual parado por veiculo ou por motorista, e para o owner o frete estimado que deixou de ser feito. Use para 'qual caminhao mais fica parado', 'rendimento dos motoristas', 'quanto a frota ficou parada'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        agrupar: { type: Type.STRING, enum: ["veiculo", "motorista"] },
        days: { type: Type.INTEGER, description: "Janela em dias, entre 7 e 180." },
        limit: limitProperty,
      },
    },
  },
  {
    name: "lancar_despesa_frete",
    description:
      "Prepara o lancamento de uma despesa no frete ativo de um veiculo. Nao grava: devolve um resumo que o usuario confirma no botao da tela.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING },
        categoria: { type: Type.STRING, enum: [...FROTAK_AI_EXPENSE_CATEGORIES] },
        valor: { type: Type.NUMBER, description: "Valor em reais dito pelo usuario." },
        descricao: { type: Type.STRING },
      },
      required: ["placa", "categoria", "valor"],
    },
  },
  {
    name: "atualizar_situacao_veiculo",
    description:
      "Prepara a mudanca de situacao de um veiculo sem frete ativo. Nao grava: o usuario confirma no botao da tela.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING },
        situacao: { type: Type.STRING, enum: Object.keys(FROTAK_AI_VEHICLE_SITUATIONS) },
        observacao: { type: Type.STRING },
      },
      required: ["placa", "situacao"],
    },
  },
  {
    name: "registrar_ocorrencia",
    description:
      "Prepara o registro de uma ocorrencia na linha do tempo de um veiculo. Nao grava: o usuario confirma no botao da tela.",
    parameters: {
      type: Type.OBJECT,
      properties: { placa: { type: Type.STRING }, descricao: { type: Type.STRING } },
      required: ["placa", "descricao"],
    },
  },
  {
    name: "registrar_motivo_parado",
    description:
      "Prepara o registro do motivo de um veiculo estar parado, dito pelo gestor (ex.: 'aguardando pneu'). Nao grava: o usuario confirma no botao da tela. Depois disso veiculos_parados mostra esse motivo.",
    parameters: {
      type: Type.OBJECT,
      properties: { placa: { type: Type.STRING }, motivo: { type: Type.STRING } },
      required: ["placa", "motivo"],
    },
  },
  {
    name: "pesquisar_web",
    description:
      "Pesquisa na internet pela busca do Google. Use para assuntos fora do tenant que pedem informacao atual: precos de caminhoes, pneus e diesel, tabela de frete ANTT, noticias do setor, legislacao, mercado de trabalho, clima e estradas. Nunca use para dados da empresa do usuario.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pergunta: { type: Type.STRING, description: "O que pesquisar, em portugues." },
      },
      required: ["pergunta"],
    },
  },
] as const satisfies readonly FrotakAiToolDeclaration[];

export function isFrotakAiToolName(name: string): name is FrotakAiToolName {
  return (
    isKnownFrotakAiToolName(name) &&
    FROTAK_AI_TOOL_DECLARATIONS.some((declaration) => declaration.name === name)
  );
}

/** Chamada de ferramenta vinda do modelo; descarta o que nao for ferramenta conhecida. */
export function normalizeFrotakAiToolCall(call: {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}): FrotakAiToolCall | null {
  if (!call.name || !isFrotakAiToolName(call.name)) return null;
  return { id: call.id, name: call.name, args: call.args ?? {} };
}
