# Preview Environment Contract

Este arquivo define o contrato do preview da Frotak. Ele nao contem segredos.

## Regra de isolamento

Um preview somente pode ser apresentado para aprovacao quando estiver ligado a um Supabase Staging separado da producao. Preview apontando para banco de producao e considerado invalido, mesmo que a URL seja diferente.

## Variaveis obrigatorias do Central Preview

- `VITE_SUPABASE_URL`: URL do Supabase Staging.
- `VITE_SUPABASE_ANON_KEY`: anon/publishable key do Supabase Staging.
- `SUPABASE_URL`: mesma URL do Supabase Staging, para validacoes server-side.
- `SUPABASE_ANON_KEY`: anon key do Staging, usada pelo gate server-side da Frotak IA.
- `VITE_ALLOW_INSECURE_LOCAL_SSO=false`.

Quando a Frotak IA for testada:

- `GEMINI_API_KEY` deve estar configurada somente como secret de ambiente;
- o token do usuario e validado contra o Supabase Staging antes de qualquer chamada ao provedor de IA.

## Variaveis que nao devem ser copiadas automaticamente da producao

- `SUPABASE_SERVICE_ROLE_KEY`;
- credenciais Sascar;
- tokens de integracoes externas;
- webhooks de clientes;
- qualquer segredo fiscal ou documento real.

Se uma funcionalidade de staging realmente exigir um desses itens, deve existir uma credencial propria de staging ou um adapter fake/sandbox explicitamente identificado.

## Dados

O banco de preview usa `supabase/seed.sql`, que cria somente o tenant sintetico `FROTAK LAB` e registros ficticios. Um usuario Auth de staging deve ser criado/provisionado no proprio projeto de staging; credenciais reais nao sao copiadas.

## Gate do Publicador

Antes de entregar o link a Lucas, o Publicador deve confirmar:

1. URL do preview;
2. commit exato;
3. Supabase project ref do staging (sem expor secrets);
4. confirmacao de que o project ref e diferente do projeto de producao;
5. migrations aplicadas;
6. testes verdes;
7. nenhuma integracao real habilitada sem autorizacao explicita.

Sem essas sete evidencias, o preview e classificado como `NOT_SAFE_FOR_OWNER_REVIEW`.