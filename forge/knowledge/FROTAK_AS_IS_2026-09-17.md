# Frotak — AS-IS técnico em 17/09/2026

Fonte: documento `DOCUMENTACAO_LOGICAS_FROTAK_MASTER_E_MOTORISTA.docx`, produzido a partir de análise estática de código e migrations do Frotak Master, Central Operacional, aplicativo Motorista, Supabase e integração Sascar.

## Como ler este documento

Este arquivo é um snapshot técnico do que o código/migrations indicam hoje. Ele **não prova sozinho** que todas as migrations estão aplicadas no ambiente remoto nem que todos os runtimes observados são os ativos em produção.

Classificação conceitual usada na fonte:
- **Implementado**: existe código cliente/servidor/SQL verificável.
- **Interface/mock**: tela ou dado demonstrativo sem persistência confirmada.
- **Lacuna**: dependência chamada pelo código sem implementação/migration local correspondente ou sem evidência de implantação.
- **Risco**: comportamento que enfraquece autenticação, autorização, consistência ou auditabilidade.

## Arquitetura observada

- **Frotak Master**: autenticação de plataforma, gestão de tenants, workspaces, módulos, planos, assinaturas, membros e provisionamento.
- **Central Operacional (`central-dias-main`)**: operação diária da transportadora: frota, kanban, fretes, documentos, mapa, financeiro, usuários do workspace e integrações.
- **Aplicativo Motorista**: demanda, eventos, documentos, abastecimento e posição.
- **Supabase**: multi-tenancy, RLS, RPCs, workflow, histórico, financeiro e integrações persistidas.
- **Sascar**: SOAP + sincronização de posições, com mais de uma implementação de runtime observada.

## Workflow de frete observado

Etapas canônicas:
1. `DISPONIVEL`
2. `EM ROTA CARREGAR`
3. `AGUARDANDO NOTA`
4. `NOTA EM CONFERENCIA`
5. `NOTA APROVADA AG CTE`
6. `CTE GERADA AG CONFIRMACAO MOTORISTA`
7. `EM ROTA ENTREGA`
8. `ENTREGUE AG FINALIZACAO`
9. `ENTREGA FINALIZADA`

Fluxo prático observado:
- demanda criada/vinculada com veículo, motorista, carretas, origem, destino, produto, valor, CIF/FOB e prazo;
- motorista aceita e segue para carregar;
- chegada ao remetente muda estado para espera de carga;
- nota fiscal é enviada e entra em conferência;
- Central aprova nota e prepara CTe/MDFe;
- motorista confirma recebimento e segue para entrega;
- chegada ao destinatário muda para descarga;
- descarga finaliza a entrega e aguarda decisão da expedição;
- expedição pode solicitar retorno ao pátio ou liberar novo frete;
- retorno ao pátio arquiva/reset de dados do frete em fluxo separado.

## Financeiro observado

A fundação financeira é relevante e já existe em nível considerável:
- frete canônico separado do estado mutável do veículo;
- business partners;
- plano de contas;
- centros de custo;
- títulos a pagar/receber;
- parcelas, alocações, baixas e estornos;
- DRE;
- fluxo de caixa realizado e projetado;
- rentabilidade por frota, veículo, frete e parceiro;
- integração assíncrona por jobs para fretes concluídos, abastecimentos e despesas;
- status `needs review` quando faltam dados essenciais;
- prazo de recebimento/pagamento com prioridade frete > parceiro > configuração do workspace.

### Eventos financeiros observados

- Frete `completed` pode gerar recebível de receita do frete.
- `fuel_record` pode gerar pagável de combustível/ARLA.
- `freight_expense` pode gerar pagável conforme categoria.
- Despesa ligada a um `fuel_record` evita documento duplicado e reaproveita o documento do combustível.

Isso indica que a missão de integração ponta a ponta **não parte do zero**. Há infraestrutura financeira já construída que precisa ser consolidada, corrigida e conectada aos fluxos reais.

## Abastecimento observado

O app motorista já registra:
- posto;
- odômetro;
- Diesel S10 e/ou ARLA;
- litros;
- valor;
- placa;
- motorista;
- anexo opcional;
- localização em metadata.

Cada combustível preenchido vira uma linha em `fuel_records`.

Existe também `freight_expenses`, com categorias como diesel S10, ARLA, pedágio, alimentação, estacionamento, manutenção e outros, cada uma com destino contábil previsto.

Ponto de atenção: há mais de um caminho de gravação de abastecimento; o aplicativo externo atual grava `fuel_records` diretamente via service role, enquanto existe RPC SQL prevista para caminho autenticado. Isso precisa ser unificado para garantir consistência, segurança e integração financeira previsível.

## Sascar observado

Existem dois sincronizadores observados:
- runtime Nitro da Central;
- Edge Function Supabase.

Ambos normalizam dados, relacionam veículo por `sascar_id` ou placa, persistem posições e atualizam localização atual.

Ponto de atenção: os runtimes têm diferenças de autenticação e recuperação de histórico. Deve existir **uma única estratégia oficial de execução**.

## IA e voz observadas

- Chat de texto usa Gemini com histórico curto.
- Live usa token efêmero para sessão de áudio, WebSocket e PCM.
- Há também fallback/local com SpeechRecognition e TTS.

Risco observado: as server functions de IA analisadas não mostram gate claro de autenticação/permissão antes de consumir a chave do provedor. Deve haver sessão, permissão de módulo, rate limit por tenant e auditoria.

## Riscos prioritários observados

### Alta prioridade

1. **Autenticação do motorista inconsistente**
   - aplicativo atual autentica por telefone + código fixo `1234`;
   - guarda telefone em `localStorage`;
   - server functions recebem telefone e gravam via service role.

   Direção: usar sessão Auth/token de motorista assinado, vincular a `driver_auth_user_id`, rate limit e auditoria de sessão.

2. **Handoff Master → Central não é SSO seguro**
   - tokens são enviados em URL hash;
   - Central pode criar sessão local mesmo se `setSession` falhar;
   - impersonação Base64 sem assinatura.

   Direção: código de uso único e curta duração, validado no backend.

3. **IA sem gate de autorização evidente**
   - risco de uso indevido e custo sem autoria.

### Média prioridade

4. `manual_move_freight_card` é chamado pelo cliente, mas sua definição SQL não foi encontrada nas migrations locais.
5. Guarda por `workflow_version` existe, mas o caminho motorista não incrementa a versão no update observado.
6. Sascar possui runtimes divergentes e endpoint Nitro com autorização fraca em determinado caminho.
7. Usuários Master legados podem existir apenas em `localStorage`, sem Auth real.
8. Policy de storage de documentos de frete aparenta ser ampla demais para `authenticated` em migration restaurada.

### Baixa prioridade

9. Realtime + polling recarrega conjuntos amplos e pode escalar mal.
10. Alguns KPIs do Master são mock/zero mesmo havendo infraestrutura de overview no banco.

## Leitura para o Forge

Este snapshot deve ser tratado como **AS-IS técnico**, não como visão de produto.

Ao comparar com a visão de Lucas, classificar cada regra como:
- `MATCH`: já funciona como desejado;
- `PARTIAL`: existe, mas incompleto;
- `DIFFERENT`: funciona de forma diferente do desejado;
- `BROKEN`: existe, mas há risco ou inconsistência que impede confiança;
- `MISSING`: não existe;
- `UNKNOWN`: não há evidência suficiente.

### Prioridade estratégica

A missão nº 1 definida por Lucas é **integração ponta a ponta**:

`Motorista -> Operação -> Documentos -> Telemetria -> Abastecimento/Despesas -> Financeiro -> DRE/Fluxo/Rentabilidade`

O trabalho do Forge deve priorizar eliminar caminhos paralelos inconsistentes, consolidar a fonte de verdade, fechar segurança/autorização e garantir que cada evento operacional relevante gere o efeito financeiro correto exatamente uma vez.

## Regra de precedência

Quando houver divergência entre fontes:
1. código atual;
2. migrations atuais;
3. documentação AS-IS validada;
4. regras arquiteturais;
5. visão de produto/TO-BE;
6. histórico.

Se fontes do mesmo nível conflitarem, gerar `CONTEXT_CONFLICT` em vez de escolher silenciosamente.
