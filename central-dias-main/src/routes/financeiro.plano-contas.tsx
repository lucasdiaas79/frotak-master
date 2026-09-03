import { createFileRoute } from "@tanstack/react-router";
import { FinancialChartPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/plano-contas")({
  head: () => ({ meta: [{ title: "Plano de Contas - Frotak" }] }),
  component: FinancialChartPage,
});
