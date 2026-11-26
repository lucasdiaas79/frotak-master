import { createFileRoute } from "@tanstack/react-router";
import { FinancialChartPage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/plano-contas")({
  head: () => ({ meta: [{ title: "Gerenciais - Frotak" }] }),
  component: FinancialChartPage,
});
