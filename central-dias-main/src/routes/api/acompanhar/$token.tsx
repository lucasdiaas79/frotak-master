import { createFileRoute } from "@tanstack/react-router";
import { loadFreightTracking } from "../../../../server/lib/freight-share.ts";

// Dados publicos do link de acompanhamento do frete. Sem login: quem tem o link ve
// so o status, a posicao durante a viagem e os documentos de entrega daquele frete.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const Route = createFileRoute("/api/acompanhar/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const result = await loadFreightTracking(params.token, {
            countView: new URL(request.url).searchParams.get("r") !== "1",
          });
          if (!result.ok) {
            return jsonResponse(
              { ok: false, reason: result.reason },
              result.reason === "expired" ? 410 : 404,
            );
          }
          return jsonResponse({ ok: true, tracking: result.tracking });
        } catch (error) {
          console.error("[freight-share] load failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          return jsonResponse({ ok: false, reason: "error" }, 500);
        }
      },
    },
  },
});
