import type { ClientHandoffContext } from "@/lib/auth";

type HandoffCreateResponse = {
  code?: string;
  tenantId?: string;
  workspaceId?: string;
  expiresAt?: string;
  error?: string;
};

function getSupabaseFunctionConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (typeof url !== "string" || !url.trim() || typeof key !== "string" || !key.trim()) {
    throw new Error("Supabase nao configurado para handoff seguro.");
  }

  return { url: url.replace(/\/$/, ""), key };
}

function getDefaultClientAppUrl() {
  const configuredUrl = import.meta.env.VITE_FROTAK_CLIENT_APP_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim()) return configuredUrl.trim();

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:5174";
  }

  return "https://cliente.frotak.log.br";
}

/**
 * Cria um ticket efemero usando o JWT somente no header Authorization. Nenhum
 * access token ou refresh token e transformado em URL, query string ou hash.
 */
export async function createSecureClientHandoffRedirect(context: ClientHandoffContext) {
  const accessToken = context.accessToken?.trim();
  const tenantId = context.tenantId?.trim();

  if (!accessToken || !tenantId) {
    throw new Error("Handoff incompleto; recusando acesso inseguro.");
  }

  const { url, key } = getSupabaseFunctionConfig();
  const response = await fetch(`${url}/functions/v1/client-handoff`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "create", tenantId }),
  });

  let payload: HandoffCreateResponse = {};
  try {
    payload = (await response.json()) as HandoffCreateResponse;
  } catch {
    // Resposta invalida e tratada como falha fechada abaixo.
  }

  if (!response.ok || !payload.code || payload.tenantId !== tenantId) {
    throw new Error(payload.error || "Nao foi possivel criar handoff seguro.");
  }

  const target = new URL(context.clientUrl || getDefaultClientAppUrl());
  target.pathname = "/login";
  target.search = "";
  target.hash = new URLSearchParams({
    handoff_code: payload.code,
    tenant_id: tenantId,
    source: "frotak-master",
  }).toString();

  return target.toString();
}
