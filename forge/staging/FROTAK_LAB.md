# FROTAK LAB — ambiente de validação do Forge

## Objetivo

O FROTAK LAB é o ambiente onde mudanças do Forge devem ser executadas, testadas e demonstradas antes de qualquer aprovação para produção.

## Regra principal

Produção não é ambiente de teste. Um tenant novo dentro do mesmo banco de produção não isola migrations, funções, triggers, policies ou mudanças de schema. Por isso, a validação deve usar um banco Supabase separado da produção.

## Topologia alvo

- GitHub `main`: código aprovado para produção.
- Branch de tarefa do Forge: código em desenvolvimento.
- Supabase Produção: dados reais; não recebe mudanças antes da aprovação.
- Supabase Staging: projeto separado; recebe migrations da branch e somente dados fictícios.
- Tenant de staging: `FROTAK LAB`.
- Vercel Produção: aponta somente para Supabase Produção.
- Vercel Preview/Staging: deve apontar somente para Supabase Staging.

## Gate obrigatório

Uma tarefa não pode ser marcada como concluída apenas porque compilou ou porque o código foi escrito. Antes da decisão de Lucas, o Publicador deve produzir um Decision Package com:

1. commit exato;
2. migrations e arquivos alterados;
3. build e testes executados;
4. evidência do comportamento esperado;
5. riscos conhecidos;
6. rollback;
7. link de preview quando houver UI;
8. confirmação de que nenhum passo tocou produção.

## Modo disponível sem credenciais de staging

Enquanto o Supabase Staging hospedado não estiver conectado ao Forge, o repositório deve validar migrations em um Supabase local/efêmero no CI. Esse banco é descartável e não contém dados reais.

Isso é uma barreira técnica real: o Forge não deve fingir que criou um projeto Supabase ou configurou variáveis da Vercel quando não possui acesso administrativo correspondente.

## Dados do laboratório

O tenant FROTAK LAB usa somente dados sintéticos. É proibido copiar dados de clientes reais, tokens, documentos fiscais reais, credenciais de motorista ou segredos de produção.

Conjunto mínimo para smoke tests:

- 1 tenant FROTAK LAB;
- 1 workspace padrão;
- 2 motoristas fictícios;
- 2 veículos fictícios;
- 1 remetente fictício;
- 1 destinatário fictício;
- 1 produto fictício;
- fretes de teste fixo e por tonelada.

## Fluxo de trabalho

`pedido -> branch -> migrations -> banco de teste -> testes -> preview -> Decision Package -> Lucas aprova/rejeita -> produção`

Nenhum agente tem permissão para pular o gate de aprovação de produção.