# Frotak Embarcador

Portal grátis do embarcador (cliente da transportadora): **torre de controle das suas cargas**.
Junta todas as transportadoras que usam a Frotak, os terceiros que levam a carga dele e a Rede Frotak.

## Ver rodando no seu computador (sem banco)

```bash
cd central-dias-main
npm install
npm run dev
```

Abra:

| Tela | Endereço |
| --- | --- |
| Portal do embarcador (demonstração) | http://localhost:8080/embarcador/demo (ou a porta que o Vite mostrar) |
| Link do motorista (demonstração) | http://localhost:8080/motorista/demo |

A demonstração usa dados fictícios e não grava nada; dá para clicar em tudo
(aprovar e bloquear motorista, avaliar viagem, observação interna, ligar a rede,
lançar abastecimento e despesa no link do motorista).

## O que tem

**Portal do embarcador** (`/embarcador`)
- Painel: cargas em andamento, mapa, alertas (ocorrência, canhoto, motorista com documento irregular).
- Cargas, Frotak IA, Transportadoras (convite e conexão), Documentos e Indicadores.
- **Terceiros**: os motoristas que já levaram carga dele, com nota, viagens, documentos,
  por qual transportadora vieram, aprovar, bloquear e ranking de pontualidade.
- **Perfil do motorista**: documentos, histórico com as cargas dele, nota por viagem e observação interna.
- **Rede Frotak** (opt-in): terceiros aprovados por outros embarcadores. Só vê quem também compartilha.

**Na Frotak da transportadora** (Gestão de frota, detalhe do veículo com frete)
- *Compartilhar com o cliente*: link de acompanhamento sem login.
- *Link do motorista*: celular, vínculo e valor combinado, depois copiar ou mandar por WhatsApp.
- Menu *Embarcadores*: convidar e ver os embarcadores conectados.

**Link do motorista** (`/motorista/<token>`, sem app e sem login)
- Viagem: status, rota no Waze e envio de posição (a cada 3 min com a tela aberta).
- Abastecer: litros, valor e km; mostra o km/l e compara com a média da frota. Também lança despesas.
- Acerto: valor combinado, adiantamentos, reembolsos e saldo da viagem.
- Documentos: validade de CNH, RNTRC, seguro, CRLV e GR; entrada e saída da Rede Frotak.

## Privacidade (regras no servidor)
- O embarcador nunca vê o valor do frete, quanto o motorista recebe, nem os outros clientes da transportadora.
- A rede nunca mostra com qual transportadora o motorista rodou, nem o telefone, o CPF ou as observações.
- Bloqueio compartilhado só esconde o motorista; o motivo não sai da empresa.
- O motorista vê só o próprio acerto. Os links guardam só o hash do token e expiram.

## Colocar no ar (Supabase atual, sem banco novo)

Aplique as 3 migrations **nesta ordem**, no SQL Editor do Supabase ou com `supabase db push`:

1. `supabase/migrations/202611110001_freight_share_links.sql`: links de acompanhamento.
2. `supabase/migrations/202611110002_shipper_portal.sql`: embarcadores, membros e conexões.
3. `supabase/migrations/202611110003_shipper_third_party_network.sql`: motoristas da rede,
   documentos, avaliações, decisões, configurações da rede e o link do motorista.

Todas as tabelas novas ficam com RLS ligado e sem acesso para `anon`/`authenticated`; só o servidor
(service role) lê e grava. Nada nas tabelas existentes é alterado.

Variáveis já usadas: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` e, para a IA do embarcador, `GEMINI_API_KEY`.

## Limites desta versão
- Funciona no modo de banco único (o de produção). No modo de um banco por cliente
  (`FROTAK_AGENT_URL`), o portal mostra um aviso, porque o embarcador precisa juntar várias transportadoras.
- Os botões de status do motorista ficam registrados como eventos e não movem o Kanban sozinhos,
  para não furar o fluxo de etapas da transportadora.
- Foto de comprovante pelo link do motorista fica para a próxima versão.
