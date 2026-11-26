import type { TmsModule } from "@/modules/types";

// Sem rotas proprias no TMS: o app do motorista e externo. O bloqueio fica no banco
// (private.current_driver) e na criacao de acesso do motorista.
export const driverAppModule: TmsModule = {
  code: "driver_app",
  label: "App Motorista",
  paths: [],
};
