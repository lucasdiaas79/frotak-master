import { createFileRoute } from "@tanstack/react-router";
import { FinancialCostsPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/custos")({
  head: () => ({ meta: [{ title: "Custos - Frotak" }] }),
  component: FinancialCostsPage,
});
