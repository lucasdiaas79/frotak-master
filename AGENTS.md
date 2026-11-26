# FrotaK · repositório

> [!IMPORTANT]
> Este repositório já foi ligado ao [Lovable](https://lovable.dev). Não reescreva histórico já
> publicado (force push, rebase, amend ou squash de commits enviados). Desde 2026-11-26 os apps não
> ficam mais na raiz, então o Lovable não edita mais o código; a Vercel publica cada app pela pasta
> configurada em "Root Directory".

## Estrutura

| Pasta | O que é | Instruções |
|---|---|---|
| `frotak-central/` | **Central (Master)**: painel da equipe FrotaK. Cadastra clientes, liga módulos, cria o ambiente de cada cliente, painel de infraestrutura | `frotak-central/AGENTS.md` |
| `frotak-tms/` | **TMS**: sistema da transportadora cliente (frota, financeiro, Frotak IA, rastreadores, motorista) | `frotak-tms/AGENTS.md` |
| `supabase/` | Migrations e testes SQL do banco, **compartilhados pelos dois apps** (mesmo esquema no banco único e em cada banco de cliente) | — |
| `deploy/` | Instalação e operação das VPS (Serviço e Banco) | `deploy/README.md` |
| `docs/` | Documentação de arquitetura e checkpoints | `ARQUITETURA-ATUAL-E-MUDANCAS.md` |
| `scripts/` | Utilitários do repositório inteiro (`dev-all.ps1` sobe os dois apps) | — |

Cada app é um projeto independente (próprio `package.json`, `node_modules`, lint e testes). Rode os
comandos dentro da pasta do app, ou pelos atalhos do `package.json` da raiz.

## Regras que valem para os dois apps

- Todo código novo funciona nos dois modos: banco único (produção atual) e banco por cliente (VPS).
- Migration nova vai em `supabase/migrations/` na raiz; o agente da VPS de banco aplica no modelo,
  no Central e em cada cliente.
- Commits em Conventional Commits.
