import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinancialChangeFeed } from "@/modules/financial/application/ports";

/** Tempo real do Supabase sobre financial_documents e financial_integration_jobs. */
export class SupabaseFinancialChangeFeed implements FinancialChangeFeed {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  watch(
    workspaceId: string,
    handlers: { onChange(): void; onReconnected(): void; onDisconnected(): void },
  ) {
    let subscribedOnce = false;
    const workspaceFilter = `workspace_id=eq.${workspaceId}`;
    const channel = this.supabase
      .channel(`financial-workspace:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_documents", filter: workspaceFilter },
        () => handlers.onChange(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "financial_integration_jobs",
          filter: workspaceFilter,
        },
        () => handlers.onChange(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (subscribedOnce) handlers.onReconnected();
          subscribedOnce = true;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          handlers.onDisconnected();
        }
      });

    return () => {
      void this.supabase.removeChannel(channel);
    };
  }
}
