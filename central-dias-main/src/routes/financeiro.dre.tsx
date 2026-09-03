import { createFileRoute } from "@tanstack/react-router";
import { FinancialDrePage } from "@/components/financial/FinancialModule";

export const Route = createFileRoute("/financeiro/dre")({
  head: () => ({ meta: [{ title: "DRE Gerencial - Frotak" }] }),
  component: FinancialDrePage,
});
