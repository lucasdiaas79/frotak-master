<!-- FROTAK-AGENTS:START -->

# FrotaK Agents — FrotaK Cliente

Leia .frotak/RESUME.md e .frotak/project.json antes de iniciar.
Carregue somente skills e referências do módulo afetado.
Conhecimento instalado em .frotak/knowledge/. Estado operacional no portal/CLI FrotaK Agents.
Mantenha o controle Jaxx existente quando presente. Não declare revisão independente sem outro executor.
Confirme a revisão Git e as limitações do checkpoint antes de reutilizar uma validação.
<!-- FROTAK-AGENTS:END -->

## Contrato obrigatório de frontend

Toda alteração visual em `central-dias-main` deve carregar a skill
`design-system-guardian` e consultar `.frotak/knowledge/global/visual.md` e
`.frotak/knowledge/legacy/brand/INTERIORS.md` antes de editar código.

- Reutilize primeiro os componentes de `src/components/frotak` e `src/components/ui`.
- Não crie botões, campos, filtros, tabelas, abas, cartões ou modais com estilo local
  quando existir um componente compartilhado equivalente.
- Novos padrões de interface devem ser implementados na camada compartilhada para
  alcançar todos os tenants; nenhuma condição visual pode depender de um tenant.
- Tema e marca podem variar por configuração do tenant, mas geometria, tipografia,
  estados, acessibilidade e comportamento responsivo são únicos.
- Preserve handlers, estado, consultas, permissões, filtros, rotas e callbacks durante
  mudanças exclusivamente visuais.
- Antes de concluir, rode `npm run lint` e `npm run build` e confira desktop e mobile.
- Cores oficiais: operacional `#44AD60`, primário legível `#237B3B`, pigmento da
  marca `#66BB1A`, canvas claro `#EDF1EF`, cartão claro `#FAFCFB`, canvas escuro
  `#080A09` e cartão escuro `#111314`.
- Use Plus Jakarta Sans, cards de 25px sem sombra persistente, botões e campos pill,
  abas segmentadas, tabelas compactas, indicadores grafite e modais de 28px.
