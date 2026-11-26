import { createServerFn } from "@tanstack/react-start";
import {
  DriverLinkError,
  createDriverTripLink,
  listDriverTripLinks,
  loadDriverLinkView,
  markDriverLinkOpened,
  revokeDriverTripLink,
  runDriverLinkAction,
} from "../../../server/lib/driver-link.ts";
import { CarrierContextError, resolveCarrierContext } from "../../../server/lib/carrier-context.ts";
import type { DriverLinkAction, DriverLinkSummary, DriverLinkView } from "./types";

// Funcoes de servidor do link do motorista (pagina publica) e do painel da transportadora.

type Fail = { ok: false; error: string; code?: string };

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fail(error: unknown, scope: string): Fail {
  if (error instanceof DriverLinkError)
    return { ok: false, error: error.message, code: error.code };
  if (error instanceof CarrierContextError)
    return { ok: false, error: error.message, code: "unauthorized" };
  console.error(`[driver-link] ${scope} failed`, {
    message: error instanceof Error ? error.message : String(error),
  });
  return { ok: false, error: "Não foi possível concluir agora. Tente de novo em instantes." };
}

export const driverLinkLoad = createServerFn({ method: "POST" })
  .inputValidator((input: { token?: string; opened?: boolean } | undefined) => ({
    token: clean(input?.token, 100),
    opened: input?.opened === true,
  }))
  .handler(async ({ data }): Promise<{ ok: true; view: DriverLinkView } | Fail> => {
    try {
      if (data.opened) await markDriverLinkOpened(data.token);
      return { ok: true, view: await loadDriverLinkView(data.token) };
    } catch (error) {
      return fail(error, "load");
    }
  });

export const driverLinkAct = createServerFn({ method: "POST" })
  .inputValidator((input: { token?: string; action?: unknown } | undefined) => ({
    token: clean(input?.token, 100),
    action: (input?.action ?? {}) as DriverLinkAction,
  }))
  .handler(async ({ data }): Promise<{ ok: true; message: string } | Fail> => {
    try {
      return await runDriverLinkAction(data.token, data.action);
    } catch (error) {
      return fail(error, "action");
    }
  });

export const carrierCreateDriverLink = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    vehicleId: clean(input?.vehicleId, 64),
    phone: clean(input?.phone, 30),
    relation: (["frota", "agregado", "terceiro"].includes(String(input?.relation))
      ? input?.relation
      : "terceiro") as "frota" | "agregado" | "terceiro",
    payAmount: typeof input?.payAmount === "number" ? input.payAmount : undefined,
    origin: clean(input?.origin, 200),
  }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; url: string; expiresAt: string; driverName: string } | Fail> => {
      try {
        const ctx = await resolveCarrierContext(data.accessToken, data.workspaceId);
        const created = await createDriverTripLink(ctx, data, data.origin);
        return { ok: true, ...created };
      } catch (error) {
        return fail(error, "create");
      }
    },
  );

export const carrierListDriverLinks = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    vehicleId: clean(input?.vehicleId, 64),
  }))
  .handler(async ({ data }): Promise<{ ok: true; links: DriverLinkSummary[] } | Fail> => {
    try {
      const ctx = await resolveCarrierContext(data.accessToken, data.workspaceId);
      return { ok: true, links: await listDriverTripLinks(ctx, data.vehicleId) };
    } catch (error) {
      return fail(error, "list");
    }
  });

export const carrierRevokeDriverLink = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    linkId: clean(input?.linkId, 64),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const ctx = await resolveCarrierContext(data.accessToken, data.workspaceId);
      await revokeDriverTripLink(ctx, data.linkId);
      return { ok: true };
    } catch (error) {
      return fail(error, "revoke");
    }
  });
