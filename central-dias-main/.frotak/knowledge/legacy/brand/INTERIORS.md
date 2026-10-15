# Identidade aprovada — todas as telas

Decisão D-012, 27/09/2026. Autorização: aplicar o visual aprovado nas telas restantes sem alterar nenhuma função existente.

## Autoridade e implementação

- Cores: `src/brand-theme.css`, sem nova paleta. D-011 continua válido.
- Shell/dashboard: `src/qortrade.css`; composição aprovada preservada.
- Interiores: `src/product-ui.css`, com hooks `fv-*` nos componentes próprios e `q-workspace` no conteúdo.
- Fonte: Plus Jakarta Sans local; mono apenas para identificação técnica/mídia.
- Primitivos: mesmos AlignUI/Radix; nenhuma dependência adicionada.

## Padrão

| Elemento | Regra |
|---|---|
| Título | 32px/500, tracking -1.3px; 26px em telas estreitas; sem truncar o título |
| Subtítulo | 12px, linha 1.6, cor secundária |
| Cards | Raio 25px, borda sutil, sem sombra persistente; fundo neutro |
| Seções | Cabeçalho 14px/500; espaçamento interno 20–22px |
| Botões | Pill; 38px desktop, 44px mobile; ícones compactos 36px desktop |
| Campos | Pill de 40px; textarea/múltipla seleção com raio 16–18px |
| Abas | Segmentadas e roláveis, sem remover opções |
| Tabela | 12px, cabeçalho 10px/500, números tabulares, separadores suaves, overflow interno |
| Indicadores | Valores 23–32px/500; ícone circular; card grafite, não verde |
| Modal/drawer | Raio 28px, superfície elevada neutra; foco/Escape/scroll preservados |
| Mapa/vídeo | Moldura 22px; controles próprios preservados; significado das cores de mídia mantido |
| Seleção | Borda e tint restritos, nunca preenchimento lima/oliva amplo |

## Preservação funcional

### Monitoramento em tempo real — ajuste responsivo

O shell mantém a topbar sticky no topo com fundo opaco do tema, preservando sua altura natural nos breakpoints. O mapa desta tela preenche a região disponível do painel. O resumo selecionado usa largura fluida e ações auto-fit; até 620px de largura interna do canvas passa para o fluxo abaixo do mapa. O breakpoint considera o container, não apenas a viewport. Outros mapas e todos os callbacks existentes permanecem intactos.

Não alterar handlers, estado, dados, nomes de campos, filtros, dependências de habilitação, abas, seleção, paginação, trajetos, mídia, rotas ou callbacks sob pretexto visual. O teste `src/lib/visual-migration.test.ts` compara o AST com a base capturada antes da migração, ignorando somente `className`. Uma mudança funcional futura deve revisar essa base explicitamente, não apenas regenerá-la para passar testes.

Amostras e matriz: `docs/qa/visual-migration.md`. A tela continua demonstrativa: o novo visual não representa integração real ou persistência.
