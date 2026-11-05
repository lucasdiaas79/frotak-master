import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingCatalogSchema,
  loadTenantEntitlements,
} from "@/modules/entitlements/infrastructure/supabase-entitlement-repository";
import type { TenantRepository } from "@/modules/tenants/application/tenant-repository";
import type { ClientData } from "@/modules/tenants/infrastructure/agent-client-data";
import {
  emptyUsage,
  tenantStatusFromDb,
  type Tenant,
  type TenantUsage,
} from "@/modules/tenants/domain/tenant";

type TenantRow = {
  id: string;
  slug: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  status: string | null;
  settings: Record<string, unknown> | null;
};

type WorkspaceRow = {
  id: string;
  tenant_id: string;
  is_default: boolean;
  settings: Record<string, unknown> | null;
};

type SubscriptionRow = {
  tenant_id: string;
  billing_metadata: Record<string, unknown> | null;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
};

type FleetLimitRow = {
  workspace_id: string;
  limits: Record<string, unknown> | null;
};

type UsageRow = {
  tenant_id: string;
  vehicles: number;
  vehicles_in_route: number;
  vehicles_in_maintenance: number;
  vehicles_broken: number;
  drivers: number;
  trailers: number;
  senders: number;
  recipients: number;
  products: number;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class SupabaseTenantRepository implements TenantRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    /** Banco por cliente: dono e uso vêm do banco de cada um, não do Central. */
    private readonly clientData?: () => Promise<Map<string, ClientData>>,
  ) {}

  async list(): Promise<Tenant[]> {
    const { data: tenantData, error: tenantsError } = await this.supabase
      .from("tenants")
      .select("id, slug, legal_name, trade_name, cnpj, status, settings")
      .order("created_at", { ascending: false });
    if (tenantsError) throw tenantsError;

    const tenants = (tenantData ?? []) as TenantRow[];
    if (!tenants.length) return [];
    const tenantIds = tenants.map((tenant) => tenant.id);

    const { data: workspaceData, error: workspacesError } = await this.supabase
      .from("workspaces")
      .select("id, tenant_id, is_default, settings")
      .in("tenant_id", tenantIds);
    if (workspacesError) throw workspacesError;

    const workspaceByTenant = new Map<string, WorkspaceRow>();
    for (const workspace of (workspaceData ?? []) as WorkspaceRow[]) {
      const current = workspaceByTenant.get(workspace.tenant_id);
      if (!current || workspace.is_default) workspaceByTenant.set(workspace.tenant_id, workspace);
    }
    const workspaceIds = [...workspaceByTenant.values()].map((workspace) => workspace.id);

    const [subscriptions, memberships, fleetLimits, usage, entitlements, clients] =
      await Promise.all([
        this.subscriptions(tenantIds),
        this.memberships(workspaceIds),
        this.fleetLimits(workspaceIds),
        this.clientData ? new Map<string, TenantUsage>() : this.usage(),
        loadTenantEntitlements(this.supabase, tenantIds),
        this.clientData?.(),
      ]);
    const ownerEmails = await this.ownerEmails(memberships);

    return tenants.map((tenant) => {
      const workspace = workspaceByTenant.get(tenant.id);
      const tenantSettings = tenant.settings ?? {};
      const workspaceMembers = workspace
        ? memberships.filter((membership) => membership.workspace_id === workspace.id)
        : [];
      const owner = workspaceMembers.find((membership) => membership.is_owner);
      const client = clients?.get(tenant.slug);
      const billing = subscriptions.get(tenant.id) ?? {};
      const fleetLimit = workspace ? fleetLimits.get(workspace.id) : undefined;
      const vehicleLimit =
        Number(
          fleetLimit?.max_vehicles ??
            workspace?.settings?.maxVehicles ??
            tenantSettings.maxVehicles ??
            0,
        ) || 0;

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.trade_name || tenant.legal_name,
        legalName: tenant.legal_name,
        cnpj: tenant.cnpj ?? "",
        domain: client?.clientUrl
          ? new URL(client.clientUrl).host
          : (text(tenantSettings.domain) ?? `${tenant.slug}.frotak.app`),
        status: tenantStatusFromDb(tenant.status),
        subscriptionPeriod:
          text(billing.period) ?? text(tenantSettings.subscriptionPeriod) ?? "Mensal",
        ownerEmail: client
          ? client.ownerEmail
          : owner
            ? (ownerEmails.get(owner.user_id) ?? null)
            : null,
        vehicleLimit,
        usage: client
          ? client.usage
          : {
              ...(usage.get(tenant.id) ?? emptyUsage()),
              users: workspaceMembers.filter((membership) => membership.status === "active").length,
            },
        entitlements: entitlements.get(tenant.id) ?? { products: [], modules: [] },
      };
    });
  }

  private async subscriptions(tenantIds: string[]) {
    const { data, error } = await this.supabase
      .from("tenant_subscriptions")
      .select("tenant_id, billing_metadata")
      .in("tenant_id", tenantIds)
      .in("status", ["trial", "active", "past_due", "suspended"]);
    if (error) throw error;
    return new Map(
      ((data ?? []) as SubscriptionRow[]).map((row) => [row.tenant_id, row.billing_metadata ?? {}]),
    );
  }

  private async memberships(workspaceIds: string[]) {
    if (!workspaceIds.length) return [];
    const { data, error } = await this.supabase
      .from("workspace_memberships")
      .select("workspace_id, user_id, status, is_owner")
      .in("workspace_id", workspaceIds);
    if (error) throw error;
    return (data ?? []) as MembershipRow[];
  }

  private async ownerEmails(memberships: MembershipRow[]) {
    const ownerIds = memberships.filter((row) => row.is_owner).map((row) => row.user_id);
    if (!ownerIds.length) return new Map<string, string>();
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, email")
      .in("id", ownerIds);
    if (error) throw error;
    return new Map(
      ((data ?? []) as Array<{ id: string; email: string | null }>)
        .filter((profile) => profile.email)
        .map((profile) => [profile.id, profile.email as string]),
    );
  }

  private async fleetLimits(workspaceIds: string[]) {
    if (!workspaceIds.length) return new Map<string, Record<string, unknown>>();
    const { data, error } = await this.supabase
      .from("workspace_modules")
      .select("workspace_id, limits, modules!inner(code)")
      .in("workspace_id", workspaceIds)
      .eq("modules.code", "fleet_core");
    if (error) throw error;
    return new Map(
      ((data ?? []) as FleetLimitRow[]).map((row) => [row.workspace_id, row.limits ?? {}]),
    );
  }

  private async usage() {
    const { data, error } = await this.supabase.rpc("master_tenant_usage");
    if (error) {
      if (isMissingCatalogSchema(error)) return new Map<string, TenantUsage>();
      throw error;
    }
    return new Map(
      ((data ?? []) as UsageRow[]).map((row) => [
        row.tenant_id,
        {
          users: 0,
          vehicles: Number(row.vehicles),
          vehiclesInRoute: Number(row.vehicles_in_route),
          vehiclesInMaintenance: Number(row.vehicles_in_maintenance),
          vehiclesBroken: Number(row.vehicles_broken),
          drivers: Number(row.drivers),
          trailers: Number(row.trailers),
          senders: Number(row.senders),
          recipients: Number(row.recipients),
          products: Number(row.products),
        },
      ]),
    );
  }
}
