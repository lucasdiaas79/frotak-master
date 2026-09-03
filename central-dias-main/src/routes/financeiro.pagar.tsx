import { createFileRoute } from "@tanstack/react-router";
import { FinancialTitlesPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar - Frotak" }] }),
  component: () => <FinancialTitlesPage direction="payable" />,
});
