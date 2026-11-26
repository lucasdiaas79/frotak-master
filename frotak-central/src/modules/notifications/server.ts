import { createServerFn } from "@tanstack/react-start";
import { DomainError } from "@/core/domain/domain-error";
import { platformAuth } from "@/core/auth/platform-auth";
import { isClientDatabaseMode } from "@/core/server/agent-client";
import { runUseCase } from "@/core/server/run-use-case";
import { getSupabaseAdmin } from "@/core/server/supabase-admin";
import {
  deleteNotificationRule,
  listNotificationRules,
  saveNotificationRule,
  setNotificationRuleActive,
  syncNotificationRules,
  type NotificationRuleDeps,
} from "@/modules/notifications/application/notification-rules";
import type { NotificationRuleDraft } from "@/modules/notifications/domain/rule";
import {
  AgentNotificationRuleDistributor,
  sameDatabaseDistributor,
} from "@/modules/notifications/infrastructure/agent-rule-distributor";
import {
  SupabaseNotificationRuleRepository,
  SupabaseTenantDirectory,
} from "@/modules/notifications/infrastructure/supabase-notification-rules";

// Regras de notificacao: a equipe FrotaK cria no Master; os usuarios do TMS recebem.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deps(): NotificationRuleDeps {
  const supabase = getSupabaseAdmin();
  return {
    rules: new SupabaseNotificationRuleRepository(supabase),
    tenants: new SupabaseTenantDirectory(supabase),
    distributor: isClientDatabaseMode()
      ? new AgentNotificationRuleDistributor(supabase)
      : sameDatabaseDistributor,
  };
}

function requireId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new DomainError("INVALID_INPUT", "Regra inválida.");
  }
  return value;
}

export const listNotificationRulesFn = createServerFn({ method: "GET" })
  .middleware([platformAuth])
  .handler(async ({ context }) =>
    runUseCase("notifications.list", () => listNotificationRules(deps(), context.actor)),
  );

export const saveNotificationRuleFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: NotificationRuleDraft) => {
    if (!input || typeof input !== "object") {
      throw new DomainError("INVALID_INPUT", "Regra incompleta.");
    }
    return { ...input, id: input.id ? requireId(input.id) : undefined };
  })
  .handler(async ({ data, context }) =>
    runUseCase("notifications.save", () => saveNotificationRule(deps(), context.actor, data)),
  );

export const setNotificationRuleActiveFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { id: string; active: boolean }) => {
    if (typeof input?.active !== "boolean") {
      throw new DomainError("INVALID_INPUT", "Pedido incompleto.");
    }
    return { id: requireId(input.id), active: input.active };
  })
  .handler(async ({ data, context }) =>
    runUseCase("notifications.toggle", () =>
      setNotificationRuleActive(deps(), context.actor, data),
    ),
  );

export const deleteNotificationRuleFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .validator((input: { id: string }) => ({ id: requireId(input?.id) }))
  .handler(async ({ data, context }) =>
    runUseCase("notifications.delete", () => deleteNotificationRule(deps(), context.actor, data)),
  );

export const syncNotificationRulesFn = createServerFn({ method: "POST" })
  .middleware([platformAuth])
  .handler(async ({ context }) =>
    runUseCase("notifications.sync", () => syncNotificationRules(deps(), context.actor)),
  );
