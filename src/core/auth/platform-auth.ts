import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getAccessToken } from "@/lib/auth";
import { resolvePlatformActor } from "@/core/server/resolve-platform-actor";

/**
 * Toda server function do Master passa por aqui: o navegador envia o JWT da sessao
 * e o servidor so executa depois de confirmar que o usuario e da equipe FrotaK.
 * O handler recebe o ator em context.actor.
 */
export const platformAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = await getAccessToken();
    return next({ headers: token ? { authorization: `Bearer ${token}` } : undefined });
  })
  .server(async ({ next }) => {
    const actor = await resolvePlatformActor(getRequestHeader("authorization"));
    return next({ context: { actor } });
  });
