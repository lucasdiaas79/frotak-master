import type { FinancialAccess } from "@/modules/financial/domain/types";

/** O dono do workspace pode tudo; os demais, conforme as permissoes do papel. */
export function hasFinancialPermission(access: FinancialAccess | null, permission: string) {
  return Boolean(access?.isOwner || access?.permissions.includes(permission));
}
