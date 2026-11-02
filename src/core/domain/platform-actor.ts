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
