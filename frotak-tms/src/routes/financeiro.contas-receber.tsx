import { createFileRoute } from "@tanstack/react-router";
import { FinancialTitlesPage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/contas-receber")({
  head: () => ({ meta: [{ title: "Contas a Receber - Frotak" }] }),
  component: () => <FinancialTitlesPage direction="receivable" />,
});
