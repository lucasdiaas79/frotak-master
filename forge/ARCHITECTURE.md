# Frotak Forge — Arquitetura v0.1

## 1. Visão geral

O Forge é um **control plane de desenvolvimento assistido por múltiplos agentes**. Ele não roda dentro do tenant do cliente e não participa da operação diária da transportadora. Seu usuário inicial é Lucas, como Product Owner da Frotak.

```text
Lucas
  |
  v
Forge Control Plane
  |
  +--> Intake / Feature Request
  +--> Context Builder
  +--> Workflow Orchestrator
  |      |
  |      +--> Product Agent
  |      +--> Architect Agent
  |      +--> Backend & Data Agent
  |      +--> Frontend & UX Agent
  |      +--> QA Agent
  |      +--> Security Agent
  |      +--> Reviewer Agent
  |      +--> Release Agent
  |
  +--> Knowledge Repository
  +--> Execution Sandbox
  +--> GitHub / CI
  +--> Preview Environment
  +--> Approval Gate
             |
             +--> APPROVE -> Production pipeline
             +--> REJECT  -> Back to workflow
```

## 2. Componentes

### 2.1 Forge Control Plane

Interface interna para:

- criar feature requests;
- acompanhar execução;
- visualizar artefatos;
- abrir preview;
- ver riscos e testes;
- aprovar ou rejeitar produção;
- pausar/cancelar uma execução;
- auditar decisões anteriores.

O painel não precisa existir no primeiro commit funcional. A API e o modelo de domínio vêm primeiro.

### 2.2 Workflow Orchestrator

Responsável por estado, retries, dependências, gates e seleção dinâmica de agentes.

O orquestrador **não escreve código**. Ele decide qual especialista atua, valida se o artefato obrigatório foi produzido e controla a máquina de estados.

Estados canônicos iniciais:

```text
DRAFT
CONTEXT_BUILDING
SPECIFYING
PLANNING
IMPLEMENTING
INTEGRATING
TESTING
REVIEWING
PREVIEWING
AWAITING_OWNER_APPROVAL
APPROVED
DEPLOYING
VERIFYING
DONE
REJECTED
FAILED
ROLLED_BACK
CANCELLED
```

### 2.3 Knowledge Repository

Fonte de contexto técnico do Forge. Deve conhecer código, migrations, decisões arquiteturais, documentação, histórico de PRs, erros relevantes e regras de precedência.

Ele não é só RAG. O objetivo é montar um **Context Package versionado e rastreável** para cada tarefa.

### 2.4 Agent Runtime

Cada agente recebe:

- `task`;
- `context_package`;
- artefatos anteriores necessários;
- política de ferramentas;
- orçamento;
- contrato de saída.

Cada agente devolve artefatos estruturados. Um agente nunca escolhe livremente credenciais, branch de produção ou tenant de banco.

### 2.5 Execution Sandbox

Toda tarefa que altera código deve executar em ambiente isolado:

- branch própria no GitHub;
- checkout/worktree efêmero;
- filesystem temporário;
- comandos allow-listed;
- limite de tempo/custo;
- logs capturados;
- sem credenciais de produção por padrão.

### 2.6 Preview Environment

O resultado aprovado pelos agentes deve gerar um preview verificável antes da decisão humana.

Para frontend: Vercel Preview ou equivalente.
Para mudanças de banco: ambiente/branch de banco isolado, nunca o banco de produção.
Para integrações externas: mocks, sandbox ou credenciais de teste.

### 2.7 Approval Gate

Produção é uma capability separada. Apenas uma aprovação explícita de Lucas cria um `ApprovalArtifact` válido para a etapa de deploy.

Nenhuma instrução textual gerada por agente equivale a aprovação.

## 3. Fluxo de dados

```text
FeatureRequest
   |
   v
ContextSnapshot
   |
   v
ProductSpec
   |
   v
TechnicalPlan
   |
   +--> implementation branches / patches
   |
   v
TestReport + SecurityReport + ReviewReport
   |
   v
PreviewArtifact
   |
   v
OwnerApproval
   |
   v
ReleaseArtifact
```

Todos os artefatos carregam:

- `task_id`;
- `run_id`;
- `artifact_type`;
- `created_at`;
- `producer`;
- `source_refs`;
- `version`;
- `content_hash`;
- `status`.

## 4. Persistência do Forge

O Forge deve ter banco próprio, separado dos dados operacionais dos clientes.

Entidades iniciais:

- `forge_tasks`;
- `forge_runs`;
- `forge_agent_runs`;
- `forge_artifacts`;
- `forge_context_snapshots`;
- `forge_source_refs`;
- `forge_approvals`;
- `forge_tool_calls`;
- `forge_policy_events`;
- `forge_cost_events`;
- `forge_release_events`.

## 5. Adapters

Interfaces substituíveis:

```text
ModelAdapter
GitProvider
DeploymentProvider
DatabasePreviewProvider
BrowserTestProvider
NotificationProvider
KnowledgeIndexer
WorkflowEngine
```

Isso evita prender o Forge a um único LLM, provedor de deploy ou motor de agentes.

## 6. Regra de contexto da Frotak

Quando houver divergência entre fontes, o Context Builder deve aplicar a precedência:

```text
código atual
> migrations atuais
> estado atual documentado
> regras arquiteturais
> contexto master
> documentos históricos
```

Se duas fontes da mesma prioridade entrarem em conflito, o Forge deve gerar um `CONTEXT_CONFLICT` em vez de escolher silenciosamente.

## 7. Escopo da v0.1

A v0.1 precisa conseguir:

1. receber uma solicitação curta;
2. construir contexto da base atual;
3. produzir spec e plano;
4. criar branch isolada;
5. realizar uma mudança pequena;
6. rodar validações básicas;
7. publicar preview;
8. pedir aprovação humana;
9. nunca tocar produção sem aprovação.

O sistema de pneus pode ser o primeiro teste grande, mas o primeiro teste técnico deve ser menor para validar o pipeline ponta a ponta.
