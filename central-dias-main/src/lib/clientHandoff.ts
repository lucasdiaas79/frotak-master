import { hasSupabaseConfig, supabase } from "@/lib/supabase";

type HandoffExchangeResponse = {
  tokenHash?: string;
  verificationType?: "magiclink";
  tenantId?: string;
  workspaceId?: string;
  error?: string;
};

function getFunctionConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!hasSupabaseConfig() || typeof url !== "string" || !url.trim() || !key) {
    throw new Error("HANDOFF_SUPABASE_NOT_CONFIGURED");
  }

  return { url: url.replace(/\/$/, ""), key };
}

export function readSecureHandoffFromLocation() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);

  return {
    code: params.get("handoff_code"),
    tenantId: params.get("tenant_id"),
    source: params.get("source"),
  };
}

export async function exchangeSecureMasterHandoff() {
  const { code, tenantId, source } = readSecureHandoffFromLocation();
  if (!code || !tenantId || source !== "frotak-master") {
    throw new Error("HANDOFF_CODE_REQUIRED");
  }

  // O ticket fica apenas em memoria a partir daqui. Remove o fragmento antes
  // de qualquer carregamento de dados/recursos da aplicacao.
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

  const { url, key } = getFunctionConfig();
  const response = await fetch(`${url}/functions/v1/client-handoff`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "exchange", code }),
  });

  let payload: HandoffExchangeResponse = {};
  try {
    payload = (await response.json()) as HandoffExchangeResponse;
  } catch {
    // Resposta invalida sera recusada abaixo.
  }

  if (
    !response.ok ||
    !payload.tokenHash ||
    payload.verificationType !== "magiclink" ||
    payload.tenantId !== tenantId ||
    !payload.workspaceId
  ) {
    throw new Error(payload.error || "HANDOFF_EXCHANGE_FAILED");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "magiclink",
  });

  if (error || !data.session?.user) {
    await supabase.auth.signOut();
    throw new Error("HANDOFF_LOGIN_FAILED");
  }

  window.localStorage.setItem("frotak-active-tenant-id", payload.tenantId);
  window.localStorage.setItem("frotak-active-workspace-id", payload.workspaceId);
  window.localStorage.setItem("frotak-sso-source", "frotak-master");

  return {
    user: data.session.user,
    tenantId: payload.tenantId,
    workspaceId: payload.workspaceId,
  };
}
