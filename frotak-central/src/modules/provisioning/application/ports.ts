import type { ValidatedProvisioning } from "@/modules/provisioning/domain/provisioning-request";

/** Contas de acesso (hoje Supabase Auth). */
export interface IdentityGateway {
  emailExists(email: string): Promise<boolean>;
  createOwner(input: { email: string; password: string; fullName: string }): Promise<string>;
  deleteUser(userId: string): Promise<void>;
}

export type ProvisionedTenant = {
  tenantId: string;
  workspaceId: string;
  membershipId: string;
  ownerRoleId: string;
};

/** Cria cliente, workspace, assinatura, papel do dono e modulos numa transacao so. */
export interface TenantProvisioner {
  provision(input: {
    request: ValidatedProvisioning;
    ownerUserId: string;
    actorUserId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<ProvisionedTenant>;
}

export type ProvisioningLogger = (stage: string, details?: Record<string, unknown>) => void;
