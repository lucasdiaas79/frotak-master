import { DomainError } from "@/core/domain/domain-error";
import { platformRoles, type PlatformActor, type PlatformRole } from "@/core/domain/platform-actor";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/core/server/supabase-admin";

type PlatformUserRow = {
  platform_role: PlatformRole;
  active: boolean;
};

function bearerToken(authorization: string | undefined) {
  return (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Lê o nível de garantia de um token que o Auth já validou. */
function assuranceLevel(token: string) {
  try {
    const payload = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { aal?: string }).aal ?? "";
  } catch {
    return "";
  }
}

/** Confere o JWT do Supabase e o cadastro em platform_users antes de qualquer chamada do Master. */
export async function resolvePlatformActor(
  authorization: string | undefined,
): Promise<PlatformActor> {
  const token = bearerToken(authorization);
  if (!token) {
    throw new DomainError("UNAUTHENTICATED", "Sua sessao expirou. Entre novamente.");
  }

  if (!hasSupabaseAdminConfig()) {
    throw new DomainError(
      "UNAVAILABLE",
      "Servidor do Master sem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY configuradas.",
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw new DomainError("UNAUTHENTICATED", "Sua sessao expirou. Entre novamente.");
  }

  const { data: platformUser, error: platformError } = await supabase
    .from("platform_users")
    .select("platform_role, active")
    .eq("user_id", authData.user.id)
    .maybeSingle<PlatformUserRow>();

  if (platformError) {
    console.error("[platform-auth] platform_users lookup failed", platformError.message);
    throw new DomainError("UNAVAILABLE", "Erro temporario de autenticacao.");
  }

  if (!platformUser?.active || !platformRoles.includes(platformUser.platform_role)) {
    throw new DomainError("FORBIDDEN", "Usuario sem acesso ao FrotaK Master.");
  }

  if (assuranceLevel(token) !== "aal2") {
    throw new DomainError("FORBIDDEN", "Confirme o codigo de verificacao em duas etapas.");
  }

  return {
    userId: authData.user.id,
    email: authData.user.email ?? "",
    role: platformUser.platform_role,
  };
}
