import { STATUS_HEX } from "@/lib/types";
import type { Vehicle, VehicleFreightStage, VehicleStatus } from "@/lib/types";

export type FreightStageId = VehicleFreightStage;

export type FreightTone = "primary" | "success" | "warning" | "maintenance" | "muted" | "info";

export type FreightMacroStageId =
  | "DISPONIVEIS"
  | "INDO_CARREGAR"
  | "AGUARDANDO_CTE"
  | "EM_ROTA_ENTREGA"
  | "ROTA_FINALIZADA";

export interface FreightStage {
  id: FreightStageId;
  label: string;
  shortLabel: string;
  description: string;
  nextAction: string;
  legacyStatus: VehicleStatus;
  tone: FreightTone;
}

export interface FreightMacroStage {
  id: FreightMacroStageId;
  label: string;
  shortLabel: string;
  description: string;
  tone: FreightTone;
}

export const FREIGHT_STAGES: FreightStage[] = [
  {
    id: "DISPONIVEL",
    label: "Disponíveis",
    shortLabel: "Disponíveis",
    description: "Veículo disponível no pátio ou na oficina para nova atribuição.",
    nextAction: "Liberar para carregamento",
    legacyStatus: "disponivel-patio",
    tone: "primary",
  },
  {
    id: "EM_ROTA_CARREGAR",
    label: "Em rota indo carregar",
    shortLabel: "Indo carregar",
    description: "Motorista liberado para seguir ao ponto de carregamento.",
    nextAction: "Confirmar carregamento",
    legacyStatus: "rota-carregar",
    tone: "success",
  },
  {
    id: "AGUARDANDO_NOTA",
    label: "Parado esperando carga",
    shortLabel: "Carga",
    description: "Carga em espera de confirmação e liberação da sequência operacional.",
    nextAction: "Anexar nota fiscal",
    legacyStatus: "parado-aguardando-carga",
    tone: "warning",
  },
  {
    id: "NOTA_EM_CONFERENCIA",
    label: "Nota em conferência",
    shortLabel: "Conferência",
    description: "Nota recebida e pendente de conferência pelo operador.",
    nextAction: "Aprovar nota",
    legacyStatus: "parado-aguardando-carga",
    tone: "warning",
  },
  {
    id: "NOTA_APROVADA_AG_CTE",
    label: "Aguardando CT-e/MDF-e",
    shortLabel: "CT-e/MDF-e",
    description: "Nota aprovada. A operação aguarda geração ou anexo do CT-e/MDF-e.",
    nextAction: "Anexar CTE",
    legacyStatus: "aguardando-cte",
    tone: "maintenance",
  },
  {
    id: "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA",
    label: "Aguardando confirmação",
    shortLabel: "Confirmação",
    description: "CT-e/MDF-e gerado ou enviado e aguardando confirmação do motorista.",
    nextAction: "Confirmar motorista",
    legacyStatus: "aguardando-confirmacao",
    tone: "info",
  },
  {
    id: "EM_ROTA_ENTREGA",
    label: "Em rota indo descarregar",
    shortLabel: "Descarga",
    description: "Veículo em deslocamento para descarga no destino.",
    nextAction: "Confirmar entrega",
    legacyStatus: "rota-descarregar",
    tone: "success",
  },
  {
    id: "ENTREGUE_AG_FINALIZACAO",
    label: "Parado esperando descarga",
    shortLabel: "Descarga",
    description: "Veículo parado aguardando conclusão da descarga.",
    nextAction: "Finalizar entrega",
    legacyStatus: "parado-descarregando",
    tone: "primary",
  },
  {
    id: "ENTREGA_FINALIZADA",
    label: "Rota finalizada",
    shortLabel: "Finalizada",
    description: "Frete concluído e aguardando comando ou retorno.",
    nextAction: "Frete finalizado",
    legacyStatus: "rota-retornando",
    tone: "muted",
  },
];

export const FREIGHT_MACRO_STAGES: FreightMacroStage[] = [
  {
    id: "DISPONIVEIS",
    label: "Disponíveis",
    shortLabel: "Disponíveis",
    description: "Disponível no pátio ou na oficina para nova atribuição.",
    tone: "primary",
  },
  {
    id: "INDO_CARREGAR",
    label: "Carregamento",
    shortLabel: "Carregamento",
    description: "Aguardando motorista, em rota para carga ou parado esperando carga.",
    tone: "success",
  },
  {
    id: "AGUARDANDO_CTE",
    label: "Aguardando CT-e/MDF-e",
    shortLabel: "Documental",
    description: "Fretes pendentes de CT-e/MDF-e ou confirmação do motorista.",
    tone: "maintenance",
  },
  {
    id: "EM_ROTA_ENTREGA",
    label: "Descarga",
    shortLabel: "Descarga",
    description: "Em rota para descarregar ou parado esperando descarga.",
    tone: "success",
  },
  {
    id: "ROTA_FINALIZADA",
    label: "Rota finalizada",
    shortLabel: "Finalizada",
    description: "Parado aguardando comando ou retornando.",
    tone: "muted",
  },
];

export const FREIGHT_STAGE_ORDER = FREIGHT_STAGES.map((stage) => stage.id);

const STAGE_BY_ID = Object.fromEntries(FREIGHT_STAGES.map((stage) => [stage.id, stage])) as Record<
  FreightStageId,
  FreightStage
>;

const MACRO_STAGE_BY_ID = Object.fromEntries(
  FREIGHT_MACRO_STAGES.map((stage) => [stage.id, stage]),
) as Record<FreightMacroStageId, FreightMacroStage>;

export function freightStageById(id: FreightStageId) {
  return STAGE_BY_ID[id];
}

export function freightMacroStageById(id: FreightMacroStageId) {
  return MACRO_STAGE_BY_ID[id];
}

export function macroStageFromFreightStage(id: FreightStageId): FreightMacroStageId {
  if (id === "DISPONIVEL") return "DISPONIVEIS";
  if (id === "EM_ROTA_CARREGAR" || id === "AGUARDANDO_NOTA") return "INDO_CARREGAR";
  if (
    id === "NOTA_EM_CONFERENCIA" ||
    id === "NOTA_APROVADA_AG_CTE" ||
    id === "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA"
  ) {
    return "AGUARDANDO_CTE";
  }
  if (id === "EM_ROTA_ENTREGA" || id === "ENTREGUE_AG_FINALIZACAO") return "EM_ROTA_ENTREGA";
  return "ROTA_FINALIZADA";
}

export function macroStageOfVehicle(
  vehicle: Pick<Vehicle, "currentFreightId" | "freightStage" | "status">,
): FreightMacroStageId {
  const stage = stageOfVehicle(vehicle);
  if (stage === "DISPONIVEL" && vehicle.currentFreightId) return "INDO_CARREGAR";
  return macroStageFromFreightStage(stage);
}

export function stageFromLegacyStatus(status: VehicleStatus): FreightStageId {
  if (
    status === "disponivel-patio" ||
    status === "disponivel-oficina" ||
    status === "aguardando-motorista"
  )
    return "DISPONIVEL";
  if (status === "rota-carregar") return "EM_ROTA_CARREGAR";
  if (status === "rota-descarregar") return "EM_ROTA_ENTREGA";
  if (status === "rota-retornando") return "ENTREGA_FINALIZADA";
  if (status === "parado-descarregando") return "ENTREGUE_AG_FINALIZACAO";
  if (status === "aguardando-cte") return "NOTA_APROVADA_AG_CTE";
  if (status === "aguardando-confirmacao") return "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA";
  if (status === "parado-aguardando-carga") return "AGUARDANDO_NOTA";
  if (status === "parado-aguardando-comando") return "ENTREGA_FINALIZADA";
  return "DISPONIVEL";
}

export function stageOfVehicle(vehicle: Pick<Vehicle, "freightStage" | "status">): FreightStageId {
  return vehicle.freightStage ?? stageFromLegacyStatus(vehicle.status);
}

export function pendingActionKindOfVehicle(
  vehicle: Pick<Vehicle, "freightStage" | "status">,
): "cte" | "confirmation" | "command" | null {
  const stage = stageOfVehicle(vehicle);
  if (vehicle.status === "aguardando-cte" || stage === "NOTA_APROVADA_AG_CTE") return "cte";
  if (
    vehicle.status === "aguardando-confirmacao" ||
    stage === "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA"
  ) {
    return "confirmation";
  }
  if (stage === "ENTREGA_FINALIZADA" && vehicle.status === "parado-aguardando-comando") {
    return "command";
  }
  return null;
}

export function vehicleMapColor(vehicle: Pick<Vehicle, "freightStage" | "status">) {
  return pendingActionKindOfVehicle(vehicle) ? "#dc2626" : STATUS_HEX[vehicle.status];
}

export function nextFreightStage(id: FreightStageId): FreightStageId | null {
  const current = FREIGHT_STAGE_ORDER.indexOf(id);
  if (current < 0 || current >= FREIGHT_STAGE_ORDER.length - 1) return null;
  return FREIGHT_STAGE_ORDER[current + 1];
}

export function freightStageIndex(id: FreightStageId) {
  return FREIGHT_STAGE_ORDER.indexOf(id);
}

export function isFinalFreightStage(id: FreightStageId) {
  return id === "ENTREGA_FINALIZADA";
}

export function formatFreightCode(vehicle: Pick<Vehicle, "id" | "plate">) {
  const plate = vehicle.plate.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `FRT-${plate}-${vehicle.id.slice(0, 4).toUpperCase()}`;
}
