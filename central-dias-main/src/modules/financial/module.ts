import { Landmark } from "lucide-react";
import type { TmsModule } from "@/modules/types";

export const financialModule: TmsModule = {
  code: "financial",
  label: "Financeiro",
  paths: ["/financeiro", "/lucros-despesas"],
  nav: {
    financial: [
      {
        to: "/financeiro",
        label: "Financeiro",
        icon: Landmark,
        activePaths: [
          "/financeiro",
          "/financeiro/fluxo-caixa",
          "/financeiro/dre",
          "/financeiro/rentabilidade",
          "/financeiro/receber",
          "/financeiro/contas-receber",
          "/financeiro/pagar",
          "/financeiro/contas-pagar",
          "/financeiro/contas",
          "/financeiro/salarios",
          "/financeiro/plano-contas",
          "/financeiro/centros-custo",
          "/lucros-despesas",
        ],
      },
    ],
  },
};
