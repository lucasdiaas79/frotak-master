// Composicao da Gestao de Frota no navegador: cria o store com os adaptadores e expoe
// as operacoes que as telas usam. Telas importam daqui, nunca de infrastructure/.
import { getActiveTenantId, shouldUseLocalTenantData } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { createFleetStore } from "@/modules/fleet-core/application/fleetStore";
import type {
  DailyAllowancesPort,
  FleetChangeFeed,
  FleetSupportPort,
  FreightDocumentsPort,
  FreightExpensesPort,
  FreightHistoryPort,
  FuelRecordsPort,
  LongTripFreightsPort,
  ManualKanbanPort,
  TripCostsReader,
  VehiclePositionsPort,
} from "@/modules/fleet-core/application/ports";
import {
  browserLocalFleetStore,
  supabaseDailyAllowances,
  supabaseFleetRepository,
  supabaseFreightDocuments,
  supabaseFreightExpenses,
  supabaseFreightHistory,
  supabaseFuelRecords,
  supabaseLongTripFreights,
  supabaseManualKanban,
  supabaseVehiclePositions,
} from "@/modules/fleet-core/infrastructure/supabaseFleetAdapters";
import { SupabaseFleetChangeFeed } from "@/modules/fleet-core/infrastructure/supabaseFleetChangeFeed";
import {
  SupabaseFleetSupport,
  SupabaseTripCosts,
} from "@/modules/fleet-core/infrastructure/supabaseFleetSupport";

export type { FleetDomain } from "@/modules/fleet-core/application/ports";

const changes: FleetChangeFeed = new SupabaseFleetChangeFeed(supabase);

export const useFleet = createFleetStore({
  fleet: supabaseFleetRepository,
  local: browserLocalFleetStore,
  session: { activeTenantId: getActiveTenantId, usesLocalData: shouldUseLocalTenantData },
  changes,
});

const fuelRecords: FuelRecordsPort = supabaseFuelRecords;
export const { listFuelRecords, deleteFuelRecords, listTripFuelEfficiencyCycles } = fuelRecords;

const freightHistory: FreightHistoryPort = supabaseFreightHistory;
export const { listFreightHistory, listLongTripHistory, deleteFreightHistory } = freightHistory;

const freightDocuments: FreightDocumentsPort = supabaseFreightDocuments;
export const { listFreightDocuments, uploadFreightDocument, updateFreightDocumentStatus } =
  freightDocuments;

const freightExpenses: FreightExpensesPort = supabaseFreightExpenses;
export const { listFreightExpenses } = freightExpenses;

const manualKanban: ManualKanbanPort = supabaseManualKanban;
export const { manualMoveFreightCard } = manualKanban;

const dailyAllowances: DailyAllowancesPort = supabaseDailyAllowances;
export const {
  getDailyAllowanceSettings,
  saveDailyAllowanceSettings,
  listDriverDailyAllowances,
  reviewDriverDailyAllowance,
} = dailyAllowances;

const vehiclePositions: VehiclePositionsPort = supabaseVehiclePositions;
export const { registerVehiclePosition } = vehiclePositions;

const longTripFreights: LongTripFreightsPort = supabaseLongTripFreights;
export const { createLongTripFreightsOperation } = longTripFreights;

const tripCosts: TripCostsReader = new SupabaseTripCosts(supabase);

/** Entradas e despesas de caixa de viagem recentes do tenant. */
export function listRecentTripMovements(tenantId: string, since: Date) {
  return tripCosts.listRecentMovements(tenantId, since);
}

export function watchTripCosts(onChange: () => void) {
  return tripCosts.watch(onChange);
}

const support: FleetSupportPort = new SupabaseFleetSupport(supabase);

export const listLegacyPartnerLinks: FleetSupportPort["listLegacyPartnerLinks"] = () =>
  support.listLegacyPartnerLinks();
export const getWorkspaceTenantSettings: FleetSupportPort["getWorkspaceTenantSettings"] = (
  workspaceId,
) => support.getWorkspaceTenantSettings(workspaceId);
export const recordFleetEvent: FleetSupportPort["recordFleetEvent"] = (input) =>
  support.recordFleetEvent(input);
