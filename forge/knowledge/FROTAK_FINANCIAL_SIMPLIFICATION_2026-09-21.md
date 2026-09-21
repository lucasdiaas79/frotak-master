# Frotak Financeiro — simplificação de navegação e custos

Data: 2026-09-21
Branch: `forge/lab-finance-simplification`

## 1. Mapa AS-IS

O menu financeiro atual expõe diretamente 12 destinos:

1. Visão Geral
2. Fluxo de Caixa
3. DRE Gerencial
4. Rentabilidade
5. A Receber
6. A Pagar
7. Bancos e Caixas
8. Salários
9. Recorrências
10. Plano de Contas
11. Centros de Custo
12. Configurações — embora a rota atual abra a tela de Integrações Financeiras.

A estrutura por baixo é mais rica do que a navegação sugere:
- salários possuem folha própria, proventos, descontos, adiantamentos, aprovação e postagem;
- recorrências aceitam salário simples, despesa recorrente e custo fixo;
- plano de contas e centros de custo alimentam classificação, DRE e alocação;
- integrações cuidam da passagem de fatos operacionais para lançamentos financeiros.

Conclusão: não apagar essas estruturas. O problema principal desta etapa é de experiência e hierarquia de informação.

## 2. TO-BE do fluxo de custos

Princípio: **complexidade no motor; simplicidade na tela**.

O usuário operacional deve pensar em "custo", não em qual subsistema contábil precisa alimentar.

Fluxo alvo completo:

```
Novo custo
  -> descrição
  -> valor
  -> favorecido
  -> vencimento
  -> categoria
  -> centro/veículo quando aplicável
  -> único ou recorrente
       -> único: título a pagar
       -> recorrente: regra recorrente que gera títulos
       -> folha: estrutura especializada preservada por trás
  -> DRE / fluxo / rentabilidade continuam consumindo os lançamentos canônicos
```

Nesta etapa (1+2+3), a tela Custos passa a ser o ponto de entrada e visão consolidada, mas **não troca ainda os contratos de backend**. Os fluxos especializados permanecem acessíveis por atalhos para evitar mudança de comportamento financeiro sem testes de integração.

A etapa seguinte deve unificar o formulário e encaminhar internamente para título, recorrência ou folha sem duplicar lançamentos.

## 3. Navegação proposta

Menu principal:
- Visão Geral
- Fluxo de Caixa
- DRE Gerencial
- Rentabilidade
- A Receber
- A Pagar
- Custos
- Bancos e Caixas
- Configurações

Sai do menu principal, mas continua existente:
- Salários
- Recorrências
- Plano de Contas
- Centros de Custo
- Integrações Financeiras

Nova tela **Custos**:
- posição consolidada de custos;
- custos a pagar em aberto;
- recorrências ativas;
- folha da competência;
- atalhos para custo direto, recorrências e folha.

Nova tela **Configurações**:
- Plano de Contas;
- Centros de Custo;
- Integrações e prazos;
- descrições orientadas ao frotista, preservando as rotas técnicas existentes.

## Não escopo desta etapa

- nenhuma migration;
- nenhuma mudança no Supabase de produção;
- nenhuma alteração no cálculo de DRE;
- nenhuma fusão de tabelas;
- nenhuma remoção de folha/recorrências;
- nenhum deploy de produção.

## Critério de aceite

1. O menu financeiro fica mais curto e coerente.
2. "Configurações" deixa de abrir diretamente "Integrações".
3. Existe uma tela "Custos" como ponto central para despesas.
4. As rotas antigas continuam acessíveis para preservar funcionalidade.
5. Build do Central passa antes de qualquer preview/deploy.
