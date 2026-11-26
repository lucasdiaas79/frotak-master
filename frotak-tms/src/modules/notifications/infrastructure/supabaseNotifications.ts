import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationFeed,
  NotificationPreferenceStore,
  NotificationStore,
} from "@/modules/notifications/application/ports";
import type {
  AppNotification,
  NotificationPreference,
  NotificationRuleSummary,
} from "@/modules/notifications/domain/notification";

// No navegador, com a sessao do usuario: o RLS do banco so deixa ver, marcar e apagar os proprios
// avisos e ler as regras ativas da propria empresa.

const COLUMNS = "id, rule_id, title, body, link_path, created_at, read_at";

type NotificationRow = {
  id: string;
  rule_id: string | null;
  title: string;
  body: string | null;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
};

export function notificationFromRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    ruleId: row.rule_id,
    title: row.title,
    body: row.body ?? "",
    linkPath: row.link_path,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export class SupabaseNotificationStore implements NotificationStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async list(limit: number) {
    const { data, error } = await this.supabase
      .from("notifications")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as NotificationRow[]).map(notificationFromRow);
  }

  async markRead(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await this.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .is("read_at", null);
    if (error) throw new Error(error.message);
  }

  async markAllRead() {
    const { error } = await this.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(error.message);
  }

  async remove(id: string) {
    const { error } = await this.supabase.from("notifications").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}

export class SupabaseNotificationFeed implements NotificationFeed {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  subscribe(
    userId: string,
    handlers: {
      onInsert: (notification: AppNotification) => void;
      onStatus?: (live: boolean) => void;
    },
  ) {
    const channel = this.supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => handlers.onInsert(notificationFromRow(payload.new as NotificationRow)),
      )
      .subscribe((status) => handlers.onStatus?.(status === "SUBSCRIBED"));
    return () => {
      void this.supabase.removeChannel(channel);
    };
  }
}

type RuleRow = { id: string; name: string; description: string | null; push_default: boolean };
type PreferenceRow = { rule_id: string; enabled: boolean; push: boolean };

export class SupabaseNotificationPreferences implements NotificationPreferenceStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async listRules(): Promise<NotificationRuleSummary[]> {
    const { data, error } = await this.supabase
      .from("notification_rules")
      .select("id, name, description, push_default")
      .eq("active", true);
    if (error) throw new Error(error.message);
    return ((data ?? []) as RuleRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      pushDefault: row.push_default,
    }));
  }

  async listPreferences(): Promise<NotificationPreference[]> {
    const { data, error } = await this.supabase
      .from("notification_preferences")
      .select("rule_id, enabled, push");
    if (error) throw new Error(error.message);
    return ((data ?? []) as PreferenceRow[]).map((row) => ({
      ruleId: row.rule_id,
      enabled: row.enabled,
      push: row.push,
    }));
  }

  async save(userId: string, preference: NotificationPreference) {
    const { error } = await this.supabase.from("notification_preferences").upsert(
      {
        user_id: userId,
        rule_id: preference.ruleId,
        enabled: preference.enabled,
        push: preference.push,
      },
      { onConflict: "user_id,rule_id" },
    );
    if (error) throw new Error(error.message);
  }
}
