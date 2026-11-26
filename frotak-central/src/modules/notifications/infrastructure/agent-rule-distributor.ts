import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import { agentRequest } from "@/core/server/agent-client";
import type {
  DistributionReport,
  NotificationRuleDistributor,
} from "@/modules/notifications/application/ports";
import { rulesForTenant, type NotificationRule } from "@/modules/notifications/domain/rule";
import { ruleToSyncRow } from "@/modules/notifications/infrastructure/supabase-notification-rules";

/**
 * Banco por cliente: quem avalia as regras e o banco de cada cliente. Cada um recebe as regras
 * gerais e as dele, pelo agente da VPS de banco. Cliente fora do ar nao impede os outros; fica no
 * relatorio e recebe na proxima gravacao (ou no botao "Reenviar para os clientes").
 */
export class AgentNotificationRuleDistributor implements NotificationRuleDistributor {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async distribute(rules: NotificationRule[]): Promise<DistributionReport> {
    const { data, error } = await this.supabase.from("client_databases").select("slug, tenant_id");
    if (error) throw new Error(error.message);
    const report: DistributionReport = { clients: 0, failures: [] };
    for (const client of (data ?? []) as Array<{ slug: string; tenant_id: string }>) {
      try {
        await agentRequest("POST", `/clients/${client.slug}/notification-rules`, {
          rules: rulesForTenant(rules, client.tenant_id).map(ruleToSyncRow),
        });
        report.clients += 1;
      } catch (reason) {
        report.failures.push({
          client: client.slug,
          message:
            reason instanceof DomainError ? reason.message : "O servidor de bancos não respondeu.",
        });
      }
    }
    return report;
  }
}

/** Banco unico: as regras ja estao no banco que avalia. */
export const sameDatabaseDistributor: NotificationRuleDistributor = {
  distribute: async () => ({ clients: 0, failures: [] }),
};
