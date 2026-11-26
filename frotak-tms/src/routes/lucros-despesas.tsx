import { createFileRoute } from "@tanstack/react-router";
import { FleetProfitabilityPage } from "@/modules/financial/ui/FleetProfitabilityPage";

export const Route = createFileRoute("/lucros-despesas")({
  head: () => ({
    meta: [
      { title: "Rentabilidade da Frota - FrotaK" },
      {
        name: "description",
        content: "Rentabilidade por caminhao, frete e cliente usando dados financeiros canonicos.",
      },
    ],
  }),
  component: FleetProfitabilityPage,
});
