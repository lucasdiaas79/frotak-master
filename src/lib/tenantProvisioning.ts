import { createServerFn } from "@tanstack/react-start";

export type ProvisionTenantInput = {
  tenantId: string;
  companyName: string;
  cnpj: string;
  subscriptionPeriod: string;
  truckLimit: number;
  email: string;
  password: string;
};

export type ProvisionTenantResult =
  | { status: "skipped"; reason: string }
  | { status: "ok"; tenantId: string; userId?: string; email: string };

export const provisionTenant = createServerFn({ method: "POST" })
  .validator((input: ProvisionTenantInput) => input)
  .handler(async ({ data }): Promise<ProvisionTenantResult> => {
    const endpoint = process.env.FROTAK_PROVISION_TENANT_URL;
    const token = process.env.FROTAK_MASTER_PROVISION_TOKEN;

    if (!endpoint || !token) {
      return {
        status: "skipped",
        reason: "FROTAK_PROVISION_TENANT_URL/FROTAK_MASTER_PROVISION_TOKEN not configured",
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      tenantId?: string;
      userId?: string;
      email?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Falha ao provisionar tenant do cliente.");
    }

    return {
      status: "ok",
      tenantId: payload.tenantId || data.tenantId,
      userId: payload.userId,
      email: payload.email || data.email,
    };
  });
