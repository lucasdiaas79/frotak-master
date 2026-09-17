# FROTAK LAB — ambiente de validação do Forge

## Objetivo

O FROTAK LAB é o ambiente onde mudanças do Forge devem ser executadas, testadas e demonstradas antes de qualquer aprovação para produção.

## Regra principal

Produção não é ambiente de teste. Um tenant novo dentro do mesmo banco de produção não isola migrations, funções, triggers, policies ou mudanças de schema.

A partir de 17 set 2026, o modo ativo do FROTAK LAB é **zero-cost e local/efêmero**. Nenhum branch/projeto Supabase hospedado deve ser criado sem nova autorização explícita do Lucas depois de apresentar qualquer custo.

## Topologia ativa — zero-cost

- GitHub `main`: código aprovado para produção; não recebe a Wave 0 antes da aprovação.
- Branch de tarefa do Forge: código em desenvolvimento.
- Supabase Produção: somente leitura para diagnóstico quando necessário; nenhuma migration/teste da Wave 0 é aplicada ali.
- Supabase FROTAK LAB: instância local/efêmera criada dentro do runner do CI, em `127.0.0.1`, destruída no fim do job.
- Dados do laboratório: somente dados sintéticos.
- Vercel Produção: não é alterado.
- Supabase Branching/Preview Branch: desativado no modo zero-cost.
- Preview hospedado: não é requisito enquanto depender de recurso pago ou de conexão com produção.

O repositório é público e o workflow usa apenas runner padrão `ubuntu-latest`; não usa larger runners, cache nem upload de artifacts no fluxo da Wave 0.

## Proteções técnicas do CI

O workflow da Wave 0 deve:

1. usar somente um Supabase local iniciado pelo CLI;
2. recusar execução se encontrar `supabase/.temp/project-ref`, evitando banco linkado;
3. nunca executar `db push`, migration remota, branch creation ou deploy contra Supabase Produção;
4. recriar o banco de laboratório do zero para cada validação;
5. executar migrations e testes apenas contra `127.0.0.1`;
6. destruir o ambiente ao final do job;
7. não copiar dados, tokens ou documentos de produção.

O Central possui referências legadas a quatro arquivos SQL locais que não existem mais no repositório. Para permitir que o **build** valide o código atual sem copiar dados reais nem alterar o runtime, o CI cria placeholders vazios e temporários apenas dentro do runner. Esses arquivos nunca são commitados, nunca são enviados à produção e não constituem teste do modo local legado; servem somente para remover a dependência de arquivos ausentes durante a compilação.

## Gate obrigatório

Uma tarefa não pode ser marcada como concluída apenas porque compilou ou porque o código foi escrito. Antes da decisão de Lucas, o Publicador deve produzir um Decision Package com:

1. commit exato;
2. migrations e arquivos alterados;
3. build e testes executados;
4. evidência do comportamento esperado;
5. riscos conhecidos;
6. rollback;
7. evidência visual quando houver UI e isso puder ser produzido sem tocar produção;
8. confirmação de que nenhum passo tocou produção;
9. confirmação de que nenhum recurso pago foi criado para a validação.

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

`pedido -> branch -> migrations -> Supabase local efêmero -> testes -> evidências -> Decision Package -> Lucas aprova/rejeita -> produção`

Se no futuro for necessário um preview interativo hospedado, a criação de qualquer infraestrutura adicional deve ser tratada como uma decisão separada, com custo informado antes e aprovação explícita do Lucas.

Nenhum agente tem permissão para pular o gate de aprovação de produção.