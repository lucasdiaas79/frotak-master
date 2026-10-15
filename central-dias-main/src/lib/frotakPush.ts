import { createServerFn } from "@tanstack/react-start";
import { resolveFrotakAiContext, type FrotakAiContext } from "@/lib/frotakAiContext";
import { listIdleVehicles } from "@/lib/frotakAiIdle";
import { getVapidPublicKey, sendWebPush } from "@/lib/webPush";
import { getSupabaseAdmin } from "../../server/lib/supabase-admin.ts";

// Aviso por push no celular. O aparelho de cada usuario fica em frotak_push_subscriptions
// (gravado so pelo servidor, com service role). O agendador chama dispatchFrotakIdlePush.

const TABLE = "frotak_push_subscriptions";

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
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .upsert(
          {
            tenant_id: context.tenantId,
            workspace_id: context.workspaceId,
            user_id: context.userId,
            endpoint: data.endpoint,
            p256dh: data.p256dh,
            auth: data.auth,
            user_agent: data.userAgent || null,
            last_error: null,
          },
          { onConflict: "endpoint" },
        );
      if (error) throw new Error(error.message);
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
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .delete()
        .eq("user_id", context.userId)
        .eq("endpoint", data.endpoint);
      if (error) throw new Error(error.message);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: publicMessage(error) };
    }
  });

type SubscriptionRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function idleMessage(result: Awaited<ReturnType<typeof listIdleVehicles>>) {
  const shown = result.veiculos.slice(0, 3).map((row) => {
    const days = row.dias_parado === null ? "" : ` ha ${Math.max(1, Math.round(row.dias_parado))}d`;
    const reason = row.precisa_motivo ? "sem motivo" : row.motivo.replace(/ \(.*\)$/, "");
    return `${row.placa}${days} (${reason})`;
  });
  const rest = result.quantidade - shown.length;
  return {
    title: `${result.quantidade} ${result.quantidade === 1 ? "veiculo" : "veiculos"} sem viagem ha mais de ${result.horas_minimas}h`,
    body: `${shown.join("; ")}${rest > 0 ? ` e mais ${rest}` : ""}.`,
    url: "/frotak-ia",
    tag: "frotak-veiculos-parados",
  };
}

// Um aviso por aparelho, so quando ha veiculo parado. Assinaturas expiradas sao apagadas.
export async function dispatchFrotakIdlePush() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from(TABLE)
    .select("id, tenant_id, workspace_id, user_id, endpoint, p256dh, auth")
    .limit(5000);
  if (error) throw new Error(error.message);
  const subscriptions = (data ?? []) as SubscriptionRow[];

  const byWorkspace = new Map<string, SubscriptionRow[]>();
  subscriptions.forEach((row) =>
    byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), row]),
  );

  const stats = { workspaces: byWorkspace.size, enviados: 0, removidos: 0, falhas: 0 };
  for (const [workspaceId, rows] of byWorkspace) {
    const { data: members } = await admin
      .from("workspace_memberships")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    const activeUsers = new Set(
      ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id),
    );
    const targets = rows.filter((row) => activeUsers.has(row.user_id));
    if (!targets.length) continue;

    const context = { tenantId: targets[0].tenant_id, workspaceId } as FrotakAiContext;
    let result: Awaited<ReturnType<typeof listIdleVehicles>>;
    try {
      result = await listIdleVehicles(admin, context, { limit: 10 });
    } catch (checkError) {
      stats.falhas += targets.length;
      console.error("[frotakPush] idle check failed", {
        workspaceId,
        message: checkError instanceof Error ? checkError.message : String(checkError),
      });
      continue;
    }
    if (!result.quantidade) continue;
    const message = idleMessage(result);

    for (const row of targets) {
      try {
        const sent = await sendWebPush(row, message);
        if (sent.gone) {
          await admin.from(TABLE).delete().eq("id", row.id);
          stats.removidos += 1;
        } else if (sent.ok) {
          await admin
            .from(TABLE)
            .update({ last_sent_at: new Date().toISOString(), last_error: null })
            .eq("id", row.id);
          stats.enviados += 1;
        } else {
          await admin
            .from(TABLE)
            .update({ last_error: `HTTP ${sent.status}` })
            .eq("id", row.id);
          stats.falhas += 1;
        }
      } catch (sendError) {
        stats.falhas += 1;
        console.error("[frotakPush] send failed", {
          workspaceId,
          message: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  }
  console.info("[frotakPush] dispatch", stats);
  return stats;
}
