import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWorkspaceEntitlements, isModuleEnabled } from "@/lib/entitlements";
import type {
  DriverAccessRepository,
  DriverIdentityProvider,
} from "@/modules/driver-app/application/ports";
import type { DriverLogin, DriverRecord } from "@/modules/driver-app/domain/driverAccess";

type DriverRow = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  auth_user_id: string | null;
};

type WorkspaceRelation = { id: string; tenant_id: string; status: string };
type OwnerMembershipRow = {
  workspace_id: string;
  workspaces: WorkspaceRelation | WorkspaceRelation[] | null;
};

const USERS_PAGE_SIZE = 1000;
const USERS_MAX_PAGES = 10;

function driverMetadata(login: DriverLogin) {
  return { full_name: login.fullName, app_role: "driver", phone: login.phone };
}

/** Adaptador Supabase (service role) para o acesso do motorista: Auth + tabelas do TMS. */
export class SupabaseDriverAccess implements DriverIdentityProvider, DriverAccessRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async resolveUserId(accessToken: string) {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      if (error?.message) throw new Error(error.message);
      return null;
    }
    return data.user.id;
  }

  async findLogin(login: Pick<DriverLogin, "email" | "phone">) {
    for (let page = 1; page <= USERS_MAX_PAGES; page += 1) {
      const { data, error } = await this.supabase.auth.admin.listUsers({
        page,
        perPage: USERS_PAGE_SIZE,
      });
      if (error) throw error;
      const found = data.users.find(
        (user) => user.phone === login.phone || user.email === login.email,
      );
      if (found) return found.id;
      if (data.users.length < USERS_PAGE_SIZE) return null;
    }
    return null;
  }

  async createLogin(login: DriverLogin) {
    const { data, error } = await this.supabase.auth.admin.createUser({
      email: login.email,
      password: login.password,
      email_confirm: true,
      user_metadata: driverMetadata(login),
    });
    if (error) throw error;
    return data.user.id;
  }

  async resetLogin(userId: string, login: DriverLogin) {
    const { error } = await this.supabase.auth.admin.updateUserById(userId, {
      email: login.email,
      password: login.password,
      email_confirm: true,
      user_metadata: driverMetadata(login),
    });
    if (error) throw error;
  }

  async findDriver(driverId: string): Promise<DriverRecord | null> {
    const { data, error } = await this.supabase
      .from("drivers")
      .select("id, tenant_id, name, phone, auth_user_id")
      .eq("id", driverId)
      .maybeSingle<DriverRow>();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      phone: data.phone,
      authUserId: data.auth_user_id,
    };
  }

  async findOwnedWorkspace(userId: string, tenantId: string) {
    const { data, error } = await this.supabase
      .from("workspace_memberships")
      .select("workspace_id, workspaces!inner(id, tenant_id, status)")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("is_owner", true);
    if (error) throw error;

    const owned = ((data ?? []) as OwnerMembershipRow[]).find((membership) => {
      const workspace = Array.isArray(membership.workspaces)
        ? membership.workspaces[0]
        : membership.workspaces;
      return workspace?.tenant_id === tenantId && workspace?.status === "active";
    });
    return owned?.workspace_id ?? null;
  }

  async hasDriverAppModule(workspaceId: string) {
    return isModuleEnabled(
      await fetchWorkspaceEntitlements(this.supabase, workspaceId),
      "driver_app",
    );
  }

  async saveDriverProfile(userId: string, login: DriverLogin) {
    const { error } = await this.supabase.from("profiles").upsert({
      id: userId,
      full_name: login.fullName,
      phone: login.phone,
      email: login.email,
      active: true,
      must_change_password: true,
    });
    if (error) throw error;
  }

  async linkDriverLogin(driverId: string, userId: string, phone: string) {
    const { error } = await this.supabase
      .from("drivers")
      .update({ auth_user_id: userId, phone })
      .eq("id", driverId);
    if (error) throw error;
  }

  async recordAccessGranted(input: {
    actorUserId: string;
    tenantId: string;
    driverId: string;
    authUserId: string;
  }) {
    const { error } = await this.supabase.from("audit_logs").insert({
      action: "driver_app_access_created",
      actor_user_id: input.actorUserId,
      tenant_id: input.tenantId,
      entity_type: "drivers",
      entity_id: input.driverId,
      metadata: { driverId: input.driverId, authUserId: input.authUserId },
    });
    // Auditoria nao bloqueia a liberacao do acesso; fica registrada no log do servidor.
    if (error) {
      console.error("[driverAppUsers] audit log failed", {
        code: error.code,
        message: error.message,
      });
    }
  }
}
