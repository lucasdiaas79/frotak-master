import { createFileRoute } from "@tanstack/react-router";
import { FinancialAccountsPage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/contas")({
  head: () => ({ meta: [{ title: "Bancos e Caixas - Frotak" }] }),
  component: FinancialAccountsPage,
});
