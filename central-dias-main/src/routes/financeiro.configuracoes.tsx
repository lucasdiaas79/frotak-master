import { createFileRoute } from "@tanstack/react-router";
import { FinancialSettingsPage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/configuracoes")({
  head: () => ({ meta: [{ title: "Configuracoes Financeiras - Frotak" }] }),
  component: FinancialSettingsPage,
});
