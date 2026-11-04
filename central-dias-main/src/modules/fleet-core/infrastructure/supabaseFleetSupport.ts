import type { SupabaseClient } from "@supabase/supabase-js";
import type { FleetSupportPort, TripCostsReader } from "@/modules/fleet-core/application/ports";
import type {
  FleetEventRecordInput,
  FreightCostMovement,
  LegacyPartnerLink,
} from "@/modules/fleet-core/domain/fleetOperations";

const TRIP_MOVEMENT_COLUMNS =
  "id, vehicle_id, driver_id, freight_id, trip_cycle_id, amount, recorded_at";
const TRIP_MOVEMENT_LIMIT = 240;

function movementFromRow(row: Record<string, unknown>): FreightCostMovement {
  return {
    id: String(row.id),
    vehicleId: typeof row.vehicle_id === "string" ? row.vehicle_id : null,
    driverId: typeof row.driver_id === "string" ? row.driver_id : null,
    freightId: typeof row.freight_id === "string" ? row.freight_id : null,
    tripCycleId: typeof row.trip_cycle_id === "string" ? row.trip_cycle_id : null,
    amount: Number(row.amount ?? 0),
    recordedAt: String(row.recorded_at ?? new Date().toISOString()),
  };
}

/** Caixa de viagem: entradas (freight_cash_entries) e despesas pagas com ele (freight_expenses). */
export class SupabaseTripCosts implements TripCostsReader {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async listRecentMovements(tenantId: string, since: Date) {
    const [entriesResult, expensesResult] = await Promise.all([
      this.supabase
        .from("freight_cash_entries")
        .select(TRIP_MOVEMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .gte("recorded_at", since.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(TRIP_MOVEMENT_LIMIT),
      this.supabase
        .from("freight_expenses")
        .select(TRIP_MOVEMENT_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("payment_source", "trip_cash")
        .gte("recorded_at", since.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(TRIP_MOVEMENT_LIMIT),
    ]);

    if (entriesResult.error || expensesResult.error) {
      throw new Error(
        entriesResult.error?.message ||
          expensesResult.error?.message ||
          "Não foi possível carregar custos de viagem.",
      );
    }

    return {
      entries: ((entriesResult.data ?? []) as Record<string, unknown>[]).map(movementFromRow),
      expenses: ((expensesResult.data ?? []) as Record<string, unknown>[]).map(movementFromRow),
    };
  }

  watch(onChange: () => void) {
    const channel = this.supabase
      .channel("dashboard-trip-costs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freight_cash_entries" },
        onChange,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "freight_expenses" }, onChange)
      .subscribe();
    return () => {
      void this.supabase.removeChannel(channel);
    };
  }
}

export class SupabaseFleetSupport implements FleetSupportPort {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async listLegacyPartnerLinks() {
    const { data, error } = await this.supabase
      .from("legacy_partner_links")
      .select("legacy_table, legacy_id, partner_id")
      .in("legacy_table", ["senders", "recipients"]);
    if (error) throw error;
    return (data ?? []) as LegacyPartnerLink[];
  }

  async getWorkspaceTenantSettings(workspaceId: string) {
    const { data, error } = await this.supabase
      .from("workspaces")
      .select("tenant_id, tenants(settings)")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    const tenant = Array.isArray(data?.tenants) ? data?.tenants[0] : data?.tenants;
    return (tenant as { settings?: unknown } | null | undefined)?.settings;
  }

  async recordFleetEvent(input: FleetEventRecordInput) {
    // Como antes: o registro e informativo e o resultado nao e conferido.
    await this.supabase.from("fleet_events").insert({
      vehicle_id: input.vehicleId,
      freight_id: input.freightId,
      status: input.status,
      freight_stage: input.freightStage,
      city: input.city,
      state: input.state,
      source: input.source,
      description: input.description,
      event_type: input.eventType,
      action_origin: input.actionOrigin,
      metadata: input.metadata,
    });
  }
}
