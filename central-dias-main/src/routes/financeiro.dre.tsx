import { createFileRoute } from "@tanstack/react-router";
import { FinancialDrePage } from "@/modules/financial/ui/FinancialModule";

export const Route = createFileRoute("/financeiro/dre")({
  head: () => ({ meta: [{ title: "DRE Gerencial - Frotak" }] }),
  component: FinancialDrePage,
});
