import { createFileRoute } from "@tanstack/react-router";
import { FinancialRecurringPage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/recorrencias")({
  head: () => ({ meta: [{ title: "Despesas Recorrentes - Frotak" }] }),
  component: FinancialRecurringPage,
});
