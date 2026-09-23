import { createFileRoute } from "@tanstack/react-router";
import { FinancialCostCentersPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/centros-custo")({
  head: () => ({ meta: [{ title: "Apropriações - Frotak" }] }),
  component: FinancialCostCentersPage,
});
