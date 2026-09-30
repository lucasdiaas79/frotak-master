# Frotak Forge

Frotak Forge é a fábrica interna de software da Frotak. Não é uma feature exposta aos clientes.

Objetivo principal: Lucas descreve uma mudança em linguagem natural e recebe, ao final de um fluxo auditável de agentes, um preview funcional pronto para decisão humana de **aprovar ou rejeitar**. Produção nunca é alterada sem aprovação explícita.

## Princípios

1. **Humano no portão de produção** — agentes podem analisar, codar, testar e preparar preview; deploy em produção exige aprovação explícita de Lucas.
2. **Contexto antes de código** — todo trabalho começa construindo um snapshot de contexto a partir do código atual, migrations, regras e estado real do produto.
3. **Agentes especializados, não burocráticos** — só participam os agentes necessários para o risco e o escopo da tarefa.
4. **Artefatos estruturados** — agentes trocam especificações, planos, diffs, relatórios e evidências, não conversas livres intermináveis.
5. **Ambiente isolado por tarefa** — branch/worktree própria, preview próprio e banco isolado quando houver migration ou escrita de dados.
6. **Sem acesso destrutivo direto à produção** — credenciais e ferramentas de produção ficam fora do alcance normal dos agentes.
7. **Auditabilidade total** — toda decisão, chamada de agente, fonte consultada, mudança de código, teste e aprovação precisa ser rastreável.
8. **Arquitetura substituível** — modelo, provedor e motor de workflow são adapters. A identidade do Forge está nos contratos, políticas e histórico.

## Primeira meta operacional

`pedido em português -> contexto -> spec -> implementação -> testes -> preview -> aprovação humana`

Exemplo de entrada:

> “Quero colocar um sistema de controle de pneus de caminhão.”

Saída esperada do Forge:

- especificação funcional e critérios de aceite;
- plano técnico;
- migrations propostas, se necessárias;
- backend e frontend implementados;
- testes automatizados e evidências;
- revisão de segurança e regressão;
- URL de preview;
- resumo objetivo de riscos;
- botão/ação final: **APROVAR PRODUÇÃO** ou **REJEITAR / PEDIR AJUSTES**.

Veja `ARCHITECTURE.md`, `WORKFLOW.md`, `AGENTS.md`, `KNOWLEDGE_REPOSITORY.md` e `SECURITY_AND_GATES.md`.
