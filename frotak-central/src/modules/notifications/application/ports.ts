import type {
  DistributionReport,
  NotificationRule,
  NotificationRuleDraft,
  TenantOption,
} from "@/modules/notifications/domain/rule";

export type { DistributionReport, TenantOption } from "@/modules/notifications/domain/rule";

/** Regras gravadas no banco do Master (no banco unico, o mesmo banco dos clientes). */
export interface NotificationRuleRepository {
  list(): Promise<NotificationRule[]>;
  find(id: string): Promise<NotificationRule | null>;
  save(draft: NotificationRuleDraft, actorUserId: string): Promise<NotificationRule>;
  setActive(id: string, active: boolean, actorUserId: string): Promise<NotificationRule>;
  remove(id: string): Promise<void>;
}

/** Leva as regras para onde elas rodam. No banco unico nao ha nada a levar. */
export interface NotificationRuleDistributor {
  distribute(rules: NotificationRule[]): Promise<DistributionReport>;
}

export interface TenantDirectory {
  list(): Promise<TenantOption[]>;
}
