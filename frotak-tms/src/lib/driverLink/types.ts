// Link do motorista: o que a pagina do motorista recebe e o que ela pode enviar.
// Nada aqui leva valor do frete, custo da transportadora ou dado de outro motorista.

import type { PublicFreightStep } from "@/lib/freightShare";
import type { DriverDocKind, DriverDocumentInfo, DriverRelation } from "@/lib/shipper/types";

export type DriverExpenseCategory =
  "pedagio" | "alimentacao" | "estacionamento" | "manutencao" | "outros";

export const DRIVER_EXPENSE_LABELS: Record<DriverExpenseCategory, string> = {
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  estacionamento: "Estacionamento",
  manutencao: "Manutenção",
  outros: "Outros",
};

export type DriverStatusCode =
  "chegou_origem" | "carregado" | "chegou_destino" | "parada" | "ocorrencia" | "entregue";

export interface DriverFuelEntry {
  id: string;
  station: string;
  liters: number;
  amount: number;
  odometer: number;
  at: string;
  kmPerLiter?: number;
}

export interface DriverSettlement {
  /** Valor combinado com o motorista para esta viagem. */
  pay?: number;
  advances: number;
  reimbursable: number;
  balance: number;
  expenses: Array<{
    id: string;
    category: string;
    description: string;
    amount: number;
    at: string;
  }>;
  previous: Array<{ freightId: string; date: string; balance: number; pay?: number }>;
}

export interface DriverLinkView {
  driverName: string;
  carrierName: string;
  plate: string;
  active: boolean;
  step: PublicFreightStep;
  statusLabel: string;
  product?: string;
  origin: { name?: string; place?: string };
  destination: { name?: string; place?: string };
  hasTracker: boolean;
  lastPositionAt?: string;
  expiresAt: string;
  fuel: DriverFuelEntry[];
  fleetKmPerLiter?: number;
  settlement: DriverSettlement;
  documents: DriverDocumentInfo[];
  network: {
    optIn: boolean;
    vehicleKind?: string;
    city?: string;
    state?: string;
    availableFrom?: string;
    availableNote?: string;
  };
  demo?: boolean;
}

export type DriverLinkAction =
  | { type: "status"; status: DriverStatusCode; note?: string }
  | { type: "posicao"; lat: number; lng: number }
  | {
      type: "abastecimento";
      station: string;
      liters: number;
      amount: number;
      odometer: number;
      fuelType?: "diesel_s10" | "arla";
      paidByDriver: boolean;
    }
  | { type: "despesa"; category: DriverExpenseCategory; amount: number; description?: string }
  | { type: "documento"; kind: DriverDocKind; expiresAt?: string; number?: string }
  | {
      type: "rede";
      optIn: boolean;
      vehicleKind?: string;
      city?: string;
      state?: string;
      availableFrom?: string;
      availableNote?: string;
    };

export interface DriverLinkSummary {
  id: string;
  phoneEnd: string;
  payAmount?: number;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastSeenAt?: string;
  events: Array<{ kind: string; label: string; at: string }>;
}

export interface CreateDriverLinkInput {
  vehicleId: string;
  phone: string;
  relation: DriverRelation;
  payAmount?: number;
}
