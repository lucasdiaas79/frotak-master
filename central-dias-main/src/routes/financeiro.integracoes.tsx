import { createFileRoute } from "@tanstack/react-router";
import { FinancialIntegrationsPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/integracoes")({
  head: () => ({ meta: [{ title: "Integrações Financeiras - Frotak" }] }),
  component: FinancialIntegrationsPage,
});
