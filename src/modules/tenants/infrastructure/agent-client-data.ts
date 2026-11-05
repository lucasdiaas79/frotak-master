import type { SupabaseClient } from "@supabase/supabase-js";
import { agentRequest } from "@/core/server/agent-client";
import { emptyUsage, type TenantUsage } from "@/modules/tenants/domain/tenant";

export type ClientData = {
  ownerEmail: string | null;
  clientUrl: string | null;
  usage: TenantUsage;
};

type UsageRow = {
  vehicles?: number;
  vehicles_in_route?: number;
  vehicles_in_maintenance?: number;
  vehicles_broken?: number;
  drivers?: number;
  trailers?: number;
  senders?: number;
  recipients?: number;
  products?: number;
};

type AgentUsage = Record<
  string,
  { usage?: UsageRow | null; users?: number; ownerEmail?: string | null } | null
>;

/** O uso de cada cliente mora no banco dele: quem soma é o agente. Sem ele, a lista segue sem os números. */
export async function loadClientData(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("client_databases")
    .select("slug, owner_email, client_url");
  if (error) throw error;

  const usage = await agentRequest<AgentUsage>("GET", "/clients/usage").catch((failure) => {
    console.error("[tenants] uso dos clientes indisponivel", failure);
    return {} as AgentUsage;
  });

  const rows = (data ?? []) as Array<{
    slug: string;
    owner_email: string | null;
    client_url: string | null;
  }>;
  return new Map<string, ClientData>(
    rows.map((row) => {
      const client = usage[row.slug];
      const counts = client?.usage;
      return [
        row.slug,
        {
          ownerEmail: client?.ownerEmail ?? row.owner_email,
          clientUrl: row.client_url,
          usage: counts
            ? {
                users: Number(client?.users ?? 0),
                vehicles: Number(counts.vehicles ?? 0),
                vehiclesInRoute: Number(counts.vehicles_in_route ?? 0),
                vehiclesInMaintenance: Number(counts.vehicles_in_maintenance ?? 0),
                vehiclesBroken: Number(counts.vehicles_broken ?? 0),
                drivers: Number(counts.drivers ?? 0),
                trailers: Number(counts.trailers ?? 0),
                senders: Number(counts.senders ?? 0),
                recipients: Number(counts.recipients ?? 0),
                products: Number(counts.products ?? 0),
              }
            : emptyUsage(),
        },
      ];
    }),
  );
}
