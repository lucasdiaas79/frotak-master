import { createFileRoute } from "@tanstack/react-router";
import { dispatchPendingNotifications } from "@/modules/notifications/api/notificationPush";

// Envio das notificacoes ao Windows. Chamado com o token FROTAK_PUSH_CRON_TOKEN pelo agente da VPS
// (a cada minuto, quando ha aviso pendente) ou pelo pg_cron do Supabase hospedado.

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

export const Route = createFileRoute("/api/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hasCronToken(request)) return jsonResponse({ message: "Unauthorized" }, 401);
        try {
          return jsonResponse({ ok: true, ...(await dispatchPendingNotifications()) });
        } catch (error) {
          console.error("[notifications] dispatch failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          return jsonResponse({ ok: false, message: "Falha ao enviar notificações." }, 500);
        }
      },
    },
  },
});
