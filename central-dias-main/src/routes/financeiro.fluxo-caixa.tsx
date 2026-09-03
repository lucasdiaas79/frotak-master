import { createFileRoute } from "@tanstack/react-router";
import { FinancialCashFlowPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/fluxo-caixa")({
  head: () => ({ meta: [{ title: "Fluxo de Caixa - Frotak" }] }),
  component: FinancialCashFlowPage,
});
