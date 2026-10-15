# Provisionamento — master

Estado: inventory-required. Este roteiro combina o escopo informado com boas práticas de verificação. Confirme regras no código do produto e registre commit/data; não presumir implementação.

## Entidades e contratos
Solicitação; tenant; etapas; recursos; estado; erro; compensação.

## Regras a conferir
Idempotência; recursos parciais; repetição; rollback; fronteiras com provedores.

## Fluxo principal
Solicitar → validar → provisionar etapas → verificar → registrar conclusão ou recuperação.

## Aceitação específica
Falha em cada etapa; duplicidade; retomada; compensação; escopo de credenciais.

## Estados e permissões
Verificar carregamento, vazio, sucesso, erro, acesso negado, offline e dados obsoletos quando aplicáveis. Relacionar o operador ao escopo de dados autorizado. Operações em lote preservam seleção e informam resultado parcial.

## Referências e arquitetura
Registrar rotas, componentes, serviços, modelos, APIs, versão do esquema e contratos externos. Usar identidade global FrotaK e contexto do produto. Documentar dependências entre módulos em dependsOn.

## Evidência e continuidade
Checkpoint com concluído, pendente, próxima ação, commit, ambiente e evidência. Separar teste simulado, teste de interface e teste de integração real. Decisões aprovadas mantêm versão e origem; dúvidas permanecem explícitas.
