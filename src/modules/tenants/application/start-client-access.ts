import { DomainError } from "@/core/domain/domain-error";
import { assertCanOperate, type PlatformActor } from "@/core/domain/platform-actor";

export type ClientOwner = {
  userId: string;
  email: string;
  clientName: string;
  /** Banco por cliente: onde este cliente mora. */
  slug?: string;
  clientUrl?: string;
};

export type ClientAccessRecord = {
  actor: PlatformActor;
  tenantId: string;
  targetUserId: string;
};

export interface ClientAccessGateway {
  findOwner(tenantId: string): Promise<ClientOwner | null>;
  /** Credencial de uso único, válida só para entrar como o dono do cliente. */
  issueOneTimeLogin(owner: ClientOwner): Promise<string>;
  record(access: ClientAccessRecord): Promise<void>;
}

/**
 * "Login como cliente": a equipe entra com uma credencial de uso único do dono do cliente, e o
 * acesso fica registrado na auditoria. O token do operador nunca sai do Master.
 */
export async function startClientAccess(
  actor: PlatformActor,
  tenantId: string,
  gateway: ClientAccessGateway,
) {
  assertCanOperate(actor);

  const owner = await gateway.findOwner(tenantId);
  if (!owner) {
    throw new DomainError("NOT_FOUND", "Este cliente não tem um administrador ativo para acessar.");
  }

  const tokenHash = await gateway.issueOneTimeLogin(owner);
  // Sem registro na auditoria, a credencial não sai do servidor.
  await gateway.record({ actor, tenantId, targetUserId: owner.userId });

  return { tokenHash, clientName: owner.clientName, clientUrl: owner.clientUrl };
}
