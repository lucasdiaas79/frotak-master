import { supabase } from "@/lib/supabase";
import type {
  LongTripFreightSegmentInput,
  LongTripFreightsResult,
} from "@/modules/fleet-core/domain/fleetOperations";

// Codigos da RPC create_long_trip_freights traduzidos para o operador.
const LONG_TRIP_ERRORS: Array<[code: string, message: string]> = [
  ["LONG_TRIP_SEGMENTS_REQUIRED", "Adicione pelo menos um trecho ao tiro longo."],
  ["LONG_TRIP_MODE_NOT_ENABLED", "Tiro longo não está habilitado para este tenant."],
  ["LONG_TRIP_INVALID_DRIVER", "Selecione um motorista ativo para o tiro longo."],
  ["LONG_TRIP_INVALID_TRAILER", "Selecione uma caçamba válida para todos os trechos."],
  ["LONG_TRIP_PAYMENT_TYPE_REQUIRED", "Selecione CIF ou FOB em todos os trechos."],
  ["LONG_TRIP_FIXED_VALUE_REQUIRED", "Informe o valor fixo dos trechos com preço fixo."],
  ["LONG_TRIP_TON_PRICE_REQUIRED", "Informe o valor da tonelada dos trechos por tonelada."],
];

export async function createLongTripFreightsOperation(input: {
  vehicleId: string;
  driverId: string;
  segments: LongTripFreightSegmentInput[];
}): Promise<LongTripFreightsResult> {
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
    const known = LONG_TRIP_ERRORS.find(([code]) => error.message.includes(code));
    if (known) throw new Error(known[1]);
    throw error;
  }

  return data as LongTripFreightsResult;
}
