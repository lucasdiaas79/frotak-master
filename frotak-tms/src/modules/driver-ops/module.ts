import { Route as RouteIcon } from "lucide-react";
import type { TmsModule } from "@/modules/types";

// Operacao com embarcador (ex.: distribuicao de bebidas): rotas com varias paradas,
// jornada e ponto, ocorrencias, combustivel e nota do motorista, alimentados pelo app
// do motorista. O banco recusa tudo com MODULE_DISABLED quando o modulo esta desligado.
// A tela /operacao abre com qualquer um dos modulos; cada aba confere o seu.
export const driverOpsModule: TmsModule = {
  code: "delivery_routes",
  label: "Operação com embarcador",
  paths: ["/operacao"],
  nav: {
    operational: [{ to: "/operacao", label: "Operação do dia", icon: RouteIcon, order: 15 }],
  },
};
