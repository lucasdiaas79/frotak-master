import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FleetChange,
  FleetChangeFeed,
  FleetChangeStatus,
  FleetDomain,
} from "@/modules/fleet-core/application/ports";
import {
  driverFromRow,
  fleetEventFromRow,
  productFromRow,
  recipientFromRow,
  senderFromRow,
  trailerFromRow,
  vehicleFromRow,
} from "@/modules/fleet-core/infrastructure/mappers";

type Row = Record<string, unknown>;
type Payload = { eventType: string; new: unknown; old: unknown };

const RECORD_TABLES: Array<
  [
    table: string,
    domain: Exclude<FleetDomain, "vehicles" | "events">,
    map: (row: Row) => ReturnType<Extract<FleetChange, { type: "saved" }>["toItem"]>,
  ]
> = [
  [
    "drivers",
    "drivers",
    (row) => driverFromRow(row as unknown as Parameters<typeof driverFromRow>[0]),
  ],
  [
    "trailers",
    "trailers",
    (row) => trailerFromRow(row as unknown as Parameters<typeof trailerFromRow>[0]),
  ],
  [
    "senders",
    "senders",
    (row) => senderFromRow(row as unknown as Parameters<typeof senderFromRow>[0]),
  ],
  [
    "recipients",
    "recipients",
    (row) => recipientFromRow(row as unknown as Parameters<typeof recipientFromRow>[0]),
  ],
  [
    "products",
    "products",
    (row) => productFromRow(row as unknown as Parameters<typeof productFromRow>[0]),
  ],
];

// Tabelas que mudam o que a frota mostra, mas pedem recarga do dominio de veiculos.
const VEHICLE_RELATED_TABLES = [
  "vehicle_trailers",
  "freight_documents",
  "freights",
  "manual_workflow_overrides",
];

function optionalNumber(value: unknown) {
  return value == null ? undefined : Number(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

/** Tempo real do Supabase sobre as tabelas operacionais do tenant. */
export class SupabaseFleetChangeFeed implements FleetChangeFeed {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  watch(
    tenantId: string,
    handlers: { onChange(change: FleetChange): void; onStatus(status: FleetChangeStatus): void },
  ) {
    const filter = `tenant_id=eq.${tenantId}`;
    const isCurrentTenant = (row: Row) => !row.tenant_id || row.tenant_id === tenantId;
    const rowOf = (payload: Payload) =>
      (payload.eventType === "DELETE" ? payload.old : payload.new) as Row | undefined;

    let channel = this.supabase.channel(`fleet-operational-data:${tenantId}`);
    const on = (table: string, listener: (payload: Payload) => void) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        listener,
      );
    };

    on("vehicles", (payload) => {
      const row = rowOf(payload);
      if (!row?.id || !isCurrentTenant(row)) return;
      const id = String(row.id);
      if (payload.eventType === "DELETE") {
        handlers.onChange({
          type: "deleted",
          domain: "vehicles",
          id,
          eventType: payload.eventType,
        });
        return;
      }
      handlers.onChange({
        type: "vehicleSaved",
        id,
        eventType: payload.eventType,
        toVehicle: (currentTrailerIds) =>
          vehicleFromRow({
            ...(row as unknown as Parameters<typeof vehicleFromRow>[0]),
            vehicle_trailers: currentTrailerIds?.map((trailerId, position) => ({
              trailer_id: trailerId,
              position,
              active: true,
            })),
          }),
      });
    });

    for (const [table, domain, map] of RECORD_TABLES) {
      on(table, (payload) => {
        const row = rowOf(payload);
        if (!row?.id || !isCurrentTenant(row)) return;
        const id = String(row.id);
        handlers.onChange(
          payload.eventType === "DELETE"
            ? { type: "deleted", domain, id, eventType: payload.eventType }
            : { type: "saved", domain, id, eventType: payload.eventType, toItem: () => map(row) },
        );
      });
    }

    on("fleet_events", (payload) => {
      const row = rowOf(payload);
      if (!row?.id || !isCurrentTenant(row)) return;
      const id = String(row.id);
      handlers.onChange(
        payload.eventType === "DELETE"
          ? { type: "deleted", domain: "events", id, eventType: payload.eventType }
          : {
              type: "eventSaved",
              id,
              eventType: payload.eventType,
              toEvent: () =>
                fleetEventFromRow(row as unknown as Parameters<typeof fleetEventFromRow>[0]),
            },
      );
    });

    for (const table of VEHICLE_RELATED_TABLES) {
      on(table, () => handlers.onChange({ type: "stale", domain: "vehicles" }));
    }

    on("vehicle_positions", (payload) => {
      if (payload.eventType === "DELETE") return;
      const row = payload.new as Row | undefined;
      if (!row?.vehicle_id || !isCurrentTenant(row)) return;
      handlers.onChange({
        type: "position",
        vehicleId: String(row.vehicle_id),
        eventType: payload.eventType,
        lat: optionalNumber(row.lat),
        lng: optionalNumber(row.lng),
        city: optionalString(row.city),
        state: optionalString(row.state),
        recordedAt: optionalString(row.recorded_at),
      });
    });

    let subscribedOnce = false;
    channel.subscribe((status) => {
      const ready = status === "SUBSCRIBED";
      const reconnected = ready && subscribedOnce;
      if (ready) subscribedOnce = true;
      handlers.onStatus({
        ready,
        reconnected,
        lost: status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED",
      });
    });

    return () => {
      void this.supabase.removeChannel(channel);
    };
  }
}
