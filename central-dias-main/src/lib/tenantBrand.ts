import logoCentral from "@/assets/logo-central.png";
import logoJoTransportes from "@/assets/logo-jo-transportes.png";
import frotakIconAsset from "@/assets/favicon.png";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const JO_TRANSPORTES_TENANT_ID = "ebfa57a2-f639-4e53-a006-3b1493c685a7";

export const frotakIcon = frotakIconAsset;

/** Logo próprio do cliente, quando ele tem um. Os demais usam a marca FrotaK. */
export function tenantLogo(tenant: { id?: string | null; name?: string | null }) {
  if (tenant.id === JO_TRANSPORTES_TENANT_ID) return logoJoTransportes;
  if (tenant.id === DEMO_TENANT_ID || /central\s+transportes/i.test(tenant.name ?? "")) {
    return logoCentral;
  }
  return null;
}
