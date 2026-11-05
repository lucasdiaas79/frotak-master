import { DomainError } from "@/core/domain/domain-error";

export type PlatformRole = "super_admin" | "operations" | "support" | "read_only";

export const platformRoles: PlatformRole[] = ["super_admin", "operations", "support", "read_only"];

/** Membro da equipe FrotaK autenticado no Master. */
export type PlatformActor = {
  userId: string;
  email: string;
  role: PlatformRole;
};

const operatorRoles: PlatformRole[] = ["super_admin", "operations"];

/** Cadastrar clientes e mudar o que esta liberado exige papel de operacao. */
export function assertCanOperate(actor: PlatformActor) {
  if (!operatorRoles.includes(actor.role)) {
    throw new DomainError(
      "FORBIDDEN",
      "Seu papel no Master permite apenas consulta. Peca a um operador para fazer esta alteracao.",
    );
  }
}

/** O que atinge todos os clientes de uma vez ou mostra dados deles fica só com o administrador. */
export function assertSuperAdmin(actor: PlatformActor) {
  if (actor.role !== "super_admin") {
    throw new DomainError("FORBIDDEN", "Só um administrador do Master pode fazer isso.");
  }
}
