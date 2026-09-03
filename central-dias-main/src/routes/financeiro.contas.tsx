import { createFileRoute } from "@tanstack/react-router";
import { FinancialAccountsPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/contas")({
  head: () => ({ meta: [{ title: "Bancos e Caixas - Frotak" }] }),
  component: FinancialAccountsPage,
});
