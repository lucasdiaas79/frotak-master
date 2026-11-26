import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PushSubscription,
  PushSubscriptionStore,
} from "@/modules/frotak-ai/application/ports";

// O aparelho de cada usuario fica em frotak_push_subscriptions, gravado so pelo servidor
// (service role).
const TABLE = "frotak_push_subscriptions";

type SubscriptionRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export class SupabasePushSubscriptions implements PushSubscriptionStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async save(input: {
    tenantId: string;
    workspaceId: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string;
  }) {
    const { error } = await this.supabase.from(TABLE).upsert(
      {
        tenant_id: input.tenantId,
        workspace_id: input.workspaceId,
        user_id: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent || null,
        last_error: null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
  }

  async removeForUser(userId: string, endpoint: string) {
    const { error } = await this.supabase
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw new Error(error.message);
  }

  async listAll(): Promise<PushSubscription[]> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select("id, tenant_id, workspace_id, user_id, endpoint, p256dh, auth")
      .limit(5000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as SubscriptionRow[]).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
    }));
  }

  async listActiveMembers(workspaceId: string) {
    const { data } = await this.supabase
      .from("workspace_memberships")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    return new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
  }

  async remove(id: string) {
    await this.supabase.from(TABLE).delete().eq("id", id);
  }

  async markSent(id: string) {
    await this.supabase
      .from(TABLE)
      .update({ last_sent_at: new Date().toISOString(), last_error: null })
      .eq("id", id);
  }

  async markFailed(id: string, status: number | undefined) {
    await this.supabase
      .from(TABLE)
      .update({ last_error: `HTTP ${status}` })
      .eq("id", id);
  }
}
