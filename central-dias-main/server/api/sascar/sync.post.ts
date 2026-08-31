import { createError, defineEventHandler, getHeader, readBody } from "h3";
import { runSascarSync } from "../../lib/sascar-sync.ts";

interface SyncBody {
  quantity?: number;
  forceFull?: boolean;
  includeCurrentHistory?: boolean;
  source?: "manual" | "cron";
}

function isSameOriginRequest(event: Parameters<typeof defineEventHandler>[0]) {
  if (getHeader(event, "sec-fetch-site") === "same-origin") return true;

  const host = getHeader(event, "host");
  if (!host) return false;

  for (const header of ["origin", "referer"]) {
    const value = getHeader(event, header);
    if (!value) continue;
    try {
      if (new URL(value).host === host) return true;
    } catch {
      // Ignore invalid browser metadata.
    }
  }

  return false;
}

function maybeRequireSyncToken(event: Parameters<typeof defineEventHandler>[0]) {
  const syncToken = process.env.SASCAR_SYNC_TOKEN?.trim();
  if (!syncToken) return;

  const authHeader = getHeader(event, "authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const headerToken = getHeader(event, "x-sascar-sync-token")?.trim();

  if (providedToken !== syncToken && headerToken !== syncToken && !isSameOriginRequest(event)) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
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

export default defineEventHandler(async (event) => {
  maybeRequireSyncToken(event);

  const body = ((await readBody(event).catch(() => ({}))) ?? {}) as SyncBody;

  try {
    return await runSascarSync(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar Sascar.";
    if (message.includes("ja esta em andamento")) {
      return syncInProgressResponse();
    }

    throw createError({
      statusCode: 500,
      statusMessage: message,
    });
  }
});
