import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import type {
  NotificationRuleRepository,
  TenantDirectory,
  TenantOption,
} from "@/modules/notifications/application/ports";
import type { NotificationSource, TriggerKind } from "@/modules/notifications/domain/catalog";
import type {
  NotificationCondition,
  NotificationRule,
  NotificationRuleDraft,
} from "@/modules/notifications/domain/rule";

// Tabela notification_rules (migration 202611260001) com a chave de servico do Master.

const COLUMNS =
  "id, tenant_id, name, description, source, trigger_kind, watch_fields, conditions, title_template, body_template, link_path, audience_roles, push_default, active, updated_at";

export type NotificationRuleRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  source: string;
  trigger_kind: string;
  watch_fields: string[] | null;
  conditions: NotificationCondition[] | null;
  title_template: string;
  body_template: string | null;
  link_path: string | null;
  audience_roles: string[] | null;
  push_default: boolean;
  active: boolean;
  updated_at: string | null;
};

export function ruleFromRow(row: NotificationRuleRow): NotificationRule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    source: row.source as NotificationSource,
    triggerKind: row.trigger_kind as TriggerKind,
    watchFields: row.watch_fields ?? [],
    conditions: row.conditions ?? [],
    titleTemplate: row.title_template,
    bodyTemplate: row.body_template ?? "",
    linkPath: row.link_path,
    audienceRoles: row.audience_roles ?? [],
    pushDefault: row.push_default,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

/** Formato que o banco do cliente recebe em master_sync_notification_rules. */
export function ruleToSyncRow(rule: NotificationRule) {
  return {
    id: rule.id,
    tenant_id: rule.tenantId,
    name: rule.name,
    description: rule.description,
    source: rule.source,
    trigger_kind: rule.triggerKind,
    watch_fields: rule.watchFields,
    conditions: rule.conditions,
    title_template: rule.titleTemplate,
    body_template: rule.bodyTemplate,
    link_path: rule.linkPath,
    audience_roles: rule.audienceRoles,
    push_default: rule.pushDefault,
    active: rule.active,
  };
}

function fail(error: PostgrestError): never {
  const missingTable =
    error.code === "42P01" ||
    (error.code === "PGRST205" && /notification_rules/.test(error.message ?? ""));
  if (missingTable) {
    throw new DomainError(
      "UNAVAILABLE",
      "Notificações indisponíveis: aplique a migration 202611260001_notifications no banco.",
    );
  }
  throw new Error(error.message);
}

export class SupabaseNotificationRuleRepository implements NotificationRuleRepository {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async list() {
    const { data, error } = await this.supabase
      .from("notification_rules")
      .select(COLUMNS)
      .order("created_at", { ascending: true });
    if (error) fail(error);
    return ((data ?? []) as NotificationRuleRow[]).map(ruleFromRow);
  }

  async find(id: string) {
    const { data, error } = await this.supabase
      .from("notification_rules")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle<NotificationRuleRow>();
    if (error) fail(error);
    return data ? ruleFromRow(data) : null;
  }

  async save(draft: NotificationRuleDraft, actorUserId: string) {
    const values = {
      tenant_id: draft.tenantId,
      name: draft.name,
      description: draft.description,
      source: draft.source,
      trigger_kind: draft.triggerKind,
      watch_fields: draft.watchFields,
      conditions: draft.conditions,
      title_template: draft.titleTemplate,
      body_template: draft.bodyTemplate,
      link_path: draft.linkPath,
      audience_roles: draft.audienceRoles,
      push_default: draft.pushDefault,
      active: draft.active,
      updated_by: actorUserId,
    };
    const query = draft.id
      ? this.supabase.from("notification_rules").update(values).eq("id", draft.id)
      : this.supabase.from("notification_rules").insert({ ...values, created_by: actorUserId });
    const { data, error } = await query.select(COLUMNS).single<NotificationRuleRow>();
    if (error) fail(error);
    return ruleFromRow(data);
  }

  async setActive(id: string, active: boolean, actorUserId: string) {
    const { data, error } = await this.supabase
      .from("notification_rules")
      .update({ active, updated_by: actorUserId })
      .eq("id", id)
      .select(COLUMNS)
      .single<NotificationRuleRow>();
    if (error) fail(error);
    return ruleFromRow(data);
  }

  async remove(id: string) {
    const { error } = await this.supabase.from("notification_rules").delete().eq("id", id);
    if (error) fail(error);
  }
}

type TenantRow = { id: string; legal_name: string; trade_name: string | null };

export class SupabaseTenantDirectory implements TenantDirectory {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async list(): Promise<TenantOption[]> {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("id, legal_name, trade_name")
      .order("legal_name", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as TenantRow[]).map((row) => ({
      id: row.id,
      name: row.trade_name?.trim() || row.legal_name,
    }));
  }
}
