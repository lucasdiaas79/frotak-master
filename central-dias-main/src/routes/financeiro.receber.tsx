import { createFileRoute } from "@tanstack/react-router";
import { FinancialTitlesPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/receber")({
  head: () => ({ meta: [{ title: "Contas a Receber - Frotak" }] }),
  component: () => <FinancialTitlesPage direction="receivable" />,
});
