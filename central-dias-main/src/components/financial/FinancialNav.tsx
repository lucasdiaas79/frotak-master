import { Link, useLocation } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  Building2,
  Landmark,
  ReceiptText,
  Repeat2,
  RefreshCw,
  Tags,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getFinancialAccess } from "@/lib/financial/phase2";
import type { FinancialAccess } from "@/lib/financial/types";
import { cn } from "@/lib/utils";

const financeNav = [
  ["/financeiro", "Visao Geral", BadgeDollarSign],
  ["/financeiro/fluxo-caixa", "Fluxo de Caixa", WalletCards],
  ["/financeiro/dre", "DRE Gerencial", BarChart3],
  ["/financeiro/rentabilidade", "Rentabilidade", TrendingUp],
  ["/financeiro/receber", "A Receber", ArrowDownLeft],
  ["/financeiro/pagar", "A Pagar", ArrowUpRight],
  ["/financeiro/contas", "Bancos e Caixas", Landmark],
  ["/financeiro/salarios", "Salarios", ReceiptText],
  ["/financeiro/recorrencias", "Recorrencias", Repeat2],
  ["/financeiro/plano-contas", "Plano de Contas", Tags],
  ["/financeiro/centros-custo", "Centros de Custo", Building2],
  ["/financeiro/integracoes", "Configuracoes", RefreshCw],
] as const;

function canShowItem(to: string, access: FinancialAccess | null) {
  return (
    access?.isOwner ||
    (to !== "/financeiro/salarios" &&
      to !== "/financeiro/dre" &&
      to !== "/financeiro/fluxo-caixa") ||
    (to === "/financeiro/salarios" && access?.permissions.includes("financial.payroll.view")) ||
    (to === "/financeiro/dre" && access?.permissions.includes("financial.dre.view")) ||
    (to === "/financeiro/fluxo-caixa" && access?.permissions.includes("financial.cashflow.view"))
  );
}

export function FinancialNav() {
  const location = useLocation();
  const [access, setAccess] = useState<FinancialAccess | null>(null);

  useEffect(() => {
    getFinancialAccess()
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);

  const items = financeNav.filter(([to]) => canShowItem(to, access));

  return (
    <nav className="financial-nav mx-3 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/80 p-2 md:mx-0">
      {items.map(([to, label, Icon]) => {
        const active =
          location.pathname === to ||
          (to === "/financeiro/rentabilidade" && location.pathname === "/lucros-despesas");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition focus-visible:focus-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
