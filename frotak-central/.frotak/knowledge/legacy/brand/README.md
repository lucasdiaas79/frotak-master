# FrotaK — identidade e temas

**Extensão D-012:** após aprovação da paleta, o usuário autorizou a mesma identidade em todas as telas restantes. [INTERIORS.md](INTERIORS.md) define geometria, fonte, componentes e preservação funcional para todos os interiores. A restrição histórica de manter a aparência anterior dos outros módulos está superada; funções e dados continuam preservados.

Atualização autorizada em 27/09/2026 (D-010), recalibrada por feedback do usuário em D-011. Este pacote substitui **cores e marca**, não a composição QorTrade do shell/dashboard nem a estrutura dos outros módulos.

## Fontes

- `brand-board.png`: prancha oficial enviada pelo proprietário.
- `system-light.png`, `system-dark.png`, `system-freight-dark.png`: capturas do sistema principal, usadas somente para identidade cromática. Não copiar seu sidebar, mapa ou organização de cartões.
- `public/brand/frotak-wordmark-black.png`: logomarca original para fundo claro.
- `public/brand/frotak-wordmark-white.png`: logomarca original para fundo escuro.
- `public/brand/frotak-mark.png`: símbolo FTK original para favicon e cabeçalho compacto mobile.

Os quatro arquivos originais vieram de `C:/Users/Samuel Cruz/Desktop/I.V. Frotak/`. Os PNGs de runtime são cópias sem recoloração, recorte, filtros ou reconstrução tipográfica. O texto “View” é um identificador do produto separado da arte oficial.

## Paleta implementada

| Papel | Claro | Escuro |
|---|---|---|
| Verde da logomarca | `#66BB1A` | `#66BB1A` |
| Verde operacional (não confundir com logo) | `#44AD60` | `#44AD60` |
| Canvas | `#EDF1EF` | `#080A09` |
| Superfície | `#FAFCFB` | `#111314` |
| Texto principal | `#151918` | `#E4E6E7` |
| Texto secundário do shell | `#626B67` | `#9B9FA1` |
| Bordas | `#D8DFDB` | `#2B2E2F` |
| Verde de texto/ícones | `#237B3B` | `#44AD60` |
| Botão primário com texto branco | `#237B3B` | `#237B3B` |
| Cartão em destaque | `#E2F1E6` + borda suave | `#0C1410` + borda `#285C37` |

`#66BB1A` foi medido na arte original e fica reservado à logomarca. A correção D-011 separa esse pigmento do **verde operacional `#44AD60`**, aproximado a partir dos controles dos screenshots: amostragem da faixa superior de `system-freight-dark.png` encontrou tons predominantes como `#44AD60`, `#44B061` e `#46B463`. Não se trata de um valor CSS original confirmado. Os fundos predominantes estavam próximos de `#121314`; os tokens reproduzem esse grafite sem banho oliva.

Cards, menus, controles inativos e tipografia dark são neutros. Somente o destaque recebe tonalidade quase preta e borda verde, como nos prints. Não preencher cards inteiros com o verde da marca, nem usar verde-lima em gráficos, pills ou seleção. Gráficos têm barras neutras e um destaque verde translúcido; estados selecionados usam fundo muito discreto. Textos pequenos sobre branco usam verde escurecido. Cores semânticas de risco, aviso, informação e rota permanecem distintas.

## Implementação e comportamento

- `src/brand-theme.css`: fonte única de cores e ponte semântica com os interiores AlignUI. Portais herdam os tokens de `html`.
- `src/qortrade.css`: composição, tipografia, formas, tamanhos e breakpoints, consumindo tokens FrotaK.
- `src/components/theme/`: contexto global, preferência e toaster.
- `src/lib/theme.ts`: resolução de `light`, `dark`, `system`.
- `public/theme-init.js`: aplica a preferência antes da pintura; testes verificam equivalência com a resolução React.
- Perfil → **Aparência → Sistema / Claro / Escuro**. Estado marcado via radio-menu acessível.
- Preferência local em `frotak-view-theme`; acompanha mudanças do sistema quando “Sistema” está selecionado e mudanças de preferência em outra aba. Se o armazenamento estiver bloqueado, a seleção ainda funciona durante a sessão.
- Troca de wordmark automática; símbolo compacto em telas até 480 px. Favicon mantém a arte FTK original.
- Mapa demonstrativo, gráficos, tabelas, formulários, menus, diálogos e notificações recebem o tema; mídia de vídeo não é invertida.

## Restrições

Não migrar organização de páginas nem substituir fontes por causa das capturas do sistema principal. QorTrade segue sendo a referência de composição da home. Não misturar arquivos de referência nesta pasta com `qortrade/images`. Backend, câmeras e autenticação continuam fora deste marco. Testes visuais por amostragem não equivalem a auditoria completa de acessibilidade ou validação de todas as funções de produção.
