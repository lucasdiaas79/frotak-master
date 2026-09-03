import { createFileRoute } from "@tanstack/react-router";
import { FinancialRecurringPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/recorrencias")({
  head: () => ({ meta: [{ title: "Salarios e Recorrencias - Frotak" }] }),
  component: FinancialRecurringPage,
});
