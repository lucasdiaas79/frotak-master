import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformActor } from "@/core/domain/platform-actor";
import type {
  ActionAudit,
  ClientDirectory,
  DirectoryEntry,
} from "@/modules/control-panel/application/ports";
import type { TeamAction } from "@/modules/control-panel/domain/control-panel";

const PANEL_ACTIONS = [
  "master.infra_restart",
  "master.infra_autoheal",
  "master.database_rows_read",
];

function describeTarget(metadata: Record<string, unknown>) {
  if (typeof metadata.table === "string") {
    return `${String(metadata.database)}: ${String(metadata.schema)}.${metadata.table}`;
  }
  if (typeof metadata.name === "string") return metadata.name;
  if (typeof metadata.enabled === "boolean") {
    return `${String(metadata.role)}: ${metadata.enabled ? "ligado" : "pausado"}`;
  }
  return "";
}

/** A auditoria do painel mora no Central, junto com a do resto do Master. */
export class SupabaseActionAudit implements ActionAudit {
  constructor(private readonly supabase: SupabaseClient) {}

  async record(actor: PlatformActor, action: string, metadata: Record<string, unknown>) {
    const { error } = await this.supabase.from("audit_logs").insert({
      actor_user_id: actor.userId,
      action,
      entity_type: "infrastructure",
      metadata: { ...metadata, actor_email: actor.email, actor_role: actor.role },
    });
    if (error) throw new Error(error.message);
  }

  async recent(limit: number): Promise<TeamAction[]> {
    const { data, error } = await this.supabase
      .from("audit_logs")
      .select("id, created_at, action, metadata")
      .in("action", PANEL_ACTIONS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: row.id as string,
        at: row.created_at as string,
        action: row.action as string,
        actorEmail: String(metadata.actor_email ?? ""),
        target: describeTarget(metadata),
      };
    });
  }
}

export class SupabaseClientDirectory implements ClientDirectory {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(): Promise<DirectoryEntry[]> {
    const { data, error } = await this.supabase
      .from("client_databases")
      .select("slug, client_url, tenants(legal_name, trade_name, status)")
      .returns<
        {
          slug: string;
          client_url: string | null;
          tenants: { legal_name: string; trade_name: string | null; status: string } | null;
        }[]
      >();
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      slug: row.slug,
      name: row.tenants?.trade_name || row.tenants?.legal_name || row.slug,
      tenantStatus: row.tenants?.status ?? null,
      clientUrl: row.client_url,
    }));
  }
}
