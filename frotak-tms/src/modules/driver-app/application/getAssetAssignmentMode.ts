import {
  normalizeAssetAssignmentMode,
  type AssetAssignmentMode,
} from "@/modules/driver-app/domain/assetAssignmentMode";
import type { TenantSettingsReader } from "@/modules/driver-app/application/ports";

/** Sem acesso as configuracoes do tenant, vale o modo padrao (veiculo fixo). */
export async function getAssetAssignmentMode(
  settings: TenantSettingsReader,
  tenantId: string,
): Promise<AssetAssignmentMode> {
  try {
    return normalizeAssetAssignmentMode(await settings.getTenantSettings(tenantId));
  } catch (error) {
    console.warn("[driverApp] tenant settings unavailable", error);
    return "fixed_vehicle";
  }
}
