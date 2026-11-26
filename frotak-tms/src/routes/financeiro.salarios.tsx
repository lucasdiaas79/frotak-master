import { createFileRoute } from "@tanstack/react-router";
import { FinancialPayrollPage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/salarios")({
  head: () => ({ meta: [{ title: "Salarios - Frotak" }] }),
  component: FinancialPayrollPage,
});
