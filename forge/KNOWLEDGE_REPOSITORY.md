# Frotak Forge — Knowledge Repository v0.1

## Objetivo

O repositório inteligente existe para impedir que cada agente “redescubra” a Frotak do zero. Ele monta contexto confiável, versionado e mínimo para cada tarefa.

Não é um chat history gigante e não é apenas embeddings.

## Tipos de fonte

```text
SOURCE_CODE
DB_MIGRATION
ARCHITECTURE_DOC
CURRENT_STATE_DOC
DOMAIN_RULE
TEST
PULL_REQUEST
ISSUE
DEPLOYMENT
RUNTIME_ERROR
SCREENSHOT_OR_VIDEO_NOTE
MANUAL_DECISION
```

Cada fonte deve guardar pelo menos:

- `source_id`;
- `source_type`;
- `repository`;
- `path_or_url`;
- `commit_sha/revision`;
- `captured_at`;
- `content_hash`;
- `authority_rank`;
- `tags`;
- `supersedes`;
- `is_stale`.

## Precedência

Para conhecimento arquitetural da Frotak:

1. código atual;
2. migrations atuais;
3. documento de estado atual;
4. regras arquiteturais;
5. contexto master;
6. histórico.

Precedência não elimina conflito. Divergência importante vira artefato explícito.

## Pipeline de indexação

```text
GitHub / Docs / Runtime
        |
        v
   Source Ingestor
        |
        v
Normalizer + Metadata
        |
        +--> lexical index
        +--> semantic index (opcional)
        +--> symbol/code index
        +--> relationship index
        |
        v
 Provenance Store
```

## Retrieval híbrido

Uma pergunta técnica pode exigir estratégias diferentes:

- símbolo/função: busca estrutural/código;
- regra de negócio: busca documental;
- migration: busca por schema/SQL;
- regressão: histórico de PR/testes;
- decisão antiga: memória de decisões;
- UI: componentes e evidências visuais.

O Context Builder combina essas fontes e entrega `ContextPackage`.

## Context Package

Estrutura conceitual:

```json
{
  "task_id": "...",
  "repo_sha": "...",
  "scope": ["central-dias-main", "supabase"],
  "domain_rules": [],
  "relevant_files": [],
  "schema_refs": [],
  "tests": [],
  "recent_changes": [],
  "known_risks": [],
  "conflicts": [],
  "source_refs": []
}
```

Ele precisa ser reproduzível. Se o código mudar durante um run, o Forge não deve silenciosamente trocar o contexto: cria novo snapshot ou rebasa/replaneja explicitamente.

## Memória de engenharia

Além das fontes brutas, o Forge pode guardar decisões consolidadas, sempre com proveniência:

- “não liberar motorista automaticamente após descarga”;
- “vehicle é snapshot; freight_id é viagem”;
- “financeiro não pode derrubar operação”;
- “não usar select * em listas pesadas”; etc.

Toda memória derivada precisa apontar para as fontes que a sustentam e pode expirar ou ser substituída.

## O que não entra

Na v0.1, não indexar indiscriminadamente dados operacionais de tenants/clientes. O Forge é ferramenta de engenharia. Se uma tarefa exigir dados reais para diagnóstico, acesso deve ser explícito, minimizado e auditado.

## Meta de qualidade

O objetivo não é “lembrar tudo”. É entregar ao agente o menor conjunto de contexto suficiente para tomar uma decisão tecnicamente correta e rastreável.
