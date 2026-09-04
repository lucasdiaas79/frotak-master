import { createFileRoute } from "@tanstack/react-router";
import { FleetProfitabilityPage } from "@/components/financial/FleetProfitabilityPage";

export const Route = createFileRoute("/financeiro/rentabilidade")({
  head: () => ({
    meta: [
      { title: "Rentabilidade - Frotak" },
      {
        name: "description",
        content: "Rentabilidade por caminhao, frete e cliente usando dados financeiros canonicos.",
      },
    ],
  }),
  component: FleetProfitabilityPage,
});
