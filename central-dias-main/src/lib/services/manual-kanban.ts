import { supabase } from "@/lib/supabase";
import { vehicleFromRow } from "@/lib/services/mappers";
import type { ManualTargetCode } from "@/lib/freight-kanban";
import type { Vehicle } from "@/lib/types";

export interface ManualFreightMoveInput {
  vehicle: Vehicle;
  targetCode: ManualTargetCode;
  reason: string;
  informationSource: string;
  occurredAt: string;
  observation?: string;
  confirmDocuments: boolean;
}

export class WorkflowConflictError extends Error {
  constructor(message = "O card foi atualizado. Recarregue a tela e tente novamente.") {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export async function manualMoveFreightCard(input: ManualFreightMoveInput): Promise<Vehicle> {
  const { data, error } = await supabase.rpc("manual_move_freight_card", {
    p_vehicle_id: input.vehicle.id,
    p_target_code: input.targetCode,
    p_expected_version: input.vehicle.workflowVersion,
    p_reason: input.reason.trim(),
    p_information_source: input.informationSource,
    p_occurred_at: input.occurredAt,
    p_observation: input.observation?.trim() || null,
    p_confirm_documents: input.confirmDocuments,
    p_metadata: {
      requestedFrom: "fleet-kanban",
      clientWorkflowVersion: input.vehicle.workflowVersion,
    },
  });

  if (error) {
    if (error.code === "40001" || error.message.toLowerCase().includes("atualizado")) {
      throw new WorkflowConflictError(error.message);
    }
    throw new Error(error.message);
  }

  return vehicleFromRow(Array.isArray(data) ? data[0] : data);
}
