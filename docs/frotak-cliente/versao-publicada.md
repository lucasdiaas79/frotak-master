# Diferencas da versao publicada

Esta e a fonte canonica da divergencia de versao nesta auditoria. Checkout: `9acb0592f57db6299594035b1a17e4c0160a67af`. Dominio `central-dias.vercel.app`: deployment Ready `dpl_Mai8gd2SSRKk2UzWPvCV54n8pU4b`, main, commit `974adae7cde3b1d02eec09fb7abf2b065df3a153`, criado em 2026-10-15. Ver EV-REMOTE-01. Nao foi feito checkout/reset/merge para aproximar as versoes.

Foram lidos os 17 arquivos alterados entre as revisoes (incluindo routeTree gerado). Cinco fontes TS/TSX novas e uma rota HTTP de push explicam parte da diferenca: 159 fontes, 34 rotas, 1048 declaracoes CTL, 70 SUP e 71 migrations no commit publicado. Inventarios separados em [deploy-974adae](inventarios/deploy-974adae/cobertura-estatica.json); IDs compartilhados mantem referencia quando contexto/rotulo nao mudou.

## MOD-IDLE: veiculos parados e rendimento

`src/lib/frotakAiIdle.ts` adiciona ferramentas `veiculos_parados` e `rendimento_frota`; `registrar_motivo_parado` entra nas acoes confirmadas. O briefing/alertas passa a consultar veiculos sem viagem ha 24 h, com motivo e pergunta quando desconhecido.

`listIdleVehicles`: exclui veiculo com current_freight_id, situacao em-rota ou frete active; consulta fretes planned para motivo, ultima viagem completed, eventos motivo_parado e ciclos do motorista. Marco temporal: ultima viagem, senao last_transition_at, senao created_at. Minimo configurable 1..2160 h, padrao 24; limite 1..80 (default30); queries possuem tetos de 1000/2000/3000 linhas, portanto nao e contagem ilimitada certificada.

Motivos sao classificados: manutencao/quebrado, frete planejado, sem motorista, motorista inativo, retorno para casa registrado, carga/descarga ou desconhecido. Evento de motivo registrado deve ser posterior ao marco de parada para prevalecer. A classificacao retorno para casa deriva de close_reason do ciclo; nao e comprovacao externa de folga. Sao regras implementadas, nao inferencias a adicionar ao manual do gestor sem ressalva.

`computeFleetUtilization`: janela 7..180 dias (default30), dias inteiros UTC-3. Une dias cobertos por intervalos de frete por veiculo/motorista, limita dias em viagem ao periodo e calcula dias parados=total-dias cobertos e percentual. Para owner, pode calcular receita media por dia de viagem e frete nao feito estimado=dias parados x essa media. E **estimativa**, nao perda financeira contabilizada. Datas/limites de queries podem truncar amostras e precisam de testes proprios.

`registrar_motivo_parado`: owner, descricao de pelo menos tres caracteres e ausencia de frete ativo na preparacao; token/confirmacao reutilizam fluxo de acoes e insere fleet_event event_type motivo_parado. Nao executado.

## MOD-PUSH: avisos no aparelho

Novo `components/frotak/FrotakPushToggle.tsx` na rota IA. Controle simbolico Ligar/Desligar avisos no celular; estado inicial verifica suporte, permissao e subscription local. Ativar solicita Notification permission, key publica, registra/aguarda service worker, assina PushManager, salva endpoint/chaves/user-agent pelo servidor autenticado. Desativar remove registro do usuario e unsubscribe local. Nao acionado nesta auditoria, nem aceita permissao.

Server functions em `lib/frotakPush.ts`: obter key publica, salvar/remover subscription; contexto tenant/workspace autenticado, gravacao com admin. Dispatcher lista ate 5000 subscriptions, agrupa por workspace e verifica memberships ativas, consulta ociosos pelo tenant e envia ate tres exemplos por notificacao. Respostas 404/410 removem assinatura; sucesso atualiza last_sent_at, falha last_error. Nao existe retry persistente dedicado nem filtro diario por last_sent_at nesse codigo: cron invocado repetidamente pode reenviar.

`/api/frotak-ia/push-dispatch`: POST exige FROTAK_PUSH_CRON_TOKEN via bearer ou header; responde 401/500/estatisticas. `webPush.ts` implementa WebCrypto/VAPID (P-256, AES-GCM), TTL default 12 h e POST para endpoint da subscription; nao foi enviado payload a terceiro.

Migration `202610150001_frotak_ia_push_subscriptions.sql` define tabela com endpoint unico, tenant/workspace/user, chaves e metadados, RLS SELECT/DELETE proprio, touch trigger e cron diario 11 UTC/08h Brasilia. Esses objetos NAO aparecem no banco vinculado consultado (EV-SCHEMA-01). Configuracao VAPID/cron no deployment e uso de outro banco nao foram verificados. Portanto feature em codigo publicado nao e integracao ativa comprovada.

Service worker publicado recebe push e abre/foca a rota de destino quando clicado; cache continua excluindo /api e server functions. Push transporta placas/motivos operacionais a provedores do browser e pode aparecer na tela bloqueada; finalidade/acesso e dados enviados merecem contrato explicito antes de ampliar uso. Nao foram lidas subscriptions reais.

## MOD-LIVE-DELTA: voz deterministica

No checkout, tool result deterministico podia ser falado via sintese do browser. No commit publicado, `FrotakLiveSession` envia deterministicAnswer ao Gemini e deixa a propria voz do modelo ler; callback speakPortuguese foi removido da rota. Isso preserva voz consistente, mas execucao do renderer no servidor nao comprova reproducao literal de audio pelo modelo. O contrato e a regressao de fidelidade numerica precisam ser testados no deploy, nao herdados dos 19 testes locais.

## Lacunas especificas

- GAP-PUSH-01: feature publicada sem objetos de push no banco vinculado; confirmar destino real de backend e aplicacao/configuracao em tarefa autorizada separada. Nenhuma migration aplicada aqui.
- GAP-PUSH-02: enable pode criar subscription no browser e falhar ao salvar no banco; disable nao verifica result.ok antes de sucesso local. Estado local nao garante entrega remota.
- GAP-PUSH-03: dispatcher valida membership ativa, mas usa admin para consulta e nao repete toda validacao de profile/workspace/tenant do resolveFrotakAiContext; revisar revogacao/estado inativo/consistencia de tenant.
- GAP-IDLE-01: limites de amostra, janela por dia, motivos derivados e estimativa de receita exigem teste; nao chamar estimativa de valor financeiro perdido real.
- GAP-LIVE-01: mudanca do narrador deterministico pode mudar fidelidade do audio; teste real NE.
- Bloqueio de browser na continuacao impediu inspecao adicional desse toggle e detalhes; comportamento acima e COD do commit publicado, nao OBS/TEST.
