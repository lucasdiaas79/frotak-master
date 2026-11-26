import { AsyncLocalStorage } from "node:async_hooks";
import {
  browserConfigScript,
  connectionForHost,
  isClientDatabaseMode,
  normalizeHost,
  setRequestStore,
  type TenantConnection,
} from "../server/lib/tenant-connection";

const requestStore = new AsyncLocalStorage<TenantConnection>();
setRequestStore(requestStore);

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

function getServerEntry() {
  serverEntryPromise ??= import("@tanstack/react-start/server-entry").then(
    (module) => (module.default ?? module) as ServerEntry,
  );
  return serverEntryPromise;
}

function page(status: number, title: string, message: string) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f4f6f5;color:#14211a}main{max-width:420px;padding:24px;text-align:center}h1{font-size:22px}p{color:#51605a}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const entry = await getServerEntry();
    if (!isClientDatabaseMode()) return entry.fetch(request, env, ctx);

    const url = new URL(request.url);
    if (url.pathname === "/__frotak/health") return new Response("ok");

    // O Caddy pergunta antes de emitir HTTPS: só endereço de cliente que existe ganha certificado.
    if (url.pathname === "/__frotak/tls-ask") {
      const host = normalizeHost(url.searchParams.get("domain"));
      const known = host ? await connectionForHost(host).catch(() => null) : null;
      return new Response(null, { status: known ? 200 : 404 });
    }

    const host = normalizeHost(request.headers.get("host"));
    let connection;
    try {
      connection = host ? await connectionForHost(host) : null;
    } catch (error) {
      console.error("[tenant] agente indisponivel", error);
      return page(
        503,
        "Sistema indisponível",
        "Não foi possível abrir o sistema agora. Tente novamente em instantes.",
      );
    }
    if (!connection) {
      return page(
        404,
        "Empresa não encontrada",
        "Confira o endereço de acesso enviado pela FrotaK.",
      );
    }

    if (url.pathname === "/frotak-client.js") {
      return new Response(browserConfigScript(connection), {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const resolved = connection;
    return requestStore.run(resolved, () => entry.fetch(request, env, ctx));
  },
};
