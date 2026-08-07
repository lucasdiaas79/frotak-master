import type { FreightDocument, Vehicle, VehicleFreightStage, VehicleStatus } from "@/lib/types";
import type { FreightMacroStageId } from "@/lib/freight-workflow";

export type PendingFreightDocument = "nota_fiscal" | "cte_mdfe";

export type ManualTargetCode =
  | "WAITING_DRIVER"
  | "LOADING_ROUTE"
  | "LOADING_AT_ORIGIN"
  | "WAITING_INVOICE"
  | "INVOICE_REVIEW"
  | "INVOICE_APPROVED"
  | "CTE_WAIT_DRIVER"
  | "DELIVERY_ROUTE"
  | "AT_DESTINATION"
  | "DELIVERY_COMPLETED"
  | "RETURNING_YARD";

export interface ManualTargetOption {
  code: ManualTargetCode;
  macroStage: Exclude<FreightMacroStageId, "DISPONIVEIS">;
  label: string;
  description: string;
  freightStage: VehicleFreightStage;
  status: VehicleStatus;
  rank: number;
  requiredDocuments: PendingFreightDocument[];
}

export const MANUAL_TARGET_OPTIONS: ManualTargetOption[] = [
  {
    code: "WAITING_DRIVER",
    macroStage: "INDO_CARREGAR",
    label: "Aguardando aceite do motorista",
    description: "Frete criado e aguardando o motorista aceitar a demanda.",
    freightStage: "DISPONIVEL",
    status: "aguardando-motorista",
    rank: 0,
    requiredDocuments: [],
  },
  {
    code: "LOADING_ROUTE",
    macroStage: "INDO_CARREGAR",
    label: "Em rota para carregar",
    description: "O motorista iniciou o deslocamento para o remetente.",
    freightStage: "EM_ROTA_CARREGAR",
    status: "rota-carregar",
    rank: 1,
    requiredDocuments: [],
  },
  {
    code: "LOADING_AT_ORIGIN",
    macroStage: "INDO_CARREGAR",
    label: "Chegou ao remetente",
    description: "O caminhão está no local de carregamento.",
    freightStage: "EM_ROTA_CARREGAR",
    status: "parado-aguardando-carga",
    rank: 2,
    requiredDocuments: [],
  },
  {
    code: "WAITING_INVOICE",
    macroStage: "INDO_CARREGAR",
    label: "Carregado, aguardando nota",
    description: "O carregamento foi confirmado e a nota ainda não foi anexada.",
    freightStage: "AGUARDANDO_NOTA",
    status: "parado-aguardando-carga",
    rank: 3,
    requiredDocuments: [],
  },
  {
    code: "INVOICE_REVIEW",
    macroStage: "AGUARDANDO_CTE",
    label: "Nota em conferência",
    description: "A nota fiscal foi recebida e aguarda conferência da expedição.",
    freightStage: "NOTA_EM_CONFERENCIA",
    status: "aguardando-cte",
    rank: 4,
    requiredDocuments: ["nota_fiscal"],
  },
  {
    code: "INVOICE_APPROVED",
    macroStage: "AGUARDANDO_CTE",
    label: "Nota aprovada, aguardando CT-e",
    description: "A nota foi validada e o CT-e/MDF-e está pendente.",
    freightStage: "NOTA_APROVADA_AG_CTE",
    status: "aguardando-cte",
    rank: 5,
    requiredDocuments: ["nota_fiscal"],
  },
  {
    code: "CTE_WAIT_DRIVER",
    macroStage: "AGUARDANDO_CTE",
    label: "CT-e enviado, aguardando motorista",
    description: "O CT-e/MDF-e foi disponibilizado e aguarda confirmação do motorista.",
    freightStage: "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA",
    status: "aguardando-confirmacao",
    rank: 6,
    requiredDocuments: ["nota_fiscal", "cte_mdfe"],
  },
  {
    code: "DELIVERY_ROUTE",
    macroStage: "EM_ROTA_ENTREGA",
    label: "Em rota para entrega",
    description: "O caminhão iniciou o deslocamento para o destinatário.",
    freightStage: "EM_ROTA_ENTREGA",
    status: "rota-descarregar",
    rank: 7,
    requiredDocuments: ["nota_fiscal", "cte_mdfe"],
  },
  {
    code: "AT_DESTINATION",
    macroStage: "EM_ROTA_ENTREGA",
    label: "Chegou ao destinatário",
    description: "O caminhão está no destino aguardando ou realizando a descarga.",
    freightStage: "ENTREGUE_AG_FINALIZACAO",
    status: "parado-descarregando",
    rank: 8,
    requiredDocuments: ["nota_fiscal", "cte_mdfe"],
  },
  {
    code: "DELIVERY_COMPLETED",
    macroStage: "ROTA_FINALIZADA",
    label: "Descarga concluída, aguardando comando",
    description: "A entrega terminou e aguarda a decisão da expedição.",
    freightStage: "ENTREGA_FINALIZADA",
    status: "parado-aguardando-comando",
    rank: 9,
    requiredDocuments: ["nota_fiscal", "cte_mdfe"],
  },
  {
    code: "RETURNING_YARD",
    macroStage: "ROTA_FINALIZADA",
    label: "Retornando ao pátio",
    description: "A expedição determinou o retorno do caminhão ao pátio.",
    freightStage: "ENTREGA_FINALIZADA",
    status: "rota-retornando",
    rank: 10,
    requiredDocuments: ["nota_fiscal", "cte_mdfe"],
  },
];

const TARGET_BY_CODE = new Map(
  MANUAL_TARGET_OPTIONS.map((target) => [target.code, target] as const),
);

export function manualTargetsForMacroStage(stage: FreightMacroStageId) {
  if (stage === "DISPONIVEIS") return [];
  return MANUAL_TARGET_OPTIONS.filter((target) => target.macroStage === stage);
}

export function manualTargetByCode(code: ManualTargetCode) {
  const target = TARGET_BY_CODE.get(code);
  if (!target) throw new Error(`Destino operacional não configurado: ${code}`);
  return target;
}

export function currentWorkflowRank(vehicle: Pick<Vehicle, "freightStage" | "status">): number {
  if (vehicle.freightStage === "DISPONIVEL") return 0;
  if (vehicle.freightStage === "EM_ROTA_CARREGAR") {
    return vehicle.status === "rota-carregar" ? 1 : 2;
  }
  if (vehicle.freightStage === "AGUARDANDO_NOTA") return 3;
  if (vehicle.freightStage === "NOTA_EM_CONFERENCIA") return 4;
  if (vehicle.freightStage === "NOTA_APROVADA_AG_CTE") return 5;
  if (vehicle.freightStage === "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA") return 6;
  if (vehicle.freightStage === "EM_ROTA_ENTREGA") return 7;
  if (vehicle.freightStage === "ENTREGUE_AG_FINALIZACAO") return 8;
  if (vehicle.status === "rota-retornando") return 10;
  return 9;
}

export function missingDocumentsForTarget(
  vehicle: Pick<Vehicle, "currentFreightId">,
  target: ManualTargetOption,
  documents: FreightDocument[],
): PendingFreightDocument[] {
  const currentDocuments = documents.filter(
    (document) =>
      document.freightId === vehicle.currentFreightId &&
      !["rejeitado", "rejected", "deleted", "excluido"].includes(document.status),
  );
  const hasInvoice = currentDocuments.some((document) => document.kind === "nota_fiscal");
  const hasCte = currentDocuments.some(
    (document) => document.kind === "cte" || document.kind === "cte_mdfe",
  );

  return target.requiredDocuments.filter((kind) => {
    if (kind === "nota_fiscal") return !hasInvoice;
    return !hasCte;
  });
}

export function skippedTargetLabels(
  vehicle: Pick<Vehicle, "freightStage" | "status">,
  target: ManualTargetOption,
) {
  const currentRank = currentWorkflowRank(vehicle);
  if (target.rank <= currentRank + 1) return [];
  return MANUAL_TARGET_OPTIONS.filter(
    (candidate) => candidate.rank > currentRank && candidate.rank < target.rank,
  ).map((candidate) => candidate.label);
}

export function pendingDocumentLabel(kind: PendingFreightDocument) {
  return kind === "nota_fiscal" ? "Nota fiscal" : "CT-e/MDF-e";
}
