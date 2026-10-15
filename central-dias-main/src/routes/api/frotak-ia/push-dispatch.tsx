import { createFileRoute } from "@tanstack/react-router";
import { dispatchFrotakIdlePush } from "@/lib/frotakPush";

// Chamado pelo agendador (pg_cron no Supabase) com o token FROTAK_PUSH_CRON_TOKEN.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hasCronToken(request: Request) {
  const expected = process.env.FROTAK_PUSH_CRON_TOKEN?.trim();
  if (!expected) return false;
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-frotak-push-token")?.trim();
  return bearer === expected || header === expected;
}

export const Route = createFileRoute("/api/frotak-ia/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasCronToken(request)) return jsonResponse({ message: "Unauthorized" }, 401);
        try {
          return jsonResponse({ ok: true, ...(await dispatchFrotakIdlePush()) });
        } catch (error) {
          console.error("[frotakPush] dispatch failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          return jsonResponse({ ok: false, message: "Falha ao enviar avisos." }, 500);
        }
      },
    },
  },
});
