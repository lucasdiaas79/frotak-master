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

/**
 * Compatibilidade de transicao da Wave 0:
 * `authenticate()` ainda monta a URL legada internamente. Esta funcao nunca
 * navega para ela: extrai o JWT apenas em memoria, troca-o por um codigo curto
 * de uso unico via Edge Function e devolve uma URL sem access/refresh token.
 */
export async function createSecureClientHandoffRedirect(legacyRedirectUrl: string) {
  const legacyUrl = new URL(legacyRedirectUrl);
  const legacyHash = legacyUrl.hash.startsWith("#") ? legacyUrl.hash.slice(1) : legacyUrl.hash;
  const params = new URLSearchParams(legacyHash);
  const accessToken = params.get("sso_token");
  const tenantId = params.get("tenant_id");
  const source = params.get("source");

  if (!accessToken || !tenantId || source !== "frotak-master") {
    throw new Error("Handoff legado incompleto; recusando fallback inseguro.");
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

  const target = new URL(legacyUrl.origin);
  target.pathname = "/login";
  target.search = "";
  target.hash = new URLSearchParams({
    handoff_code: payload.code,
    tenant_id: tenantId,
    source: "frotak-master",
  }).toString();

  return target.toString();
}
