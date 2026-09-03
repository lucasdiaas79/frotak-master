import { createFileRoute } from "@tanstack/react-router";
import { FleetProfitabilityPage } from "@/routes/lucros-despesas";

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
