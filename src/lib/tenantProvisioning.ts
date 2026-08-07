import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabaseAdmin";

const allowedModuleCodes = new Set([
  "fleet_core",
  "cte_issuance",
  "financial",
  "frotak_ai",
  "frotak_tracking",
]);

export type ProvisionTenantInput = {
  masterAccessToken: string;
  legalName: string;
  tradeName?: string;
  cnpj: string;
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
  planCode: string;
  subscriptionPeriod: string;
  maxVehicles: number;
  enabledModuleCodes: string[];
};

export type ProvisionTenantResult =
  | {
      status: "ok";
      tenantId: string;
      workspaceId: string;
      membershipId: string;
      ownerRoleId: string;
      ownerEmail: string;
    }
  | { status: "skipped"; reason: string };

type PlatformUserRow = {
  active: boolean;
  platform_role: string;
};

type ProvisionRpcRow = {
  tenant_id: string;
  workspace_id: string;
  membership_id: string;
  owner_role_id: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-");
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function periodEndDate(period: string, startsAt: Date) {
  const normalized = period
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("anual")) return addMonths(startsAt, 12);
  if (normalized.includes("trimes")) return addMonths(startsAt, 3);
  if (normalized.includes("semes")) return addMonths(startsAt, 6);
  return addMonths(startsAt, 1);
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha ao provisionar cliente.";

  if (/duplicate key|already registered|already been registered|already exists/i.test(message)) {
    return "Ja existe um cliente ou usuario com esses dados.";
  }

  if (/not authorized|permission|jwt|invalid token|auth/i.test(message)) {
    return "Sessao master invalida ou sem permissao para criar clientes.";
  }

  if (/cnpj/i.test(message)) return "CNPJ invalido.";
  if (/plan/i.test(message)) return "Plano informado nao existe ou esta inativo.";
  if (/module/i.test(message)) return "Modulo informado nao existe ou esta inativo.";
  if (/max_vehicles|maxVehicles/i.test(message)) return "Limite de veiculos invalido.";

  return "Nao foi possivel criar o cliente. Verifique os dados e tente novamente.";
}

function validateInput(input: ProvisionTenantInput) {
  const legalName = normalizeText(input.legalName);
  const tradeName = normalizeText(input.tradeName);
  const ownerName = normalizeText(input.ownerName);
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const temporaryPassword = normalizeText(input.temporaryPassword);
  const planCode = normalizeText(input.planCode || "BASIC").toUpperCase();
  const subscriptionPeriod = normalizeText(input.subscriptionPeriod || "Mensal");
  const cnpj = onlyDigits(normalizeText(input.cnpj));
  const maxVehicles = Number(input.maxVehicles);
  const tenantSlug = slugify(tradeName || legalName);
  const workspaceSlug = tenantSlug;
  const requestedModuleCodes = Array.from(
    new Set(["fleet_core", ...(input.enabledModuleCodes ?? [])]),
  ).map((code) => normalizeText(code));
  const invalidModuleCode = requestedModuleCodes.find(
    (code) => !allowedModuleCodes.has(code),
  );
  if (invalidModuleCode) {
    throw new Error("Modulo informado nao existe ou esta inativo.");
  }
  const moduleCodes = requestedModuleCodes;

  if (!normalizeText(input.masterAccessToken)) {
    throw new Error("Sessao master nao enviada.");
  }

  if (!legalName) throw new Error("Informe o nome da empresa.");
  if (!tenantSlug) throw new Error("Nao foi possivel gerar o slug do cliente.");
  if (!ownerName) throw new Error("Informe o nome do administrador inicial.");
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error("Informe um e-mail valido para o administrador inicial.");
  }
  if (temporaryPassword.length < 8) {
    throw new Error("A senha temporaria deve ter pelo menos 8 caracteres.");
  }
  if (cnpj.length !== 14) throw new Error("CNPJ invalido.");
  if (!Number.isInteger(maxVehicles) || maxVehicles < 1) {
    throw new Error("Limite de veiculos invalido.");
  }

  return {
    legalName,
    tradeName,
    ownerName,
    ownerEmail,
    temporaryPassword,
    planCode,
    subscriptionPeriod,
    cnpj,
    maxVehicles,
    tenantSlug,
    workspaceName: tradeName || legalName,
    workspaceSlug,
    moduleCodes,
  };
}

export const provisionTenant = createServerFn({ method: "POST" })
  .validator((input: ProvisionTenantInput) => input)
  .handler(async ({ data }): Promise<ProvisionTenantResult> => {
    if (!hasSupabaseAdminConfig()) {
      return {
        status: "skipped",
        reason: "SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nao configuradas.",
      };
    }

    const input = validateInput(data);
    const supabase = getSupabaseAdmin();
    let createdUserId: string | undefined;

    try {
      const { data: actorAuth, error: actorError } = await supabase.auth.getUser(
        data.masterAccessToken,
      );
      if (actorError || !actorAuth.user) {
        throw new Error("invalid master jwt");
      }

      const actorUserId = actorAuth.user.id;
      const { data: platformUser, error: platformError } = await supabase
        .from("platform_users")
        .select("active, platform_role")
        .eq("user_id", actorUserId)
        .maybeSingle<PlatformUserRow>();

      if (platformError) throw platformError;
      if (
        !platformUser?.active ||
        !["super_admin", "operations"].includes(platformUser.platform_role)
      ) {
        throw new Error("actor is not authorized");
      }

      const existingUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (existingUsers.error) throw existingUsers.error;

      const existingOwner = existingUsers.data.users.find(
        (user) => user.email?.toLowerCase() === input.ownerEmail,
      );
      if (existingOwner) {
        throw new Error("owner email already exists");
      }

      const authUser = await supabase.auth.admin.createUser({
        email: input.ownerEmail,
        password: input.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: input.ownerName,
          must_change_password: true,
        },
      });

      if (authUser.error || !authUser.data.user) {
        throw authUser.error ?? new Error("auth user was not created");
      }

      createdUserId = authUser.data.user.id;

      const startsAt = new Date();
      const endsAt = periodEndDate(input.subscriptionPeriod, startsAt);
      const { data: provisionedRows, error: provisionError } = await supabase.rpc(
        "provision_tenant",
        {
          p_owner_user_id: createdUserId,
          p_owner_full_name: input.ownerName,
          p_legal_name: input.legalName,
          p_trade_name: input.tradeName || null,
          p_cnpj: input.cnpj,
          p_tenant_slug: input.tenantSlug,
          p_workspace_name: input.workspaceName,
          p_workspace_slug: input.workspaceSlug,
          p_plan_code: input.planCode,
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_subscription_period: input.subscriptionPeriod,
          p_max_vehicles: input.maxVehicles,
          p_enabled_module_codes: input.moduleCodes,
          p_actor_user_id: actorUserId,
        },
      );

      if (provisionError) throw provisionError;

      const row = Array.isArray(provisionedRows)
        ? (provisionedRows[0] as ProvisionRpcRow | undefined)
        : (provisionedRows as ProvisionRpcRow | undefined);

      if (!row?.tenant_id || !row.workspace_id || !row.membership_id || !row.owner_role_id) {
        throw new Error("provision_tenant did not return required identifiers");
      }

      return {
        status: "ok",
        tenantId: row.tenant_id,
        workspaceId: row.workspace_id,
        membershipId: row.membership_id,
        ownerRoleId: row.owner_role_id,
        ownerEmail: input.ownerEmail,
      };
    } catch (error) {
      if (createdUserId) {
        const cleanup = await supabase.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) {
          console.error("provisionTenant cleanup failed", {
            ownerUserId: createdUserId,
            error: cleanup.error.message,
          });
        }
      }

      console.error("provisionTenant failed", {
        legalName: input.legalName,
        ownerEmail: input.ownerEmail,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(sanitizeError(error));
    }
  });
