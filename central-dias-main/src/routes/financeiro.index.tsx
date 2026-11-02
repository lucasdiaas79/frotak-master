import { createFileRoute } from "@tanstack/react-router";
import { FinancialOverviewPage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/")({
  head: () => ({ meta: [{ title: "Financeiro - Frotak" }] }),
  component: FinancialOverviewPage,
});
