import { createClient } from "npm:@supabase/supabase-js@2.104.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return "";
  }
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function activeWorkspaceForTenant(
  admin: ReturnType<typeof createClient>,
  userId: string,
  tenantId: string,
) {
  const { data: memberships, error: membershipError } = await admin
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipError) throw membershipError;

  const workspaceIds = (memberships ?? []).map((row) => row.workspace_id).filter(Boolean);
  if (workspaceIds.length === 0) return null;

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("id, tenant_id, status")
    .in("id", workspaceIds)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!workspace) return null;

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, status")
    .eq("id", tenantId)
    .in("status", ["active", "trial"])
    .maybeSingle();

  if (tenantError) throw tenantError;
  if (!tenant) return null;

  return workspace;
}

async function createHandoff(
  req: Request,
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const jwt = bearerToken(req);
  if (!jwt) return json(401, { error: "HANDOFF_AUTH_REQUIRED" });

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (userError || !user) return json(401, { error: "HANDOFF_AUTH_INVALID" });

  const tenantId = body.tenantId;
  if (!isUuid(tenantId)) return json(400, { error: "HANDOFF_TENANT_INVALID" });

  const workspace = await activeWorkspaceForTenant(admin, user.id, tenantId);
  if (!workspace) return json(403, { error: "HANDOFF_TENANT_ACCESS_DENIED" });

  const code = randomCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 90_000).toISOString();

  const { error: insertError } = await admin.from("auth_handoff_codes").insert({
    code_hash: codeHash,
    user_id: user.id,
    tenant_id: tenantId,
    workspace_id: workspace.id,
    expires_at: expiresAt,
  });

  if (insertError) throw insertError;

  return json(200, {
    code,
    tenantId,
    workspaceId: workspace.id,
    expiresAt,
  });
}

async function exchangeHandoff(
  admin: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (code.length < 40 || code.length > 100) {
    return json(400, { error: "HANDOFF_CODE_INVALID" });
  }

  const codeHash = await sha256Hex(code);
  const consumedAt = new Date().toISOString();

  const { data: ticket, error: consumeError } = await admin
    .from("auth_handoff_codes")
    .update({ consumed_at: consumedAt })
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("user_id, tenant_id, workspace_id")
    .maybeSingle();

  if (consumeError) throw consumeError;
  if (!ticket) return json(401, { error: "HANDOFF_CODE_EXPIRED_OR_USED" });

  const { data: membership, error: membershipError } = await admin
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("workspace_id", ticket.workspace_id)
    .eq("user_id", ticket.user_id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return json(403, { error: "HANDOFF_ACCESS_REVOKED" });

  const workspace = await activeWorkspaceForTenant(admin, ticket.user_id, ticket.tenant_id);
  if (!workspace || workspace.id !== ticket.workspace_id) {
    return json(403, { error: "HANDOFF_ACCESS_REVOKED" });
  }

  const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(ticket.user_id);
  const user = userData.user;
  if (getUserError || !user?.email) {
    return json(403, { error: "HANDOFF_USER_UNAVAILABLE" });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  if (linkError || !linkData.properties?.hashed_token) {
    throw linkError ?? new Error("Magic-link token hash ausente.");
  }

  return json(200, {
    tokenHash: linkData.properties.hashed_token,
    verificationType: "magiclink",
    tenantId: ticket.tenant_id,
    workspaceId: ticket.workspace_id,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = serviceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    return json(503, { error: "HANDOFF_SERVER_NOT_CONFIGURED" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === "create") {
      return await createHandoff(req, admin, body);
    }

    if (action === "exchange") {
      return await exchangeHandoff(admin, body);
    }

    return json(400, { error: "HANDOFF_ACTION_INVALID" });
  } catch (error) {
    console.error("[client-handoff] unexpected error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return json(500, { error: "HANDOFF_INTERNAL_ERROR" });
  }
});
