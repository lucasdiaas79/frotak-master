import { createFileRoute } from "@tanstack/react-router";
import { runSascarSync, type SascarSyncInput } from "../../../../server/lib/sascar-sync.ts";

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
          const result = await runSascarSync(body);
          return jsonResponse(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao sincronizar Sascar.";
          const status = message === "UNAUTHORIZED"
            ? 401
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
