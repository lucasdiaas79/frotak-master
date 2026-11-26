// Composicao das notificacoes no navegador: as telas importam daqui, nunca de infrastructure/.
import { getCurrentAccessToken, getCurrentUser, getProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  getFrotakPushPublicKey,
  removeFrotakPushSubscription,
  saveFrotakPushSubscription,
} from "@/modules/frotak-ai/api/frotakPush";
import type {
  NotificationFeed,
  NotificationPreferenceStore,
  NotificationStore,
  WindowsPushPort,
} from "@/modules/notifications/application/ports";
import { browserWindowsPush } from "@/modules/notifications/infrastructure/browserWindowsPush";
import {
  SupabaseNotificationFeed,
  SupabaseNotificationPreferences,
  SupabaseNotificationStore,
} from "@/modules/notifications/infrastructure/supabaseNotifications";

export type {
  AppNotification,
  EffectivePreference,
} from "@/modules/notifications/domain/notification";
export type { WindowsPushState } from "@/modules/notifications/application/ports";

export const notificationStore: NotificationStore = new SupabaseNotificationStore(supabase);
export const notificationFeed: NotificationFeed = new SupabaseNotificationFeed(supabase);
export const notificationPreferences: NotificationPreferenceStore =
  new SupabaseNotificationPreferences(supabase);

async function session() {
  const [accessToken, user] = await Promise.all([getCurrentAccessToken(), getCurrentUser()]);
  if (!accessToken || !user) throw new Error("Sessão expirada. Entre novamente.");
  const workspaceId = (await getProfile(user.id))?.workspaceId;
  if (!workspaceId) throw new Error("Empresa atual indisponível.");
  return { accessToken, workspaceId };
}

// O aparelho fica no mesmo cadastro do aviso da Frotak IA (uma permissao do navegador para tudo).
export const windowsPush: WindowsPushPort = browserWindowsPush({
  publicKey: async () => (await getFrotakPushPublicKey()).publicKey,
  save: async (subscription) => {
    const result = await saveFrotakPushSubscription({
      data: { ...(await session()), ...subscription },
    });
    if (!result.ok) throw new Error(result.error ?? "Não foi possível ligar as notificações.");
  },
  remove: async (endpoint) => {
    await removeFrotakPushSubscription({ data: { ...(await session()), endpoint } });
  },
});
