import { createFileRoute } from "@tanstack/react-router";
import { FinancialOverviewPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/")({
  head: () => ({ meta: [{ title: "Financeiro - Frotak" }] }),
  component: FinancialOverviewPage,
});
