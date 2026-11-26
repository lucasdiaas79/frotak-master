import { dispatchNotificationPush } from "@/modules/notifications/application/dispatchNotificationPush";
import { supabaseNotificationPushStore } from "@/modules/notifications/infrastructure/supabaseNotificationPush";
import { sendWebPush } from "@/modules/frotak-ai/infrastructure/webPush";
import { getSupabaseAdmin } from "../../../../server/lib/supabase-admin.ts";

/**
 * Envia ao Windows os avisos pendentes do cliente atendido (banco escolhido pelo endereco).
 * Chamado pela rota /api/notifications/dispatch: agente da VPS a cada minuto, ou pg_cron no
 * Supabase hospedado.
 */
export async function dispatchPendingNotifications() {
  const store = supabaseNotificationPushStore(getSupabaseAdmin());
  return dispatchNotificationPush({
    ...store,
    send: (device, payload) => sendWebPush(device, payload),
  });
}
