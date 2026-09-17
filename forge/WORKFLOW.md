# Frotak Forge — Workflow v0.1

## Máquina de estados

```text
DRAFT
  -> CONTEXT_BUILDING
  -> SPECIFYING
  -> PLANNING
  -> IMPLEMENTING
  -> INTEGRATING
  -> TESTING
  -> REVIEWING
  -> PREVIEWING
  -> AWAITING_OWNER_APPROVAL
      -> APPROVED -> DEPLOYING -> VERIFYING -> DONE
      -> REJECTED -> PLANNING | IMPLEMENTING
```

Falhas podem ir para `FAILED`; um release revertido vai para `ROLLED_BACK`.

## Etapa 1 — Intake

Entrada mínima:

- pedido em linguagem natural;
- prioridade;
- opcionalmente restrições ou prazo.

O Product Agent transforma isso em `ProductSpec`, contendo objetivo, fora de escopo, critérios de aceite, impacto esperado e dúvidas bloqueantes.

## Etapa 2 — Context Build

O Context Builder coleta apenas o que for relevante:

- código atual;
- migrations;
- documentação arquitetural;
- contratos de domínio;
- componentes visuais relacionados;
- testes existentes;
- histórico recente de mudanças na área;
- erros/alertas conhecidos relacionados.

Saída: `ContextSnapshot` imutável, com refs exatas de commit/arquivo.

## Etapa 3 — Planning

Architect Agent define:

- arquivos/módulos afetados;
- impacto em banco;
- impacto em auth/RLS;
- impacto em realtime;
- impacto no app do motorista;
- estratégia de testes;
- estratégia de rollout/rollback;
- nível de risco.

Mudanças de auth, RLS, migrations destrutivas ou produção elevam automaticamente o nível de aprovação.

## Etapa 4 — Implementation

O orquestrador seleciona especialistas necessários.

Backend/Data e Frontend podem trabalhar em paralelo quando o plano permitir. Eles compartilham contratos, não contexto irrestrito.

Cada alteração acontece em branch de tarefa, por exemplo:

`forge/task-<id>-<slug>`

## Etapa 5 — Integration

Reviewer Agent verifica coerência cruzada entre frontend, backend, migrations e contratos.

Critérios mínimos:

- build/typecheck;
- lint relevante;
- testes unitários/integrados disponíveis;
- migration review quando aplicável;
- sem secrets em diff;
- sem hardcode de tenant;
- sem quebra conhecida de fluxo operacional.

## Etapa 6 — QA e Security

QA Agent tenta quebrar o resultado por critérios de aceite e regressão.

Security Agent foca em:

- auth/RLS;
- isolamento tenant/workspace;
- exposição de secrets;
- actions perigosas;
- permissões excessivas;
- injeção em tool calls;
- dependências e supply chain quando aplicável.

Falha crítica volta para `IMPLEMENTING`.

## Etapa 7 — Preview

O Release Agent prepara:

- commit consolidado;
- PR;
- preview URL;
- ambiente de banco isolado se necessário;
- changelog;
- checklist de validação;
- rollback plan.

## Etapa 8 — Gate humano

Lucas recebe um `DecisionPackage` com:

- o que mudou;
- por que mudou;
- o que foi testado;
- o que não foi testado;
- riscos residuais;
- screenshots/evidências;
- preview;
- diff/PR;
- custo aproximado do run.

Apenas Lucas pode emitir `APPROVE_PRODUCTION` na v0.1.

## Etapa 9 — Deploy e verificação

Após aprovação:

1. merge/release pelo pipeline autorizado;
2. deploy;
3. smoke tests em produção;
4. health checks;
5. confirmar versão/commit publicado;
6. registrar `ReleaseArtifact`.

Se a verificação falhar, o Forge deve preferir rollback seguro a improvisação em produção.

## Regra anti-loop

Cada etapa tem limite de tentativas. Agentes não podem ficar revisando um ao outro indefinidamente.

Após `N` falhas no mesmo gate, o run entra em `NEEDS_HUMAN` com diagnóstico consolidado.
