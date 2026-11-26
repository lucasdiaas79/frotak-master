// Adaptadores Supabase da Gestao de Frota, conferidos pelo compilador contra as portas.
import type {
  DailyAllowancesPort,
  FleetRepository,
  FreightDocumentsPort,
  FreightExpensesPort,
  FreightHistoryPort,
  FuelRecordsPort,
  LocalFleetStore,
  LongTripFreightsPort,
  ManualKanbanPort,
  VehiclePositionsPort,
} from "@/modules/fleet-core/application/ports";
import * as dailyAllowances from "@/modules/fleet-core/infrastructure/daily-allowances";
import * as drivers from "@/modules/fleet-core/infrastructure/drivers";
import * as fleetEvents from "@/modules/fleet-core/infrastructure/fleet-events";
import * as freightDocuments from "@/modules/fleet-core/infrastructure/freight-documents";
import * as freightExpenses from "@/modules/fleet-core/infrastructure/freight-expenses";
import * as freightHistory from "@/modules/fleet-core/infrastructure/freight-history";
import * as fuelRecords from "@/modules/fleet-core/infrastructure/fuel-records";
import {
  loadLocalFleetData,
  nextLocalId,
  saveLocalFleetData,
} from "@/modules/fleet-core/infrastructure/localFleetData";
import * as longTripFreights from "@/modules/fleet-core/infrastructure/longTripFreights";
import * as manualKanban from "@/modules/fleet-core/infrastructure/manual-kanban";
import * as parties from "@/modules/fleet-core/infrastructure/parties";
import * as positions from "@/modules/fleet-core/infrastructure/positions";
import * as products from "@/modules/fleet-core/infrastructure/products";
import * as trailers from "@/modules/fleet-core/infrastructure/trailers";
import * as vehicles from "@/modules/fleet-core/infrastructure/vehicles";

export const supabaseFleetRepository: FleetRepository = {
  ...vehicles,
  ...drivers,
  ...trailers,
  ...parties,
  ...products,
  ...fleetEvents,
};

export const supabaseFuelRecords: FuelRecordsPort = fuelRecords;
export const supabaseFreightHistory: FreightHistoryPort = freightHistory;
export const supabaseFreightDocuments: FreightDocumentsPort = freightDocuments;
export const supabaseFreightExpenses: FreightExpensesPort = freightExpenses;
export const supabaseManualKanban: ManualKanbanPort = manualKanban;
export const supabaseDailyAllowances: DailyAllowancesPort = dailyAllowances;
export const supabaseVehiclePositions: VehiclePositionsPort = positions;
export const supabaseLongTripFreights: LongTripFreightsPort = longTripFreights;

/** Copia da frota no localStorage, usada sem Supabase configurado. */
export const browserLocalFleetStore: LocalFleetStore = {
  load: loadLocalFleetData,
  save: saveLocalFleetData,
  nextId: nextLocalId,
};
