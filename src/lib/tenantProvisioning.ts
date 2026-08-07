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

type SanitizedErrorDetails = {
  name: string;
  code: string | null;
  message: string;
  status: number | null;
  details: string | null;
  hint: string | null;
};

function maskUserId(value: string | null | undefined) {
  return value ? `${value.slice(0, 4)}...${value.slice(-4)}` : null;
}

function maskEmail(value: string | null | undefined) {
  if (!value) return null;
  const [localPart = "", domain = ""] = value.split("@");
  const prefix = localPart.slice(0, 2) || "*";
  return `${prefix}***@${domain || "***"}`;
}

function sanitizeErrorDetails(error: unknown): SanitizedErrorDetails {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : "Error",
      code: typeof record.code === "string" ? record.code : null,
      message: typeof record.message === "string" ? record.message : String(error),
      status: typeof record.status === "number" ? record.status : null,
      details: typeof record.details === "string" ? record.details : null,
      hint: typeof record.hint === "string" ? record.hint : null,
    };
  }

  return {
    name: "Error",
    code: null,
    message: error instanceof Error ? error.message : String(error),
    status: null,
    details: null,
    hint: null,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return String(error);
}

function logProvisionStage(stage: string, payload: Record<string, unknown>) {
  console.info("[provisionTenant]", JSON.stringify({ stage, ...payload }));
}

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

  if (normalized.includes("12 mes")) return addMonths(startsAt, 12);
  if (normalized.includes("anual")) return addMonths(startsAt, 12);
  if (normalized.includes("trimes")) return addMonths(startsAt, 3);
  if (normalized.includes("semes")) return addMonths(startsAt, 6);
  return addMonths(startsAt, 1);
}

function sanitizeError(error: unknown) {
  const message = getErrorMessage(error);

  if (/duplicate key|already registered|already been registered|already exists/i.test(message)) {
    if (/owner email/i.test(message)) return "Este e-mail ja esta cadastrado.";
    return "Ja existe um cliente ou usuario com esses dados.";
  }

  if (/not authorized|permission|jwt|invalid token|auth/i.test(message)) {
    if (/actor is not authorized/i.test(message)) {
      return "Voce nao possui permissao para criar clientes.";
    }
    return "Sua sessao expirou. Entre novamente.";
  }

  if (/cnpj/i.test(message)) return "CNPJ invalido.";
  if (/plan/i.test(message)) return "Plano informado nao existe ou esta inativo.";
  if (/module/i.test(message)) return "Modulo informado nao existe ou esta inativo.";
  if (/max_vehicles|maxVehicles/i.test(message)) return "Limite de veiculos invalido.";
  if (/owner profile not found or inactive/i.test(message)) {
    return "Falha ao provisionar a empresa.";
  }
  if (/password/i.test(message)) {
    return "A senha temporaria nao atende as regras atuais.";
  }

  return "Falha ao provisionar a empresa.";
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

export async function provisionTenantServer(
  data: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
    logProvisionStage("validate-input", {
      legalName: normalizeText(data.legalName),
      tradeName: normalizeText(data.tradeName),
      cnpjDigits: onlyDigits(normalizeText(data.cnpj)).length,
      ownerNamePresent: Boolean(normalizeText(data.ownerName)),
      ownerEmail: maskEmail(normalizeText(data.ownerEmail)),
      planCode: normalizeText(data.planCode || "BASIC").toUpperCase(),
      subscriptionPeriod: normalizeText(data.subscriptionPeriod || "Mensal"),
      maxVehicles: Number(data.maxVehicles),
      enabledModuleCodes: Array.isArray(data.enabledModuleCodes) ? data.enabledModuleCodes : [],
    });

    if (!hasSupabaseAdminConfig()) {
      logProvisionStage("config-missing", {
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
        hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      });
      return {
        status: "skipped",
        reason: "SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nao configuradas.",
      };
    }

    const input = validateInput(data);
  const supabase = getSupabaseAdmin();
  let createdUserId: string | undefined;
  let currentStage = "validate-input";

  try {
      currentStage = "validate-master";
      logProvisionStage("validate-master", {
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
        hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      });
      const { data: actorAuth, error: actorError } = await supabase.auth.getUser(
        data.masterAccessToken,
      );
      if (actorError || !actorAuth.user) {
        throw new Error("invalid master jwt");
      }

      const actorUserId = actorAuth.user.id;
      currentStage = "master-user-resolved";
      logProvisionStage("master-user-resolved", {
        userId: maskUserId(actorUserId),
      });
      const { data: platformUser, error: platformError } = await supabase
        .from("platform_users")
        .select("active, platform_role")
        .eq("user_id", actorUserId)
        .maybeSingle<PlatformUserRow>();

      if (platformError) throw platformError;
      currentStage = "platform-user-resolved";
      logProvisionStage("platform-user-resolved", {
        userId: maskUserId(actorUserId),
        active: platformUser?.active ?? null,
        platformRole: platformUser?.platform_role ?? null,
      });
      if (
        !platformUser?.active ||
        !["super_admin", "operations"].includes(platformUser.platform_role)
      ) {
        throw new Error("actor is not authorized");
      }

      currentStage = "check-existing-owner";
      const existingUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (existingUsers.error) throw existingUsers.error;

      const existingOwner = existingUsers.data.users.find(
        (user) => user.email?.toLowerCase() === input.ownerEmail,
      );
      if (existingOwner) {
        throw new Error("owner email already exists");
      }

      currentStage = "create-auth-user";
      logProvisionStage("create-auth-user", {
        ownerEmail: maskEmail(input.ownerEmail),
      });
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
      currentStage = "auth-user-created";
      logProvisionStage("auth-user-created", {
        ownerUserId: maskUserId(createdUserId),
      });

      currentStage = "profile-check";
      const { data: createdProfile, error: createdProfileError } = await supabase
        .from("profiles")
        .select("id, active")
        .eq("id", createdUserId)
        .maybeSingle();

      if (createdProfileError) throw createdProfileError;
      logProvisionStage("profile-check", {
        ownerUserId: maskUserId(createdUserId),
        profileExists: Boolean(createdProfile),
        profileActive: createdProfile?.active ?? null,
      });

      const startsAt = new Date();
      const endsAt = periodEndDate(input.subscriptionPeriod, startsAt);
      currentStage = "call-rpc";
      logProvisionStage("call-rpc", {
        actorUserId: maskUserId(actorUserId),
        ownerUserId: maskUserId(createdUserId),
        tenantSlug: input.tenantSlug,
        workspaceSlug: input.workspaceSlug,
        planCode: input.planCode,
        subscriptionPeriod: input.subscriptionPeriod,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        maxVehicles: input.maxVehicles,
        enabledModuleCodes: input.moduleCodes,
      });
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

      currentStage = "success";
      logProvisionStage("success", {
        tenantId: maskUserId(row.tenant_id),
        workspaceId: maskUserId(row.workspace_id),
        membershipId: maskUserId(row.membership_id),
        ownerRoleId: maskUserId(row.owner_role_id),
      });
      return {
        status: "ok",
        tenantId: row.tenant_id,
        workspaceId: row.workspace_id,
        membershipId: row.membership_id,
        ownerRoleId: row.owner_role_id,
        ownerEmail: input.ownerEmail,
      };
    } catch (error) {
      const sanitizedError = sanitizeErrorDetails(error);
      const failureStage = currentStage;
      if (createdUserId) {
        currentStage = "rollback-auth-user";
        logProvisionStage("rollback-auth-user", {
          ownerUserId: maskUserId(createdUserId),
        });
        const cleanup = await supabase.auth.admin.deleteUser(createdUserId);
        if (cleanup.error) {
          console.error("provisionTenant cleanup failed", {
            ownerUserId: createdUserId,
            error: cleanup.error.message,
          });
        }
      }

      console.error("[provisionTenant] failed", {
        stage: failureStage,
        legalName: input.legalName,
        ownerEmail: maskEmail(input.ownerEmail),
        error: sanitizedError,
      });

      throw new Error(sanitizeError(error));
    }
}

export const provisionTenant = createServerFn({ method: "POST" })
  .validator((input: ProvisionTenantInput) => input)
  .handler(async ({ data }) => provisionTenantServer(data));
