import type { DriverLogin, DriverRecord } from "@/modules/driver-app/domain/driverAccess";

/** Contas de acesso do app motorista (hoje Supabase Auth). */
export interface DriverIdentityProvider {
  resolveUserId(accessToken: string): Promise<string | null>;
  findLogin(login: Pick<DriverLogin, "email" | "phone">): Promise<string | null>;
  createLogin(login: DriverLogin): Promise<string>;
  resetLogin(userId: string, login: DriverLogin): Promise<void>;
}

/** Dados do TMS que o acesso do motorista consulta e grava. */
export interface DriverAccessRepository {
  findDriver(driverId: string): Promise<DriverRecord | null>;
  /** Workspace ativo do tenant em que o usuario e dono, ou null. */
  findOwnedWorkspace(userId: string, tenantId: string): Promise<string | null>;
  hasDriverAppModule(workspaceId: string): Promise<boolean>;
  saveDriverProfile(userId: string, login: DriverLogin): Promise<void>;
  linkDriverLogin(driverId: string, userId: string, phone: string): Promise<void>;
  recordAccessGranted(input: {
    actorUserId: string;
    tenantId: string;
    driverId: string;
    authUserId: string;
  }): Promise<void>;
}

export interface TenantSettingsReader {
  getTenantSettings(tenantId: string): Promise<unknown>;
}
