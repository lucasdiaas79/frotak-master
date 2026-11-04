import { createServerFn } from "@tanstack/react-start";
import { fetchWorkspaceEntitlements, isModuleEnabled } from "@/lib/entitlements";
import { dispatchIdlePush } from "@/modules/frotak-ai/application/frotakAiIdlePush";
import type { FrotakAiContext } from "@/modules/frotak-ai/domain/frotakAiContext";
import { resolveFrotakAiContext } from "@/modules/frotak-ai/infrastructure/frotakAiContext";
import { listIdleVehicles } from "@/modules/frotak-ai/infrastructure/frotakAiIdle";
import { SupabasePushSubscriptions } from "@/modules/frotak-ai/infrastructure/supabasePushSubscriptions";
import { getVapidPublicKey, sendWebPush } from "@/modules/frotak-ai/infrastructure/webPush";
import { getSupabaseAdmin } from "../../../../server/lib/supabase-admin.ts";

// Aviso por push no celular. O agendador chama dispatchFrotakIdlePush.

type SubscriptionInput = {
  accessToken?: string;
  workspaceId?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string;
};

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function publicMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "unauthorized") return "Sessao expirada. Entre novamente.";
  return "Nao foi possivel atualizar os avisos agora.";
}

export const getFrotakPushPublicKey = createServerFn({ method: "GET" }).handler(async () => ({
  publicKey: getVapidPublicKey(),
}));

export const saveFrotakPushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input: SubscriptionInput | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    endpoint: clean(input?.endpoint),
    p256dh: clean(input?.p256dh, 200),
    auth: clean(input?.auth, 100),
    userAgent: clean(input?.userAgent, 300),
  }))
  .handler(async ({ data }) => {
    try {
      if (!/^https:\/\//.test(data.endpoint) || !data.p256dh || !data.auth) {
        return { ok: false, error: "Assinatura de push invalida." };
      }
      const context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      await new SupabasePushSubscriptions(getSupabaseAdmin()).save({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        userId: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent,
      });
      return { ok: true };
    } catch (error) {
      console.error("[frotakPush] subscribe failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, error: publicMessage(error) };
    }
  });

export const removeFrotakPushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input: SubscriptionInput | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    endpoint: clean(input?.endpoint),
  }))
  .handler(async ({ data }) => {
    try {
      const context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      await new SupabasePushSubscriptions(getSupabaseAdmin()).removeForUser(
        context.userId,
        data.endpoint,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: publicMessage(error) };
    }
  });

export async function dispatchFrotakIdlePush() {
  const admin = getSupabaseAdmin();
  return dispatchIdlePush({
    store: new SupabasePushSubscriptions(admin),
    sender: { send: (subscription, message) => sendWebPush(subscription, { ...message }) },
    idleFleet: {
      listIdle: (subscription) =>
        listIdleVehicles(
          admin,
          {
            tenantId: subscription.tenantId,
            workspaceId: subscription.workspaceId,
          } as FrotakAiContext,
          { limit: 10 },
        ),
    },
    module: {
      isEnabled: async (workspaceId) =>
        isModuleEnabled(await fetchWorkspaceEntitlements(admin, workspaceId), "frotak_ai"),
    },
  });
}
