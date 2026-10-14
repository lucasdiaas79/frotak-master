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
  const mentionsPlate = /\b[a-z]{3}[0-9][a-z0-9][0-9]{2}\b/.test(normalized);
  const domain =
    /\b(frotak|empresa|companhia|tenant|workspace|cliente|clientes|parceiro|parceiros|produto|produtos|frota|caminhao|caminhoes|veiculo|veiculos|placa|placas|cacamba|cacambas|carreta|carretas|implemento|implementos|motorista|motoristas|condutor|condutores|cnh|frete|fretes|viagem|viagens|rota|rotas|financeiro|receber|pagar|dre|caixa|conta|contas|titulo|titulos|receita|receitas|despesa|despesas|custo|custos|saldo|rentabilidade|lucro|margem|resultado|abastecimento|abastecimentos|diesel|arla|posto|combustivel|litro|litros|preco|posicao|posicoes|localizacao|localize|localizar|sascar|telemetria|mapa|status|vencido|vencidos|vencida|vencidas|valor|valores|quantidade|quantos|quantas|total|cte|ct e|mdfe|mdf e|documento|comprovante|nota|login|senha|app|tela|menu|cadastro|usuario|suporte)\b/.test(
      normalized,
    ) || mentionsPlate;
  const factual =
    /\b(qual|quais|quem|quando|quanto|quantos|quantas|cite|buscar|busque|consultar|consulte|listar|liste|mostre|localize|puxe|compare|comparar|ultimo|ultima|ultimos|ultimas|status|valor|valores|total|numero|nome|nomes|placa|placas|onde|tem|esta|estao|foi|foram)\b/.test(
      normalized,
    );

  return domain && (factual || isFrotakSupportQuestion(normalized));
}
