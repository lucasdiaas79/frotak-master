// Composicao do modulo no navegador: liga os casos de uso aos adaptadores.
// A interface importa daqui; trocar de fornecedor e trocar o adaptador nesta linha.
import { supabase } from "@/lib/supabase";
import { getAssetAssignmentMode as getAssetAssignmentModeUseCase } from "@/modules/driver-app/application/getAssetAssignmentMode";
import { SupabaseTenantSettings } from "@/modules/driver-app/infrastructure/supabaseTenantSettings";

const tenantSettings = new SupabaseTenantSettings(supabase);

export function getAssetAssignmentMode(tenantId: string) {
  return getAssetAssignmentModeUseCase(tenantSettings, tenantId);
}
