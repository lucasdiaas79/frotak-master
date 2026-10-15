# Planos — master

Estado: inventory-required. Este roteiro combina o escopo informado com boas práticas de verificação. Confirme regras no código do produto e registre commit/data; não presumir implementação.

## Entidades e contratos
Plano; módulos; limites; vigência; assinatura; cliente; cobrança.

## Regras a conferir
Entitlements; transição; limites; efeito no uso existente; aprovação comercial.

## Fluxo principal
Definir plano → associar cliente → aplicar vigência → conferir acesso e limites.

## Aceitação específica
Upgrade/downgrade; limites atingidos; fronteiras de cobrança; histórico de vigência.

## Estados e permissões
Verificar carregamento, vazio, sucesso, erro, acesso negado, offline e dados obsoletos quando aplicáveis. Relacionar o operador ao escopo de dados autorizado. Operações em lote preservam seleção e informam resultado parcial.

## Referências e arquitetura
Registrar rotas, componentes, serviços, modelos, APIs, versão do esquema e contratos externos. Usar identidade global FrotaK e contexto do produto. Documentar dependências entre módulos em dependsOn.

## Evidência e continuidade
Checkpoint com concluído, pendente, próxima ação, commit, ambiente e evidência. Separar teste simulado, teste de interface e teste de integração real. Decisões aprovadas mantêm versão e origem; dúvidas permanecem explícitas.
