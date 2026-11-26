import type { TmsModule } from "@/modules/types";

// Sem rotas proprias: a integracao Sascar alimenta o mapa da frota pela API de sincronizacao,
// que recusa workspaces sem o modulo.
export const frotakTrackingModule: TmsModule = {
  code: "frotak_tracking",
  label: "Rastreadores",
  paths: [],
};
