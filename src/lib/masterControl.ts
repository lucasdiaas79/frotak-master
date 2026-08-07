import { createServerFn } from "@tanstack/react-start";
import { clients as mockClients, type Client } from "@/lib/mock";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabaseAdmin";

export type TenantFeatureKey =
  | "dashboard"
  | "gestao-frota"
  | "historicos"
  | "abastecimentos"
  | "mapa"
  | "veiculos"
  | "motoristas"
  | "cacambas"
  | "clientes"
  | "produtos"
  | "sascar";

export const tenantFeatureCatalog: Array<{ key: TenantFeatureKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "gestao-frota", label: "Gestão de Frota" },
  { key: "historicos", label: "Históricos" },
  { key: "abastecimentos", label: "Abastecimentos" },
  { key: "mapa", label: "Mapa da Frota" },
  { key: "veiculos", label: "Veículos" },
  { key: "motoristas", label: "Motoristas" },
  { key: "cacambas", label: "Caçambas" },
  { key: "clientes", label: "Cadastro de Clientes" },
  { key: "produtos", label: "Produtos" },
  { key: "sascar", label: "Integração Sascar" },
];

export type TenantPermissionMap = Record<string, string[]>;

export type ManagedTenant = {
  id: string;
  tenantId: string;
  slug: string;
  domain: string;
  name: string;
  cnpj: string;
  subscriptionPeriod: string;
  status: "Ativo" | "Suspenso" | "Cancelado";
  loginEmail: string;
  loginPassword: string;
  truckLimit: number;
  users: number;
  drivers: number;
  trailers: number;
  vehicles: number;
  senders: number;
  recipients: number;
  products: number;
  inRouteVehicles: number;
  maintenanceVehicles: number;
  brokenVehicles: number;
  permissions: TenantPermissionMap;
  features: TenantFeatureKey[];
};

export type MasterDashboardSnapshot = {
  tenantCount: number;
  activeTenants: number;
  suspendedTenants: number;
  cancelledTenants: number;
  totalUsers: number;
  totalDrivers: number;
  totalTrailers: number;
  totalVehicles: number;
  totalTruckLimit: number;
  totalSenders: number;
  totalRecipients: number;
  totalProducts: number;
  inRouteVehicles: number;
  maintenanceVehicles: number;
  brokenVehicles: number;
};

type OverviewRow = {
  tenant_id: string;
  slug: string;
  name: string;
  cnpj: string | null;
  subscription_period: string | null;
  truck_limit: number | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  users_count: number | null;
  drivers_count: number | null;
  trailers_count: number | null;
  vehicles_count: number | null;
  senders_count: number | null;
  recipients_count: number | null;
  products_count: number | null;
  in_route_vehicles_count: number | null;
  maintenance_vehicles_count: number | null;
  broken_vehicles_count: number | null;
};

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

type TenantSubscriptionRow = {
  tenant_id: string;
  billing_metadata: Record<string, unknown> | null;
};

type WorkspaceMembershipRow = {
  workspace_id: string;
  user_id: string;
  status: string;
  is_owner: boolean;
};

type ProfileRow = {
  id: string;
  email: string | null;
};

type WorkspaceModuleRow = {
  workspace_id: string;
  enabled: boolean;
  limits: Record<string, unknown> | null;
  modules: { code: string } | null;
};

export type UpsertManagedTenantInput = {
  tenantId?: string;
  companyName: string;
  cnpj: string;
  subscriptionPeriod: string;
  loginEmail: string;
  loginPassword: string;
  truckLimit: number;
  permissions: TenantPermissionMap;
  features: TenantFeatureKey[];
  status?: "Ativo" | "Suspenso" | "Cancelado";
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeTenantStatus(value?: string | null): ManagedTenant["status"] {
  if (value === "suspended" || value === "Suspenso") return "Suspenso";
  if (value === "cancelled" || value === "Cancelado") return "Cancelado";
  return "Ativo";
}

function toTenantDbStatus(value?: ManagedTenant["status"]) {
  if (value === "Suspenso") return "suspended";
  if (value === "Cancelado") return "cancelled";
  return "active";
}

function pickStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parsePermissionMap(value: unknown): TenantPermissionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, actions]) => [key, pickStringArray(actions)]),
  );
}

function parseFeatures(value: unknown): TenantFeatureKey[] {
  const raw = pickStringArray(value);
  const allowed = new Set(tenantFeatureCatalog.map((item) => item.key));
  return raw.filter((item): item is TenantFeatureKey => allowed.has(item as TenantFeatureKey));
}

function buildMockTenant(client: Client): ManagedTenant {
  const slug = slugify(client.name).replace(/^transportadora-/, "") || client.id;

  return {
    id: client.id,
    tenantId: slug === "central-transportes" ? "00000000-0000-0000-0000-000000000001" : client.id,
    slug,
    domain: `${slug}.frotak.app`,
    name: client.name,
    cnpj: client.cnpj,
    subscriptionPeriod: "Mensal",
    status: client.status === "Suspenso" ? "Suspenso" : client.status === "Cancelado" ? "Cancelado" : "Ativo",
    loginEmail: `admin@${slug}.com.br`,
    loginPassword: "123456",
    truckLimit: client.vehicles,
    users: client.users,
    drivers: client.drivers,
    trailers: Math.max(0, Math.round(client.vehicles * 0.8)),
    vehicles: client.vehicles,
    senders: Math.max(0, Math.round(client.freights / 20)),
    recipients: Math.max(0, Math.round(client.freights / 18)),
    products: 6,
    inRouteVehicles: Math.max(0, Math.round(client.vehicles * 0.42)),
    maintenanceVehicles: Math.max(0, Math.round(client.vehicles * 0.08)),
    brokenVehicles: Math.max(0, Math.round(client.vehicles * 0.02)),
    permissions: {},
    features: tenantFeatureCatalog.map((item) => item.key),
  };
}

function fallbackTenants() {
  return mockClients.map(buildMockTenant);
}

function rowToManagedTenant(row: OverviewRow): ManagedTenant {
  const metadata = row.metadata ?? {};

  return {
    id: row.tenant_id,
    tenantId: row.tenant_id,
    slug: row.slug,
    domain:
      typeof metadata.domain === "string" && metadata.domain
        ? metadata.domain
        : `${row.slug}.frotak.app`,
    name: row.name,
    cnpj: row.cnpj ?? "",
    subscriptionPeriod: row.subscription_period ?? "Mensal",
    status: normalizeTenantStatus(row.status),
    loginEmail: typeof metadata.loginEmail === "string" ? metadata.loginEmail : `admin@${row.slug}.com.br`,
    loginPassword:
      typeof metadata.loginPassword === "string" ? metadata.loginPassword : "123456",
    truckLimit: Number(row.truck_limit ?? 0),
    users: Number(row.users_count ?? 0),
    drivers: Number(row.drivers_count ?? 0),
    trailers: Number(row.trailers_count ?? 0),
    vehicles: Number(row.vehicles_count ?? 0),
    senders: Number(row.senders_count ?? 0),
    recipients: Number(row.recipients_count ?? 0),
    products: Number(row.products_count ?? 0),
    inRouteVehicles: Number(row.in_route_vehicles_count ?? 0),
    maintenanceVehicles: Number(row.maintenance_vehicles_count ?? 0),
    brokenVehicles: Number(row.broken_vehicles_count ?? 0),
    permissions: parsePermissionMap(metadata.permissions),
    features: parseFeatures(metadata.features),
  };
}

function modulesToFeatures(modules: WorkspaceModuleRow[]): TenantFeatureKey[] {
  const moduleCodes = new Set(
    modules
      .filter((module) => module.enabled)
      .map((module) => module.modules?.code)
      .filter((code): code is string => Boolean(code)),
  );

  const features = new Set<TenantFeatureKey>();
  if (moduleCodes.has("fleet_core")) {
    [
      "dashboard",
      "gestao-frota",
      "historicos",
      "abastecimentos",
      "mapa",
      "veiculos",
      "motoristas",
      "cacambas",
      "clientes",
      "produtos",
    ].forEach((feature) => features.add(feature as TenantFeatureKey));
  }
  if (moduleCodes.has("frotak_tracking")) features.add("sascar");

  return Array.from(features);
}

function rowToManagedTenantFromTables(input: {
  tenant: TenantRow;
  workspace?: WorkspaceRow;
  subscription?: TenantSubscriptionRow;
  ownerEmail?: string;
  usersCount: number;
  modules: WorkspaceModuleRow[];
}): ManagedTenant {
  const { tenant, workspace, subscription, ownerEmail, usersCount, modules } = input;
  const tenantSettings = tenant.settings ?? {};
  const workspaceSettings = workspace?.settings ?? {};
  const subscriptionMetadata = subscription?.billing_metadata ?? {};
  const fleetModule = modules.find((module) => module.modules?.code === "fleet_core");
  const moduleLimits = fleetModule?.limits ?? {};
  const maxVehicles =
    Number(moduleLimits.max_vehicles ?? workspaceSettings.maxVehicles ?? tenantSettings.maxVehicles ?? 0) || 0;
  const subscriptionPeriod =
    typeof subscriptionMetadata.period === "string"
      ? subscriptionMetadata.period
      : typeof tenantSettings.subscriptionPeriod === "string"
        ? tenantSettings.subscriptionPeriod
        : "Mensal";

  return {
    id: tenant.id,
    tenantId: tenant.id,
    slug: tenant.slug,
    domain:
      typeof tenantSettings.domain === "string" && tenantSettings.domain
        ? tenantSettings.domain
        : `${tenant.slug}.frotak.app`,
    name: tenant.trade_name || tenant.legal_name,
    cnpj: tenant.cnpj ?? "",
    subscriptionPeriod,
    status: normalizeTenantStatus(tenant.status),
    loginEmail: ownerEmail ?? `admin@${tenant.slug}.com.br`,
    loginPassword: "",
    truckLimit: maxVehicles,
    users: usersCount,
    drivers: 0,
    trailers: 0,
    vehicles: 0,
    senders: 0,
    recipients: 0,
    products: 0,
    inRouteVehicles: 0,
    maintenanceVehicles: 0,
    brokenVehicles: 0,
    permissions: {},
    features: modulesToFeatures(modules),
  };
}

function toDashboardSnapshot(tenants: ManagedTenant[]): MasterDashboardSnapshot {
  return tenants.reduce<MasterDashboardSnapshot>(
    (acc, tenant) => {
      acc.tenantCount += 1;
      if (tenant.status === "Ativo") acc.activeTenants += 1;
      if (tenant.status === "Suspenso") acc.suspendedTenants += 1;
      if (tenant.status === "Cancelado") acc.cancelledTenants += 1;
      acc.totalUsers += tenant.users;
      acc.totalDrivers += tenant.drivers;
      acc.totalTrailers += tenant.trailers;
      acc.totalVehicles += tenant.vehicles;
      acc.totalTruckLimit += tenant.truckLimit;
      acc.totalSenders += tenant.senders;
      acc.totalRecipients += tenant.recipients;
      acc.totalProducts += tenant.products;
      acc.inRouteVehicles += tenant.inRouteVehicles;
      acc.maintenanceVehicles += tenant.maintenanceVehicles;
      acc.brokenVehicles += tenant.brokenVehicles;
      return acc;
    },
    {
      tenantCount: 0,
      activeTenants: 0,
      suspendedTenants: 0,
      cancelledTenants: 0,
      totalUsers: 0,
      totalDrivers: 0,
      totalTrailers: 0,
      totalVehicles: 0,
      totalTruckLimit: 0,
      totalSenders: 0,
      totalRecipients: 0,
      totalProducts: 0,
      inRouteVehicles: 0,
      maintenanceVehicles: 0,
      brokenVehicles: 0,
    },
  );
}

async function fetchOverviewRows() {
  if (!hasSupabaseAdminConfig()) {
    return fallbackTenants();
  }

  const supabase = getSupabaseAdmin();
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, slug, legal_name, trade_name, cnpj, status, settings")
    .order("created_at", { ascending: false });

  if (tenantsError) throw tenantsError;
  const tenantRows = (tenants ?? []) as TenantRow[];
  if (!tenantRows.length) return [];

  const tenantIds = tenantRows.map((tenant) => tenant.id);
  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("id, tenant_id, is_default, settings")
    .in("tenant_id", tenantIds);

  if (workspacesError) throw workspacesError;
  const workspaceRows = (workspaces ?? []) as WorkspaceRow[];
  const workspaceIds = workspaceRows.map((workspace) => workspace.id);

  const [
    subscriptionsResult,
    membershipsResult,
    modulesResult,
  ] = await Promise.all([
    supabase
      .from("tenant_subscriptions")
      .select("tenant_id, billing_metadata")
      .in("tenant_id", tenantIds)
      .in("status", ["trial", "active", "past_due", "suspended"]),
    workspaceIds.length
      ? supabase
          .from("workspace_memberships")
          .select("workspace_id, user_id, status, is_owner")
          .in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    workspaceIds.length
      ? supabase
          .from("workspace_modules")
          .select("workspace_id, enabled, limits, modules(code)")
          .in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (modulesResult.error) throw modulesResult.error;

  const memberships = (membershipsResult.data ?? []) as WorkspaceMembershipRow[];
  const ownerUserIds = memberships
    .filter((membership) => membership.is_owner)
    .map((membership) => membership.user_id);
  const { data: profiles, error: profilesError } = ownerUserIds.length
    ? await supabase.from("profiles").select("id, email").in("id", ownerUserIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const subscriptions = (subscriptionsResult.data ?? []) as TenantSubscriptionRow[];
  const modules = (modulesResult.data ?? []) as WorkspaceModuleRow[];
  const profileById = new Map((profiles ?? []).map((profile) => [(profile as ProfileRow).id, profile as ProfileRow]));
  const workspaceByTenantId = new Map<string, WorkspaceRow>();

  workspaceRows.forEach((workspace) => {
    const current = workspaceByTenantId.get(workspace.tenant_id);
    if (!current || workspace.is_default) workspaceByTenantId.set(workspace.tenant_id, workspace);
  });

  return tenantRows.map((tenant) => {
    const workspace = workspaceByTenantId.get(tenant.id);
    const workspaceMemberships = workspace
      ? memberships.filter((membership) => membership.workspace_id === workspace.id)
      : [];
    const ownerMembership = workspaceMemberships.find((membership) => membership.is_owner);
    const ownerEmail = ownerMembership ? profileById.get(ownerMembership.user_id)?.email ?? undefined : undefined;

    return rowToManagedTenantFromTables({
      tenant,
      workspace,
      subscription: subscriptions.find((subscription) => subscription.tenant_id === tenant.id),
      ownerEmail,
      usersCount: workspaceMemberships.filter((membership) => membership.status === "active").length,
      modules: workspace ? modules.filter((module) => module.workspace_id === workspace.id) : [],
    });
  });
}

export const listManagedTenants = createServerFn({ method: "GET" }).handler(async () => {
  return fetchOverviewRows();
});

export const getMasterDashboardSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const tenants = await fetchOverviewRows();
  return toDashboardSnapshot(tenants);
});

export const upsertManagedTenant = createServerFn({ method: "POST" })
  .validator((input: UpsertManagedTenantInput) => input)
  .handler(async ({ data }) => {
    if (!data) {
      throw new Error("Dados do cliente nao foram enviados para o servidor.");
    }

    throw new Error("Fluxo legado de clientes desativado. Use provisionTenant.");
  });
