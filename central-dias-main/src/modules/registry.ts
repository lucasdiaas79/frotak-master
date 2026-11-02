import { isModuleEnabled, type ModuleCode, type WorkspaceEntitlements } from "@/lib/entitlements";
import { cteIssuanceModule } from "@/modules/cte-issuance/module";
import { driverAppModule } from "@/modules/driver-app/module";
import { financialModule } from "@/modules/financial/module";
import { fleetCoreModule } from "@/modules/fleet-core/module";
import { frotakAiModule } from "@/modules/frotak-ai/module";
import { frotakTrackingModule } from "@/modules/frotak-tracking/module";
import type { NavItem, TmsModule } from "@/modules/types";

/** Todos os modulos do TMS. Para um modulo novo: criar src/modules/<modulo>/module.ts e listar aqui. */
export const tmsModules: TmsModule[] = [
  fleetCoreModule,
  financialModule,
  cteIssuanceModule,
  frotakAiModule,
  driverAppModule,
  frotakTrackingModule,
];

export { fleetCoreModule };

// Suporte fica aberto mesmo sem TMS ou com o cliente suspenso.
const ALWAYS_AVAILABLE_PATHS = ["/manual"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAlwaysAvailablePath(pathname: string) {
  return ALWAYS_AVAILABLE_PATHS.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Modulo dono da rota; o que nenhum modulo reivindica pertence ao modulo base. */
export function moduleForPath(pathname: string): ModuleCode {
  const owner = tmsModules.find(
    (module) => !module.core && module.paths.some((prefix) => matchesPrefix(pathname, prefix)),
  );
  return owner?.code ?? fleetCoreModule.code;
}

export function moduleLabel(code: ModuleCode) {
  return tmsModules.find((module) => module.code === code)?.label ?? code;
}

/** Itens da secao "Operacional" dos modulos liberados, na ordem definida pelos manifestos. */
export function operationalNav(entitlements: WorkspaceEntitlements | null): NavItem[] {
  return tmsModules
    .filter((module) => isModuleEnabled(entitlements, module.code))
    .flatMap((module) => module.nav?.operational ?? [])
    .sort((a, b) => a.order - b.order);
}

export const financialNav: NavItem[] = financialModule.nav?.financial ?? [];
