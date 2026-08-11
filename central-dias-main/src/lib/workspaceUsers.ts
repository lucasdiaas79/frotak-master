import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type WorkspaceUserAccess = {
  isOwner: boolean;
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
  createdAt: string;
};

export type CreateWorkspaceUserInput = {
  accessToken: string;
  name: string;
  email: string;
  phone: string;
  sector: string;
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
  workspaces:
    | {
        id: string;
        tenant_id: string;
        name: string;
        status: string;
        tenants:
          | {
              id: string;
              legal_name: string;
              trade_name: string | null;
              status: string;
            }
          | Array<{
              id: string;
              legal_name: string;
              trade_name: string | null;
              status: string;
            }>
          | null;
      }
    | Array<{
        id: string;
        tenant_id: string;
        name: string;
        status: string;
        tenants:
          | {
              id: string;
              legal_name: string;
              trade_name: string | null;
              status: string;
            }
          | Array<{
              id: string;
              legal_name: string;
              trade_name: string | null;
              status: string;
            }>
          | null;
      }>
    | null;
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
};

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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/unauthorized|owner|forbidden|not allowed/i.test(message)) {
    return "Voce nao tem permissao para gerenciar usuarios.";
  }
  if (/already exists|already registered|email/i.test(message)) {
    return "Este e-mail ja esta cadastrado.";
  }
  if (/password/i.test(message)) {
    return "A senha temporaria nao atende as regras atuais.";
  }
  if (/config|environment/i.test(message)) {
    return "Configuracao do servidor indisponivel.";
  }
  return "Nao foi possivel concluir a operacao.";
}

async function findAuthUserByEmail(supabase: ReturnType<typeof getSupabaseAdmin>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
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

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) throw new Error("unauthorized");

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select(
      "id, workspace_id, user_id, status, is_owner, created_at, workspaces(id, tenant_id, name, status, tenants(id, legal_name, trade_name, status))",
    )
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (membershipError) throw membershipError;
  const membership = (memberships?.[0] ?? null) as WorkspaceMembershipRow | null;
  const workspace = firstRelation(membership?.workspaces);
  const tenant = firstRelation(workspace?.tenants);

  if (
    !membership ||
    !workspace ||
    !tenant ||
    workspace.status !== "active" ||
    !["active", "trial"].includes(tenant.status)
  ) {
    throw new Error("unauthorized");
  }

  return {
    actorUserId: authData.user.id,
    membershipId: membership.id,
    workspaceId: membership.workspace_id,
    tenantId: workspace.tenant_id,
    workspaceName: workspace.name,
    tenantName: tenant.trade_name || tenant.legal_name || workspace.name,
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

export const getWorkspaceUserAccess = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    try {
      const supabase = getSupabaseAdmin();
      const context = await resolveWorkspaceContext(supabase, data.accessToken);
      return {
        isOwner: context.isOwner,
        workspaceName: context.workspaceName,
        tenantName: context.tenantName,
      } satisfies WorkspaceUserAccess;
    } catch {
      return {
        isOwner: false,
        workspaceName: "",
        tenantName: "",
      } satisfies WorkspaceUserAccess;
    }
  });

export const listWorkspaceUsers = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    try {
      const supabase = getSupabaseAdmin();
      const context = await requireOwnerContext(supabase, data.accessToken);
      const { data: rows, error } = await supabase
        .from("workspace_memberships")
        .select("id, user_id, status, is_owner, created_at")
        .eq("workspace_id", context.workspaceId)
        .neq("status", "revoked")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const membershipRows = (rows ?? []) as MemberListRow[];
      const profileIds = [...new Set(membershipRows.map((row) => row.user_id).filter(Boolean))];
      const profileById = new Map<string, ProfileListRow>();

      if (profileIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, sector, active")
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        for (const profile of (profileRows ?? []) as ProfileListRow[]) {
          profileById.set(profile.id, profile);
        }
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
          createdAt: row.created_at,
        } satisfies WorkspaceUser;
      });
    } catch (error) {
      throw new Error(publicError(error));
    }
  });

export const createWorkspaceUser = createServerFn({ method: "POST" })
  .validator((input: CreateWorkspaceUserInput) => input)
  .handler(async ({ data }) => {
    const supabase = getSupabaseAdmin();
    let createdUserId: string | undefined;
    let membershipId: string | undefined;

    try {
      const context = await requireOwnerContext(supabase, data.accessToken);
      const name = normalizeText(data.name);
      const email = normalizeEmail(data.email);
      const phone = normalizeText(data.phone);
      const sector = normalizeText(data.sector);
      const temporaryPassword = normalizeText(data.temporaryPassword);

      if (!name) throw new Error("name is required");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("email is invalid");
      }
      if (!sector) throw new Error("sector is required");
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
        throw createAuthError ?? new Error("auth user was not created");
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
      if (profileError) throw profileError;

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
        throw membershipError ?? new Error("membership was not created");
      }

      membershipId = membership.id;

      const { data: roles, error: rolesError } = await supabase
        .from("workspace_roles")
        .select("id, code")
        .eq("workspace_id", context.workspaceId)
        .eq("active", true)
        .in("code", ["DISPATCHER", "VIEWER", "MANAGER", "ADMIN"]);
      if (rolesError) throw rolesError;

      const roleRows = (roles ?? []) as WorkspaceRoleRow[];
      const role =
        roleRows.find((item) => item.code === "DISPATCHER") ??
        roleRows.find((item) => item.code === "MANAGER") ??
        roleRows.find((item) => item.code === "VIEWER") ??
        roleRows.find((item) => item.code === "ADMIN");

      if (role) {
        const { error: roleError } = await supabase.from("membership_roles").insert({
          membership_id: membershipId,
          role_id: role.id,
          workspace_id: context.workspaceId,
        });
        if (roleError) throw roleError;
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
          roleCode: role?.code ?? null,
        },
        metadata: { source: "client.workspace_users" },
      });
      if (auditError) {
        console.warn("workspace member audit failed", auditError.message);
      }

      return {
        name,
        email,
        phone,
        sector,
        status: "active",
        isOwner: false,
        createdAt: new Date().toISOString(),
      } satisfies WorkspaceUser;
    } catch (error) {
      if (membershipId) {
        await supabase.from("membership_roles").delete().eq("membership_id", membershipId);
        await supabase.from("workspace_memberships").delete().eq("id", membershipId);
      }
      if (createdUserId) {
        const cleanup = await supabase.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) {
          console.error("workspace user cleanup failed", cleanup.error.message);
        }
      }

      throw new Error(publicError(error));
    }
  });
