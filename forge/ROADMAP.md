# Frotak Forge — Roadmap

## Fase 0 — Arquitetura (este bootstrap)

- contratos de domínio;
- workflow;
- papéis dos agentes;
- repositório inteligente;
- segurança e gates;
- branch isolada para o próprio Forge.

Critério de saída: arquitetura revisável em Git, sem tocar o runtime da Frotak.

## Fase 1 — Vertical slice

Objetivo: um pedido pequeno vira um PR/preview sem Lucas abrir VS Code.

Implementar:

1. `FeatureRequest` via CLI/API simples;
2. Context Builder para GitHub;
3. Product + Architect;
4. um Implementer genérico;
5. comandos de validação;
6. branch/PR automático;
7. preview;
8. Decision Package.

Sem deploy automático em produção.

## Fase 2 — Especialização

Separar quando houver ganho real:

- Backend/Data;
- Frontend/UX;
- QA;
- Security;
- Reviewer;
- Release.

Adicionar paralelização controlada.

## Fase 3 — Knowledge Repository persistente

- indexação incremental por commit;
- provenance store;
- busca lexical + semântica + símbolos;
- memória de decisões;
- detecção de conflito/fonte obsoleta;
- context packages reprodutíveis.

## Fase 4 — Sandboxes e previews robustos

- runner efêmero;
- limites de comando/rede;
- Vercel Preview;
- banco de preview;
- Playwright;
- captura de screenshots/evidências.

## Fase 5 — Release controlado

- approval artifact;
- merge/release pipeline;
- smoke tests pós-deploy;
- rollback assistido;
- auditoria de releases.

## Primeiro teste do pipeline

Não começar pelo sistema completo de pneus. Antes, escolher uma mudança pequena mas real que atravesse frontend + validação + preview.

Critério do Forge v0.1:

> Lucas descreve a mudança, não abre VS Code, recebe um preview e decide sim/não.

## Primeiro teste grande sugerido

Depois do vertical slice estar confiável, usar **Controle de Pneus** como teste de feature completa, pois força o Forge a lidar com:

- domínio novo;
- banco/migrations;
- UX;
- CRUD e histórico;
- regras de negócio;
- testes;
- relatórios/indicadores;
- segurança multi-tenant;
- rollout.
