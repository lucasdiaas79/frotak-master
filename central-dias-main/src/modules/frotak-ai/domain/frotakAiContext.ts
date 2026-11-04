// Quem esta conversando com a IA e em qual empresa.

export type FrotakAiContext = {
  accessToken: string;
  userId: string;
  membershipId: string;
  workspaceId: string;
  tenantId: string;
  workspaceName: string;
  tenantName: string;
  isOwner: boolean;
  permissions: string[];
};

export function canReadFinancial(context: FrotakAiContext) {
  return context.isOwner;
}

export function createFrotakAiContextSummary(context: FrotakAiContext) {
  return [
    `Tenant atual: ${context.tenantName} (${context.tenantId}).`,
    `Workspace atual: ${context.workspaceName} (${context.workspaceId}).`,
    context.isOwner
      ? "Perfil autenticado: owner; pode consultar dados financeiros."
      : "Perfil autenticado: membro; nao pode receber nenhum dado financeiro.",
    "Toda pergunta operacional ou financeira do usuario se refere a este tenant/workspace, salvo pedido explicitamente geral.",
    "Nunca consulte, revele, compare ou misture dados de outro tenant/workspace.",
    "As ferramentas aplicam filtros de tenant/workspace e permissoes no servidor. Consultas so leem; acoes so gravam depois que o usuario confirma na tela.",
  ].join(" ");
}
