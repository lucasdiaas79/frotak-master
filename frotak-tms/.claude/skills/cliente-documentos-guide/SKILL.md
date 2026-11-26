---
name: cliente-documentos-guide
description: "Planejar, alterar ou revisar documentos especificamente no FrotaK cliente."
---

Trabalhe no módulo documentos do projeto cliente. Consulte o contrato do projeto e knowledge/projects/cliente/documentos.md. Antes de alterar, identifique as entidades, permissões, rotas e fonte real de dados. Registre regras verificadas e dúvidas no documento do módulo. Teste o fluxo solicitado e seus estados de falha. Ao concluir, registre commit, ambiente, evidências, pendências e próxima ação em um checkpoint. Não transfira regras de outros produtos sem decisão explícita.

Inventário de entidades: Documento; veículo/motorista; validade; tipo; arquivo; aprovação; histórico.
Regras a confirmar no código/contrato: Expiração; acesso ao arquivo; versão; exclusão; retenção; dados pessoais.
Fluxo para inspecionar: Adicionar → classificar → validar → acompanhar validade → renovar.
Verificações específicas: Arquivo inválido; download autorizado; expiração em fuso correto; renovação mantém histórico.
O inventário é um roteiro, não aprovação de comportamento ainda não verificado.

## Referências instaladas
- .frotak/knowledge/projects/cliente/documentos.md
