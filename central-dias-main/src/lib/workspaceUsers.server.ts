import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";

export type WorkspaceUserAccess = {
  isOwner: boolean;
  userId: string;
  workspaceId: string;
  tenantId: string;
  workspaceName: string;
  tenantName: string;
};

export type WorkspaceUser = {
  name: string;
  email: string;
  phone: string;
  sector: string;
  status: "active" | "invited" | "suspended" | "revoked";
  isOwner: boolean;
  roles: WorkspaceRole[];
  createdAt: string;
};

export type WorkspaceRole = {
  code: string;
  name: string;
};

export type CreateWorkspaceUserInput = {
  accessToken: string;
  name: string;
  email: string;
  phone: string;
  sector: string;
  roleCode: string;
  temporaryPassword: string;
};

type WorkspaceContext = {
  actorUserId: string;
  membershipId: string;
  workspaceId: string;
  tenantId: string;
  workspaceName: string;
  tenantName: string;
  isOwner: boolean;
};

type WorkspaceMembershipRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
};

type TenantRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  status: string;
};

type MemberListRow = {
  id: string;
  user_id: string;
  status: WorkspaceUser["status"];
  is_owner: boolean;
  created_at: string;
};

type ProfileListRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  sector: string | null;
  active: boolean | null;
};

type WorkspaceRoleRow = {
  id: string;
  code: string;
  name: string;
};

type MembershipRoleRow = {
  membership_id: string;
  role_id: string;
};

function getServerSupabaseProjectRef() {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL") || "";
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;
}

function getServerSupabaseDiagnostics() {
  return {
    serverSupabaseProjectRef: getServerSupabaseProjectRef(),
    hasServiceRole: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
  };
}

function logWorkspaceStage(stage: string, details?: Record<string, unknown>) {
  console.log(`[WORKSPACE USERS] ${stage}`, details ?? {});
}

function logSupabaseError(
  stage: string,
  error: { message?: string; code?: string; details?: string },
) {
  console.error(`[WORKSPACE USERS] ${stage}`, {
    message: error.message,
    code: error.code,
    details: error.details,
  });
}

function throwStageError(stage: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`${stage}: ${message || "erro desconhecido"}`);
}

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getSupabaseAdmin() {
  return createClient(
    readEnv("SUPABASE_URL") || requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stage = message.match(/^([a-zA-Z0-9_.]+):/)?.[1];
  const prefix = stage ? `Falha em ${stage}. ` : "";
  if (/unauthorized|owner|forbidden|not allowed/i.test(message)) {
    return `${prefix}Voce nao tem permissao para gerenciar usuarios.`;
  }
  if (/already exists|already registered|email/i.test(message)) {
    return `${prefix}Este e-mail ja esta cadastrado.`;
  }
  if (/password/i.test(message)) {
    return `${prefix}A senha temporaria nao atende as regras atuais.`;
  }
  if (/config|environment/i.test(message)) {
    return `${prefix}Configuracao do servidor indisponivel.`;
  }
  return `${prefix}Nao foi possivel concluir a operacao.`;
}

async function findAuthUserByEmail(supabase: ReturnType<typeof getSupabaseAdmin>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      logSupabaseError("auth.admin.listUsers", error);
      throwStageError("auth.admin.listUsers", error);
    }
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function resolveWorkspaceContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  accessToken: string,
): Promise<WorkspaceContext> {
  if (!normalizeText(accessToken)) throw new Error("unauthorized");

  logWorkspaceStage("server project", {
    ref: getServerSupabaseProjectRef() ?? "ausente",
  });
  logWorkspaceStage("access token received", { value: "YES" });
  logWorkspaceStage("auth.getUser: START");
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError) {
    logSupabaseError("auth.getUser: ERROR", authError);
    throw new Error(`WORKSPACE_USERS_AUTH_GET_USER: ${authError.message}`);
  }
  logWorkspaceStage("auth.getUser: PASS");
  if (!authData.user) throw new Error("auth.getUser: usuario ausente");
  logWorkspaceStage("user id", { value: "presente" });

  logWorkspaceStage("membership query: START");
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("id, workspace_id, user_id, status, is_owner, created_at")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (membershipError) {
    logSupabaseError("membership query: ERROR", membershipError);
    throw new Error(`WORKSPACE_USERS_MEMBERSHIP_QUERY: ${membershipError.message}`);
  }
  logWorkspaceStage("membership query: PASS", {
    found: Boolean(memberships?.[0]),
  });
  const membership = (memberships?.[0] ?? null) as WorkspaceMembershipRow | null;
  if (!membership) throw new Error("workspace_memberships: membership ativa ausente");

  logWorkspaceStage("workspace: START");
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, tenant_id, name, status")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (workspaceError) {
    logSupabaseError("workspace: ERROR", workspaceError);
    throw new Error(`WORKSPACE_USERS_WORKSPACE_QUERY: ${workspaceError.message}`);
  }
  logWorkspaceStage("workspace: PASS", { found: Boolean(workspace) });
  if (!workspace) throw new Error("workspaces: workspace ausente");

  const workspaceRow = workspace as WorkspaceRow;
  if (workspaceRow.status !== "active") throw new Error("workspaces: workspace inativo");

  logWorkspaceStage("tenant: START");
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, legal_name, trade_name, status")
    .eq("id", workspaceRow.tenant_id)
    .maybeSingle();

  if (tenantError) {
    logSupabaseError("tenant: ERROR", tenantError);
    throw new Error(`WORKSPACE_USERS_TENANT_QUERY: ${tenantError.message}`);
  }
  logWorkspaceStage("tenant: PASS", { found: Boolean(tenant) });
  if (!tenant) throw new Error("tenants: tenant ausente");

  const tenantRow = tenant as TenantRow;
  if (!["active", "trial"].includes(tenantRow.status)) throw new Error("tenants: tenant inativo");

  return {
    actorUserId: authData.user.id,
    membershipId: membership.id,
    workspaceId: membership.workspace_id,
    tenantId: workspaceRow.tenant_id,
    workspaceName: workspaceRow.name,
    tenantName: tenantRow.trade_name || tenantRow.legal_name || workspaceRow.name,
    isOwner: membership.is_owner === true,
  };
}

async function requireOwnerContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  accessToken: string,
) {
  const context = await resolveWorkspaceContext(supabase, accessToken);
  if (!context.isOwner) throw new Error("forbidden: workspace owner required");
  return context;
}

export function getWorkspaceUsersServerDiagnosticsSnapshot() {
  return getServerSupabaseDiagnostics();
}

export async function getWorkspaceUserAccessData(accessToken: string) {
  try {
    const supabase = getSupabaseAdmin();
    const context = await resolveWorkspaceContext(supabase, accessToken);
    return {
      isOwner: context.isOwner,
      userId: context.actorUserId,
      workspaceId: context.workspaceId,
      tenantId: context.tenantId,
      workspaceName: context.workspaceName,
      tenantName: context.tenantName,
    } satisfies WorkspaceUserAccess;
  } catch (error) {
    console.error("[workspaceUsers] getWorkspaceUserAccessData failed", error);
    throw new Error(publicError(error));
  }
}

export async function listWorkspaceUsersData(accessToken: string) {
  try {
    const supabase = getSupabaseAdmin();
    const context = await requireOwnerContext(supabase, accessToken);
      logWorkspaceStage("listWorkspaceUsers membership lookup: PASS", {
        workspaceId: "presente",
        isOwner: context.isOwner,
      });
      logWorkspaceStage("listWorkspaceUsers workspace_memberships list: START");
      const { data: rows, error } = await supabase
        .from("workspace_memberships")
        .select("id, user_id, status, is_owner, created_at")
        .eq("workspace_id", context.workspaceId)
        .neq("status", "revoked")
        .order("created_at", { ascending: false });

      if (error) {
        logSupabaseError("listWorkspaceUsers workspace_memberships list: ERROR", error);
        throw new Error(`WORKSPACE_USERS_LIST_MEMBERSHIPS: ${error.message}`);
      }
      logWorkspaceStage("listWorkspaceUsers workspace_memberships list: PASS", {
        count: rows?.length ?? 0,
      });

      const membershipRows = (rows ?? []) as MemberListRow[];
      const profileIds = [...new Set(membershipRows.map((row) => row.user_id).filter(Boolean))];
      const membershipIds = [...new Set(membershipRows.map((row) => row.id).filter(Boolean))];
      const profileById = new Map<string, ProfileListRow>();
      const roleById = new Map<string, WorkspaceRoleRow>();
      const rolesByMembershipId = new Map<string, WorkspaceRole[]>();

      if (profileIds.length > 0) {
        logWorkspaceStage("listWorkspaceUsers profiles lookup: START", {
          count: profileIds.length,
        });
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, sector, active")
          .in("id", profileIds);

        if (profilesError) {
          logSupabaseError("listWorkspaceUsers profiles lookup: ERROR", profilesError);
          throw new Error(`WORKSPACE_USERS_PROFILES_LOOKUP: ${profilesError.message}`);
        }
        logWorkspaceStage("listWorkspaceUsers profiles lookup: PASS", {
          count: profileRows?.length ?? 0,
        });

        for (const profile of (profileRows ?? []) as ProfileListRow[]) {
          profileById.set(profile.id, profile);
        }
      } else {
        logWorkspaceStage("listWorkspaceUsers profiles lookup: PASS", { count: 0 });
      }

      if (membershipIds.length > 0) {
        logWorkspaceStage("listWorkspaceUsers membership_roles lookup: START", {
          count: membershipIds.length,
        });
        const { data: membershipRoleRows, error: membershipRolesError } = await supabase
          .from("membership_roles")
          .select("membership_id, role_id")
          .eq("workspace_id", context.workspaceId)
          .in("membership_id", membershipIds);

        if (membershipRolesError) {
          logSupabaseError("listWorkspaceUsers membership_roles lookup: ERROR", membershipRolesError);
          throw new Error(`WORKSPACE_USERS_MEMBERSHIP_ROLES_LOOKUP: ${membershipRolesError.message}`);
        }
        logWorkspaceStage("listWorkspaceUsers membership_roles lookup: PASS", {
          count: membershipRoleRows?.length ?? 0,
        });

        const membershipRoles = (membershipRoleRows ?? []) as MembershipRoleRow[];
        const roleIds = [...new Set(membershipRoles.map((row) => row.role_id).filter(Boolean))];

        if (roleIds.length > 0) {
          logWorkspaceStage("listWorkspaceUsers roles lookup: START", {
            count: roleIds.length,
          });
          const { data: roleRows, error: rolesError } = await supabase
            .from("workspace_roles")
            .select("id, code, name")
            .eq("workspace_id", context.workspaceId)
            .in("id", roleIds);

          if (rolesError) {
            logSupabaseError("listWorkspaceUsers roles lookup: ERROR", rolesError);
            throw new Error(`WORKSPACE_USERS_ROLES_LOOKUP: ${rolesError.message}`);
          }
          logWorkspaceStage("listWorkspaceUsers roles lookup: PASS", {
            count: roleRows?.length ?? 0,
          });

          for (const role of (roleRows ?? []) as WorkspaceRoleRow[]) {
            roleById.set(role.id, role);
          }
        } else {
          logWorkspaceStage("listWorkspaceUsers roles lookup: PASS", { count: 0 });
        }

        for (const membershipRole of membershipRoles) {
          const role = roleById.get(membershipRole.role_id);
          if (!role) continue;

          const current = rolesByMembershipId.get(membershipRole.membership_id) ?? [];
          current.push({ code: role.code, name: role.name });
          rolesByMembershipId.set(membershipRole.membership_id, current);
        }
      } else {
        logWorkspaceStage("listWorkspaceUsers membership_roles lookup: PASS", { count: 0 });
        logWorkspaceStage("listWorkspaceUsers roles lookup: PASS", { count: 0 });
      }

    return membershipRows.map((row) => {
        const profile = profileById.get(row.user_id);
        return {
          name: profile?.full_name || profile?.email || "Usuario",
          email: profile?.email || "",
          phone: profile?.phone || "",
          sector: profile?.sector || "",
          status: profile?.active === false ? "suspended" : row.status,
          isOwner: row.is_owner,
          roles: rolesByMembershipId.get(row.id) ?? [],
          createdAt: row.created_at,
        } satisfies WorkspaceUser;
      });
  } catch (error) {
    console.error("[workspaceUsers] listWorkspaceUsersData failed", error);
    throw new Error(publicError(error));
  }
}

export async function listWorkspaceRolesData(accessToken: string) {
  try {
    const supabase = getSupabaseAdmin();
    const context = await requireOwnerContext(supabase, accessToken);

      const { data: roles, error } = await supabase
        .from("workspace_roles")
        .select("id, code, name")
        .eq("workspace_id", context.workspaceId)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) {
        logSupabaseError("workspace_roles", error);
        throwStageError("workspace_roles", error);
      }

    return ((roles ?? []) as WorkspaceRoleRow[]).map((role) => ({
      code: role.code,
      name: role.name,
    })) satisfies WorkspaceRole[];
  } catch (error) {
    console.error("[workspaceUsers] listWorkspaceRolesData failed", error);
    throw new Error(publicError(error));
  }
}

export async function createWorkspaceUserData(data: CreateWorkspaceUserInput) {
    const supabase = getSupabaseAdmin();
    let createdUserId: string | undefined;
    let membershipId: string | undefined;

    try {
      const context = await requireOwnerContext(supabase, data.accessToken);
      const name = normalizeText(data.name);
      const email = normalizeEmail(data.email);
      const phone = normalizeText(data.phone);
      const sector = normalizeText(data.sector);
      const roleCode = normalizeText(data.roleCode).toUpperCase();
      const temporaryPassword = normalizeText(data.temporaryPassword);

      if (!name) throw new Error("name is required");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("email is invalid");
      }
      if (!sector) throw new Error("sector is required");
      if (!roleCode) throw new Error("role is required");
      if (temporaryPassword.length < 8) throw new Error("password is invalid");

      const existingUser = await findAuthUserByEmail(supabase, email);
      if (existingUser) throw new Error("email already exists");

      const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          phone,
          sector,
          must_change_password: true,
        },
      });

      if (createAuthError || !authData.user) {
        if (createAuthError) {
          logSupabaseError("auth.admin.createUser", createAuthError);
        }
        throw createAuthError
          ? new Error(`auth.admin.createUser: ${createAuthError.message}`)
          : new Error("auth.admin.createUser: auth user was not created");
      }

      createdUserId = authData.user.id;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: createdUserId,
        full_name: name,
        email,
        phone: phone || null,
        sector,
        active: true,
        must_change_password: true,
      });
      if (profileError) {
        logSupabaseError("profiles", profileError);
        throwStageError("profiles", profileError);
      }

      const { data: membership, error: membershipError } = await supabase
        .from("workspace_memberships")
        .insert({
          workspace_id: context.workspaceId,
          user_id: createdUserId,
          status: "active",
          is_owner: false,
          invited_by: context.actorUserId,
          joined_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (membershipError || !membership) {
        if (membershipError) {
          logSupabaseError("workspace_memberships", membershipError);
        }
        throw membershipError
          ? new Error(`workspace_memberships: ${membershipError.message}`)
          : new Error("workspace_memberships: membership was not created");
      }

      membershipId = membership.id;

      const { data: role, error: rolesError } = await supabase
        .from("workspace_roles")
        .select("id, code")
        .eq("workspace_id", context.workspaceId)
        .eq("active", true)
        .eq("code", roleCode)
        .maybeSingle();
      if (rolesError) {
        logSupabaseError("workspace_roles", rolesError);
        throwStageError("workspace_roles", rolesError);
      }

      const workspaceRole = role as Pick<WorkspaceRoleRow, "id" | "code"> | null;
      if (!workspaceRole) throw new Error("workspace_roles: role ausente no workspace");

      const { error: roleError } = await supabase.from("membership_roles").insert({
        membership_id: membershipId,
        role_id: workspaceRole.id,
        workspace_id: context.workspaceId,
      });
      if (roleError) {
        logSupabaseError("membership_roles", roleError);
        throwStageError("membership_roles", roleError);
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        actor_user_id: context.actorUserId,
        tenant_id: context.tenantId,
        workspace_id: context.workspaceId,
        action: "workspace.member.created",
        entity_type: "workspace_membership",
        entity_id: membershipId,
        new_data: {
          userId: createdUserId,
          email,
          phone,
          sector,
          isOwner: false,
          roleCode: workspaceRole.code,
        },
        metadata: { source: "client.workspace_users" },
      });
      if (auditError) {
        logSupabaseError("audit_logs", auditError);
      }

      return {
        name,
        email,
        phone,
        sector,
        status: "active",
        isOwner: false,
        roles: [{ code: workspaceRole.code, name: workspaceRole.code }],
        createdAt: new Date().toISOString(),
      } satisfies WorkspaceUser;
    } catch (error) {
      if (membershipId) {
        const membershipRolesCleanup = await supabase
          .from("membership_roles")
          .delete()
          .eq("membership_id", membershipId);
        if (membershipRolesCleanup.error) {
          logSupabaseError("membership_roles.cleanup", membershipRolesCleanup.error);
        }

        const membershipCleanup = await supabase
          .from("workspace_memberships")
          .delete()
          .eq("id", membershipId);
        if (membershipCleanup.error) {
          logSupabaseError("workspace_memberships.cleanup", membershipCleanup.error);
        }
      }
      if (createdUserId) {
        const cleanup = await supabase.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) {
          logSupabaseError("auth.admin.deleteUser", cleanup.error);
        }
      }

      throw new Error(publicError(error));
    }
}
