import type { TenantEntitlements } from "@/modules/entitlements/domain/entitlements";

export type TenantStatus = "Provisionando" | "Trial" | "Ativo" | "Suspenso" | "Cancelado";

export type TenantUsage = {
  users: number;
  vehicles: number;
  vehiclesInRoute: number;
  vehiclesInMaintenance: number;
  vehiclesBroken: number;
  drivers: number;
  trailers: number;
  senders: number;
  recipients: number;
  products: number;
};

/** Cliente (tenant) como o Master enxerga: cadastro, contrato, liberações e uso. */
export type Tenant = {
  id: string;
  slug: string;
  name: string;
  legalName: string;
  cnpj: string;
  domain: string;
  status: TenantStatus;
  subscriptionPeriod: string;
  ownerEmail: string | null;
  vehicleLimit: number;
  usage: TenantUsage;
  entitlements: TenantEntitlements;
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

const statusByDbValue: Record<string, TenantStatus> = {
  provisioning: "Provisionando",
  trial: "Trial",
  active: "Ativo",
  suspended: "Suspenso",
  cancelled: "Cancelado",
};

export function tenantStatusFromDb(value: string | null | undefined): TenantStatus {
  return statusByDbValue[value ?? ""] ?? "Provisionando";
}

/** Cliente com acesso valendo: o app só libera módulos para tenants ativos ou em trial. */
export function isTenantOperational(status: TenantStatus) {
  return status === "Ativo" || status === "Trial";
}

export const emptyUsage = (): TenantUsage => ({
  users: 0,
  vehicles: 0,
  vehiclesInRoute: 0,
  vehiclesInMaintenance: 0,
  vehiclesBroken: 0,
  drivers: 0,
  trailers: 0,
  senders: 0,
  recipients: 0,
  products: 0,
});

export const emptyDashboardSnapshot = (): MasterDashboardSnapshot => ({
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
});

export function summarizeTenants(tenants: Tenant[]): MasterDashboardSnapshot {
  return tenants.reduce((acc, tenant) => {
    acc.tenantCount += 1;
    if (isTenantOperational(tenant.status)) acc.activeTenants += 1;
    if (tenant.status === "Suspenso") acc.suspendedTenants += 1;
    if (tenant.status === "Cancelado") acc.cancelledTenants += 1;
    acc.totalUsers += tenant.usage.users;
    acc.totalDrivers += tenant.usage.drivers;
    acc.totalTrailers += tenant.usage.trailers;
    acc.totalVehicles += tenant.usage.vehicles;
    acc.totalTruckLimit += tenant.vehicleLimit;
    acc.totalSenders += tenant.usage.senders;
    acc.totalRecipients += tenant.usage.recipients;
    acc.totalProducts += tenant.usage.products;
    acc.inRouteVehicles += tenant.usage.vehiclesInRoute;
    acc.maintenanceVehicles += tenant.usage.vehiclesInMaintenance;
    acc.brokenVehicles += tenant.usage.vehiclesBroken;
    return acc;
  }, emptyDashboardSnapshot());
}
