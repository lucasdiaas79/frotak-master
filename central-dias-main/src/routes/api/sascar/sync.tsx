import { createFileRoute } from "@tanstack/react-router";
import { runSascarSync, type SascarSyncInput } from "../../../../server/lib/sascar-sync.ts";
import { getSupabaseAdmin } from "../../../../server/lib/supabase-admin.ts";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function isSameOriginRequest(request: Request) {
  const url = new URL(request.url);
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return true;

  for (const header of ["origin", "referer"]) {
    const value = request.headers.get(header);
    if (!value) continue;
    try {
      if (new URL(value).origin === url.origin) return true;
    } catch {
      // Ignore invalid browser metadata.
    }
  }

  return false;
}

function requireCronTokenOrSameOrigin(request: Request) {
  const syncToken = process.env.SASCAR_SYNC_TOKEN?.trim();
  if (!syncToken) return;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const headerToken = request.headers.get("x-sascar-sync-token")?.trim();

  if (bearerToken === syncToken || headerToken === syncToken || isSameOriginRequest(request)) {
    return;
  }

  throw new Error("UNAUTHORIZED");
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function hasCronToken(request: Request) {
  const syncToken = process.env.SASCAR_SYNC_TOKEN?.trim();
  if (!syncToken) return false;
  const bearerToken = getBearerToken(request);
  const headerToken = request.headers.get("x-sascar-sync-token")?.trim();
  return bearerToken === syncToken || headerToken === syncToken;
}

async function validateWorkspaceMembership(request: Request, workspaceId?: string) {
  if (!workspaceId) {
    throw new Error("WORKSPACE_REQUIRED");
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) throw new Error("UNAUTHORIZED");

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) throw new Error("UNAUTHORIZED");

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new Error("WORKSPACE_FORBIDDEN");
}

function syncInProgressResponse() {
  return {
    ok: true,
    message: "Sincronização Sascar já está em andamento.",
    stats: {
      quantityRequested: 0,
      sascarVehicles: 0,
      vehicleBindingsUpdated: 0,
      packetsFetched: 0,
      packetsApplied: 0,
      currentPositionsChecked: 0,
      currentPositionsApplied: 0,
      currentPositionErrors: 0,
      syncedVehicles: 0,
      skippedPackets: 0,
      oldPositionsDeleted: 0,
      lastPacketIdBefore: null,
      lastPacketIdAfter: null,
      source: "manual",
    },
  };
}

export const Route = createFileRoute("/api/sascar/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          requireCronTokenOrSameOrigin(request);
          const body = ((await request.json().catch(() => ({}))) ?? {}) as SascarSyncInput;
          if (!hasCronToken(request)) {
            await validateWorkspaceMembership(request, body.workspaceId);
          }
          const result = await runSascarSync(body);
          return jsonResponse(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao sincronizar Sascar.";
          const status =
            message === "UNAUTHORIZED"
              ? 401
              : message === "WORKSPACE_REQUIRED" || message === "WORKSPACE_FORBIDDEN"
                ? 403
                : message.includes("ja esta em andamento")
                  ? 202
                  : 500;

          if (status === 202) {
            return jsonResponse(syncInProgressResponse(), { status });
          }

          return jsonResponse(
            {
              message:
                status === 401
                  ? "Unauthorized"
                  : message || "Erro ao sincronizar Sascar.",
            },
            { status },
          );
        }
      },
    },
  },
});
