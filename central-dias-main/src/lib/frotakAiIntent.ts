export function normalizeFrotakIntentText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isFrotakSupportQuestion(text: string) {
  const normalized = normalizeFrotakIntentText(text);
  return /\b(como (faco|fazer|criar|cadastrar|enviar|anexar|usar|acessar|entrar|registrar|pagar|receber|baixar|visualizar|emitir|alterar|editar|cancelar|estornar|consultar|puxar)|onde (fica|encontro)|passo a passo|manual|suporte|ajuda|o que fazer quando|o que significa|qual a diferenca|qual o procedimento|me ensine|me explique|instrucoes|por que|porque|entendendo|nao consigo|nao aparece|nao esta funcionando|nao funciona|erro|falha|bloquead[oa]s?)\b/.test(
    normalized,
  );
}

export function requiresFrotakTool(text: string) {
  const normalized = normalizeFrotakIntentText(text);
  const domain =
    /\b(frotak|empresa|companhia|tenant|workspace|cliente|frota|caminhao|caminhoes|veiculo|veiculos|placa|placas|motorista|motoristas|frete|fretes|viagem|viagens|rota|rotas|financeiro|receber|pagar|dre|caixa|titulo|titulos|receita|despesa|saldo|abastecimento|abastecimentos|diesel|arla|posto|combustivel|posicao|posicoes|localizacao|sascar|telemetria|mapa|status|valor|valores|quantidade|quantos|quantas|total|cte|ct e|mdfe|mdf e|documento|comprovante|nota|login|senha|app|tela|menu|cadastro|usuario|suporte)\b/.test(
      normalized,
    );
  const factual =
    /\b(qual|quais|quanto|quantos|quantas|cite|listar|liste|mostre|status|valor|valores|total|numero|nome|nomes|placa|placas|onde)\b/.test(
      normalized,
    );

  return domain && (factual || isFrotakSupportQuestion(normalized));
}
