import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantSettingsReader } from "@/modules/driver-app/application/ports";

export class SupabaseTenantSettings implements TenantSettingsReader {
  constructor(private readonly supabase: SupabaseClient) {}

  async getTenantSettings(tenantId: string) {
    const { data, error } = await this.supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle<{ settings: unknown }>();
    if (error) throw error;
    return data?.settings ?? null;
  }
}
