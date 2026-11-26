import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationPushPorts,
  PendingNotification,
  PushDevice,
} from "@/modules/notifications/application/ports";
import type { PushOutcome } from "@/modules/notifications/domain/notification";

// Servidor (chave de servico do banco do cliente atendido): avisos pendentes de envio ao Windows
// e os aparelhos cadastrados. Os aparelhos sao os mesmos do aviso da Frotak IA
// (frotak_push_subscriptions): quem liga o aviso do Windows recebe os dois.

type PendingRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  push_attempts: number;
};

type DeviceRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

export function supabaseNotificationPushStore(
  supabase: SupabaseClient,
): Omit<NotificationPushPorts, "send"> {
  return {
    async listPending(limit): Promise<PendingNotification[]> {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, title, body, link_path, push_attempts")
        .eq("push_status", "pending")
        .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return ((data ?? []) as PendingRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        body: row.body ?? "",
        linkPath: row.link_path,
        attempts: row.push_attempts,
      }));
    },

    async listDevices(userIds): Promise<PushDevice[]> {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("frotak_push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .in("user_id", userIds);
      if (error) throw new Error(error.message);
      return ((data ?? []) as DeviceRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      }));
    },

    async removeDevice(id) {
      const { error } = await supabase.from("frotak_push_subscriptions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    async mark(results) {
      // Agrupa por resultado e tentativas para gravar em poucas chamadas.
      const groups = new Map<string, { status: PushOutcome; attempts: number; ids: string[] }>();
      for (const result of results) {
        const key = `${result.status}:${result.attempts}`;
        const group = groups.get(key) ?? {
          status: result.status,
          attempts: result.attempts,
          ids: [],
        };
        group.ids.push(result.id);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        const { error } = await supabase
          .from("notifications")
          .update({
            push_status: group.status,
            push_attempts: group.attempts,
            pushed_at: group.status === "sent" ? new Date().toISOString() : null,
          })
          .in("id", group.ids);
        if (error) throw new Error(error.message);
      }
    },
  };
}
