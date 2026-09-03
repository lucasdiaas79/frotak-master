import { freightStageById, nextFreightStage, type FreightStageId } from "@/lib/freight-workflow";
import type { Driver, FreightPaymentType, VehicleFreightStage, VehicleStatus } from "@/lib/types";

type FinalCommand = "RETORNO_SOLICITADO" | "PRONTO_NOVO_FRETE";

interface FreightDocumentsState {
  note?: { id?: string };
  cte?: { id?: string };
}

interface FreightDemandLike {
  id: string;
  code: string;
  stage: { id: FreightStageId };
  status: VehicleStatus;
  city: string;
  state: string;
  currentFreightId?: string;
  driver?: Driver;
  trailerId?: string;
  trailerIds?: string[];
  documents: FreightDocumentsState;
}

export async function advanceFreightStage(input: {
  demand: FreightDemandLike;
  explicitNext?: FreightStageId;
  setVehicleStatus: (
    id: string,
    status: VehicleStatus,
    freightStage?: VehicleFreightStage,
  ) => Promise<void>;
  onResetFinalCommand?: (vehicleId: string) => void;
}) {
  const next = input.explicitNext ?? nextFreightStage(input.demand.stage.id);
  if (!next) return { ok: false as const, reason: "no-next-stage" as const };

  if (!input.explicitNext && next === "NOTA_EM_CONFERENCIA" && !input.demand.documents.note) {
    return { ok: false as const, reason: "missing-note" as const };
  }

  if (
    !input.explicitNext &&
    next === "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA" &&
    !input.demand.documents.cte
  ) {
    return { ok: false as const, reason: "missing-cte" as const };
  }

  const nextStage = freightStageById(next);
  await input.setVehicleStatus(input.demand.id, nextStage.legacyStatus, next);

  if (next !== "ENTREGA_FINALIZADA") {
    input.onResetFinalCommand?.(input.demand.id);
  }

  return { ok: true as const, nextStage };
}

export async function applyFinalFreightCommand(input: {
  command: FinalCommand;
  demand: FreightDemandLike;
  setVehicleStatus: (
    id: string,
    status: VehicleStatus,
    freightStage?: VehicleFreightStage,
  ) => Promise<void>;
  archiveFreight: (vehicleId: string, reason?: string) => Promise<void>;
}) {
  if (input.command === "RETORNO_SOLICITADO") {
    await input.setVehicleStatus(input.demand.id, "rota-retornando", "ENTREGA_FINALIZADA");
    return { action: "return-to-yard" as const };
  }

  await input.archiveFreight(input.demand.id, "pronto_para_novo_frete");
  return {
    action: "create-next-freight" as const,
    seed: {
      vehicleId: input.demand.id,
      driverId: input.demand.driver?.id ?? "",
      trailerId: input.demand.trailerId ?? input.demand.trailerIds?.[0] ?? "",
    },
  };
}

export async function createFreightOperation(input: {
  vehicleId: string;
  driverId: string;
  trailerId?: string;
  trailerIds?: string[];
  senderId: string;
  recipientId: string;
  productId: string;
  freightValue?: number;
  freightPaymentType: FreightPaymentType;
  paymentTermDays?: number | null;
  link: (
    vehicleId: string,
    driverId?: string,
    trailerId?: string,
    extras?: {
      senderId?: string;
      recipientId?: string;
      productId?: string;
      freightValue?: number;
      trailerIds?: string[];
      freightPaymentType?: FreightPaymentType;
      paymentTermDays?: number | null;
    },
  ) => Promise<void>;
  setVehicleStatus: (
    id: string,
    status: VehicleStatus,
    freightStage?: VehicleFreightStage,
  ) => Promise<void>;
}) {
  try {
    await input.link(input.vehicleId, input.driverId, input.trailerId, {
      trailerIds: input.trailerIds,
      senderId: input.senderId,
      recipientId: input.recipientId,
      productId: input.productId,
      freightValue: input.freightValue,
      freightPaymentType: input.freightPaymentType,
      paymentTermDays: input.paymentTermDays ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("FREIGHT_PAYMENT_TYPE_REQUIRED")) {
      throw new Error("Selecione se o frete é CIF ou FOB.");
    }
    if (message.includes("FREIGHT_BILLING_PARTNER_NOT_MAPPED")) {
      throw new Error("Não foi possível identificar o pagador deste frete.");
    }
    throw error;
  }
  await input.setVehicleStatus(input.vehicleId, "aguardando-motorista", "DISPONIVEL");
}
