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
              ? 409
              : 500;

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
