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
  const { data, error } = await supabase.rpc("get_master_tenant_overview");
  if (error) throw error;

  return ((data ?? []) as OverviewRow[]).map(rowToManagedTenant);
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

    if (!hasSupabaseAdminConfig()) {
      return {
        status: "skipped" as const,
        reason: "Supabase admin env vars are not configured.",
      };
    }

    try {
      const supabase = getSupabaseAdmin();
      const tenantId = data.tenantId || crypto.randomUUID();
      const email = data.loginEmail.trim().toLowerCase();
      const password = data.loginPassword.trim();
      const companyName = data.companyName.trim();

      const existingUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (existingUsers.error) throw existingUsers.error;

      const existingUser = existingUsers.data.users.find(
        (user) => user.email?.toLowerCase() === email,
      );

      const authUser = existingUser
        ? await supabase.auth.admin.updateUserById(existingUser.id, {
            email,
            password,
            email_confirm: true,
            user_metadata: {
              ...(existingUser.user_metadata ?? {}),
              tenant_id: tenantId,
              tenant_name: companyName,
              role: "admin",
            },
          })
        : await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              tenant_id: tenantId,
              tenant_name: companyName,
              role: "admin",
            },
          });

      if (authUser.error) throw authUser.error;

      const { error: provisionError } = await supabase.rpc("provision_client_profile", {
        p_tenant_id: tenantId,
        p_company_name: companyName,
        p_cnpj: data.cnpj.trim() || null,
        p_subscription_period: data.subscriptionPeriod.trim() || null,
        p_truck_limit: Math.max(0, Number(data.truckLimit || 0)),
        p_user_id: authUser.data.user.id,
        p_user_email: email,
        p_user_name: `Admin ${companyName}`,
      });

      if (provisionError) throw provisionError;

      const { data: currentTenant, error: tenantReadError } = await supabase
        .from("tenants")
        .select("metadata")
        .eq("id", tenantId)
        .maybeSingle();

      if (tenantReadError) throw tenantReadError;

      const currentMetadata =
        currentTenant?.metadata && typeof currentTenant.metadata === "object"
          ? (currentTenant.metadata as Record<string, unknown>)
          : {};

      const nextMetadata = {
        ...currentMetadata,
        loginEmail: email,
        loginPassword: password,
        permissions: data.permissions,
        features: data.features,
        masterManagedAt: new Date().toISOString(),
      };

      const { error: tenantUpdateError } = await supabase
        .from("tenants")
        .update({
          name: companyName,
          cnpj: data.cnpj.trim() || null,
          subscription_period: data.subscriptionPeriod.trim() || null,
          truck_limit: Math.max(0, Number(data.truckLimit || 0)),
          status: toTenantDbStatus(data.status),
          metadata: nextMetadata,
        })
        .eq("id", tenantId);

      if (tenantUpdateError) throw tenantUpdateError;

      const tenants = await fetchOverviewRows();
      const tenant = tenants.find((item) => item.tenantId === tenantId);

      return {
        status: "ok" as const,
        tenant: tenant ?? null,
        tenantId,
        userId: authUser.data.user.id,
      };
    } catch (error) {
      console.error("upsertManagedTenant failed", {
        companyName: data.companyName,
        loginEmail: data.loginEmail,
        tenantId: data.tenantId ?? null,
        error,
      });
      throw error;
    }
  });
