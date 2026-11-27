# Terceiros

Separa no TMS o que é da frota própria do que é de terceiros (motorista, cavalo e carreta), para o
Kanban, o link do motorista e o faturamento. Feito em 2026-11-26.

## Como funciona

| Etapa | Onde | O quê |
|---|---|---|
| 1. Cadastro | TMS > **Terceiros** (`/terceiros`, `frotak-tms/src/modules/fleet-core/ui/pages/TerceirosPage.tsx`) | Cadastra ou marca motorista, cavalo e carreta como terceiro. Tudo que já existia fica como frota própria |
| 2. Banco | `supabase/migrations/202611260002_fleet_ownership_third_party.sql` | Coluna `ownership` (`propria` ou `terceiro`) em `vehicles`, `drivers` e `trailers`. Frete e histórico guardam a propriedade do veículo no momento do frete (trigger), e o frete ativo acompanha uma troca de cadastro |
| 3. Link do motorista | Card do frete > **Link do motorista** (`frotak-tms/src/components/fleet/DriverLinkPanel.tsx`) | **Terceiro · app simples**: link `/motorista/<token>` sem app nem login. **Frota própria · app oficial**: libera o login do motorista no app oficial e gera o link para mandar no WhatsApp |
| 4. Status pelo link | `frotak-tms/server/lib/driver-link.ts` → `driver_link_advance_stage` | Os botões do link do terceiro movem o card no Kanban pelo mesmo fluxo de etapas do app oficial. A posição do celular aparece no card e no mapa com cidade/UF |
| 5. Faturamento | Financeiro > rentabilidade da frota (`get_fleet_profitability_by_ownership`) | Receita, custo e resultado separados entre frota própria e terceiros |

O link simples é só para terceiros: o servidor recusa gerar para veículo da frota própria.

## App oficial para frota própria

"Liberar app oficial" usa o mesmo fluxo da tela de Motoristas (`createDriverAppAccess`): cria ou
redefine o login com a senha temporária `DRIVER_TEMPORARY_PASSWORD` (`123456`), e o motorista troca no
primeiro acesso. Exige o dono do tenant e o módulo `driver_app` liberado no Master.

O link enviado é `<app motorista>/?telefone=<dígitos>`; o app motorista (`frota-motorista`) só preenche o
campo de telefone com esse parâmetro. O endereço vem de `VITE_DRIVER_APP_URL` e, sem ela, usa
`https://frota-motorista.vercel.app`.

## Ligar em cada ambiente

**VPS (banco por cliente):** automático depois de aplicar as migrations (202611260002 e a correção 202611270001) e publicar o TMS.

**Supabase hospedado (banco único):** aplicar a migration e a correção `202611270001_fix_freight_ownership_snapshot.sql` (sem ela, criar frete falha com `record "new" has no field "freight_id"`). Ela pode rodar de novo sem efeito, e não faz
UPDATE nos fretes (os existentes recebem `propria` pelo default da coluna).

## Limites conhecidos

- Agregado não tem opção própria: conta como frota própria.
- Sem a migration, a tela de Terceiros avisa que falta o campo, o link só registra o status e o
  faturamento esconde o bloco por propriedade.
