import { DomainError } from "@/core/domain/domain-error";
import {
  assertCanOperate,
  assertSuperAdmin,
  type PlatformActor,
} from "@/core/domain/platform-actor";
import type {
  DistributionReport,
  NotificationRuleDistributor,
  NotificationRuleRepository,
  TenantDirectory,
} from "@/modules/notifications/application/ports";
import {
  validateRule,
  type NotificationRule,
  type NotificationRuleDraft,
} from "@/modules/notifications/domain/rule";

export type NotificationRuleDeps = {
  rules: NotificationRuleRepository;
  distributor: NotificationRuleDistributor;
  tenants: TenantDirectory;
};

export type RuleChangeResult = { rule: NotificationRule | null; distribution: DistributionReport };

/** Regra para todos os clientes atinge todo mundo de uma vez: so o administrador do Master. */
function assertCanTouch(actor: PlatformActor, tenantId: string | null) {
  assertCanOperate(actor);
  if (tenantId === null) assertSuperAdmin(actor);
}

async function distributeAll(deps: NotificationRuleDeps) {
  return deps.distributor.distribute(await deps.rules.list());
}

/** Qualquer papel do Master le as regras e a lista de clientes para escolher o alcance. */
export async function listNotificationRules(deps: NotificationRuleDeps, actor: PlatformActor) {
  void actor;
  const [rules, tenants] = await Promise.all([deps.rules.list(), deps.tenants.list()]);
  return { rules, tenants };
}

export async function saveNotificationRule(
  deps: NotificationRuleDeps,
  actor: PlatformActor,
  draft: NotificationRuleDraft,
): Promise<RuleChangeResult> {
  const rule = validateRule(draft);
  assertCanTouch(actor, rule.tenantId);
  if (rule.id) {
    const current = await deps.rules.find(rule.id);
    if (!current) throw new DomainError("NOT_FOUND", "Regra não encontrada.");
    // Tirar uma regra de "todos os clientes" tambem atinge todos.
    if (current.tenantId === null) assertSuperAdmin(actor);
  }
  if (rule.tenantId) {
    const tenants = await deps.tenants.list();
    if (!tenants.some((tenant) => tenant.id === rule.tenantId)) {
      throw new DomainError("NOT_FOUND", "Cliente não encontrado.");
    }
  }
  const saved = await deps.rules.save(rule, actor.userId);
  return { rule: saved, distribution: await distributeAll(deps) };
}

export async function setNotificationRuleActive(
  deps: NotificationRuleDeps,
  actor: PlatformActor,
  input: { id: string; active: boolean },
): Promise<RuleChangeResult> {
  const current = await deps.rules.find(input.id);
  if (!current) throw new DomainError("NOT_FOUND", "Regra não encontrada.");
  assertCanTouch(actor, current.tenantId);
  const saved = await deps.rules.setActive(input.id, input.active, actor.userId);
  return { rule: saved, distribution: await distributeAll(deps) };
}

export async function deleteNotificationRule(
  deps: NotificationRuleDeps,
  actor: PlatformActor,
  input: { id: string },
): Promise<RuleChangeResult> {
  const current = await deps.rules.find(input.id);
  if (!current) throw new DomainError("NOT_FOUND", "Regra não encontrada.");
  assertCanTouch(actor, current.tenantId);
  await deps.rules.remove(input.id);
  return { rule: null, distribution: await distributeAll(deps) };
}

/** Reenvia todas as regras para todos os clientes (ex.: um cliente estava fora do ar). */
export async function syncNotificationRules(deps: NotificationRuleDeps, actor: PlatformActor) {
  assertCanOperate(actor);
  return distributeAll(deps);
}
