import { freightStageById, nextFreightStage, type FreightStageId } from "@/lib/freight-workflow";
import { supabase } from "@/lib/supabase";
import type {
  Driver,
  FreightPaymentType,
  FreightPricingMode,
  VehicleFreightStage,
  VehicleStatus,
} from "@/lib/types";

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
  freightPricingMode?: FreightPricingMode;
  freightTonPrice?: number;
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
      freightPricingMode?: FreightPricingMode;
      freightTonPrice?: number;
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
      freightPricingMode: input.freightPricingMode ?? "fixed",
      freightTonPrice: input.freightTonPrice,
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
    if (message.includes("FREIGHT_TON_PRICE_REQUIRED")) {
      throw new Error("Informe o valor da tonelada para frete por tonelada.");
    }
    throw error;
  }
  await input.setVehicleStatus(input.vehicleId, "aguardando-motorista", "DISPONIVEL");
}

export interface LongTripFreightSegmentInput {
  trailerId?: string;
  senderId: string;
  recipientId: string;
  productId: string;
  freightValue?: number;
  freightPricingMode?: FreightPricingMode;
  freightTonPrice?: number;
  freightPaymentType: FreightPaymentType;
  paymentTermDays?: number | null;
  observations?: string;
}

export async function createLongTripFreightsOperation(input: {
  vehicleId: string;
  driverId: string;
  segments: LongTripFreightSegmentInput[];
}) {
  const { data, error } = await supabase.rpc("create_long_trip_freights", {
    p_vehicle_id: input.vehicleId,
    p_driver_id: input.driverId,
    p_segments: input.segments.map((segment) => ({
      trailerId: segment.trailerId ?? null,
      senderId: segment.senderId,
      recipientId: segment.recipientId,
      productId: segment.productId,
      freightValue: segment.freightValue ?? null,
      freightPricingMode: segment.freightPricingMode ?? "fixed",
      freightTonPrice: segment.freightTonPrice ?? null,
      freightPaymentType: segment.freightPaymentType,
      paymentTermDays: segment.paymentTermDays ?? null,
      observations: segment.observations ?? null,
    })),
  });

  if (error) {
    const message = error.message;
    if (message.includes("LONG_TRIP_SEGMENTS_REQUIRED")) {
      throw new Error("Adicione pelo menos um trecho ao tiro longo.");
    }
    if (message.includes("LONG_TRIP_MODE_NOT_ENABLED")) {
      throw new Error("Tiro longo não está habilitado para este tenant.");
    }
    if (message.includes("LONG_TRIP_INVALID_DRIVER")) {
      throw new Error("Selecione um motorista ativo para o tiro longo.");
    }
    if (message.includes("LONG_TRIP_INVALID_TRAILER")) {
      throw new Error("Selecione uma caçamba válida para todos os trechos.");
    }
    if (message.includes("LONG_TRIP_PAYMENT_TYPE_REQUIRED")) {
      throw new Error("Selecione CIF ou FOB em todos os trechos.");
    }
    if (message.includes("LONG_TRIP_FIXED_VALUE_REQUIRED")) {
      throw new Error("Informe o valor fixo dos trechos com preço fixo.");
    }
    if (message.includes("LONG_TRIP_TON_PRICE_REQUIRED")) {
      throw new Error("Informe o valor da tonelada dos trechos por tonelada.");
    }
    throw error;
  }

  return data as {
    tripCycleId: string;
    createdFreightIds: string[];
    startedNow: boolean;
    segmentCount: number;
  };
}
