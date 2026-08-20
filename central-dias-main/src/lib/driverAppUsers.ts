import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type CreateDriverAppAccessInput = {
  accessToken: string;
  driverId: string;
  phone: string;
};

const DRIVER_TEMPORARY_PASSWORD = "Frotak1234!";

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

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

function driverLoginEmail(phone: string) {
  return `${phone.replace(/\D/g, "")}@driver.frotak.local`;
}

async function assertOwnerCanManageDriver(input: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  accessToken: string;
  driverId: string;
}) {
  const { data: userData, error: userError } = await input.supabase.auth.getUser(input.accessToken);
  if (userError || !userData.user) {
    throw new Error(userError?.message || "Usuario nao autenticado.");
  }

  const { data: driver, error: driverError } = await input.supabase
    .from("drivers")
    .select("id, tenant_id, name, phone, auth_user_id")
    .eq("id", input.driverId)
    .maybeSingle();
  if (driverError) throw driverError;
  if (!driver) throw new Error("Motorista nao encontrado.");

  const { data: memberships, error: membershipError } = await input.supabase
    .from("workspace_memberships")
    .select("id, workspace_id, is_owner, status, workspaces!inner(id, tenant_id, status)")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .eq("is_owner", true);
  if (membershipError) throw membershipError;

  const allowed = (memberships ?? []).some((membership) => {
    const workspace = Array.isArray(membership.workspaces)
      ? membership.workspaces[0]
      : membership.workspaces;
    return workspace?.tenant_id === driver.tenant_id && workspace?.status === "active";
  });

  if (!allowed) {
    throw new Error("Apenas o owner do tenant pode criar acesso de motorista.");
  }

  return {
    ...(driver as {
      id: string;
      tenant_id: string;
      name: string;
      phone: string | null;
      auth_user_id: string | null;
    }),
    actorUserId: userData.user.id,
  };
}

async function findAuthUserByPhone(supabase: ReturnType<typeof getSupabaseAdmin>, phone: string) {
  const email = driverLoginEmail(phone);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.phone === phone || user.email === email);
    if (found || data.users.length < 1000) return found ?? null;
  }
  return null;
}

export const createDriverAppAccess = createServerFn({ method: "POST" })
  .inputValidator((input: CreateDriverAppAccessInput) => input)
  .handler(async ({ data }) => {
    const supabase = getSupabaseAdmin();
    const driver = await assertOwnerCanManageDriver({
      supabase,
      accessToken: data.accessToken,
      driverId: data.driverId,
    });

    const phone = normalizePhone(data.phone || driver.phone || "");
    if (phone.length < 12) throw new Error("Telefone invalido para login do motorista.");
    const email = driverLoginEmail(phone);

    let authUserId = driver.auth_user_id;
    const existing = authUserId ? null : await findAuthUserByPhone(supabase, phone);

    if (authUserId || existing) {
      authUserId = authUserId || existing!.id;
      const { error } = await supabase.auth.admin.updateUserById(authUserId, {
        email,
        password: DRIVER_TEMPORARY_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: driver.name, app_role: "driver", phone },
      });
      if (error) throw error;
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        password: DRIVER_TEMPORARY_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: driver.name, app_role: "driver", phone },
      });
      if (error) throw error;
      authUserId = created.user.id;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: authUserId,
      full_name: driver.name,
      phone,
      email,
      active: true,
      must_change_password: true,
    });
    if (profileError) throw profileError;

    const { error: driverError } = await supabase
      .from("drivers")
      .update({ auth_user_id: authUserId, phone })
      .eq("id", driver.id);
    if (driverError) throw driverError;

    const { error: auditError } = await supabase.from("audit_logs").insert({
      action: "driver_app_access_created",
      actor_user_id: driver.actorUserId,
      tenant_id: driver.tenant_id,
      entity_type: "drivers",
      entity_id: driver.id,
      metadata: { driverId: driver.id, authUserId },
    });
    if (auditError) {
      console.error("[driverAppUsers] audit log failed", {
        code: auditError.code,
        message: auditError.message,
      });
    }

    return { driverId: driver.id, authUserId };
  });
