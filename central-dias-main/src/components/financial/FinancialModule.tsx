import { Link } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  Landmark,
  LoaderCircle,
  MoreVertical,
  Plus,
  Pencil,
  ReceiptText,
  Repeat2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Tags,
  TrendingDown,
  TrendingUp,
  Truck,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { FinancialNav } from "@/components/financial/FinancialNav";
import frotakLogo from "@/assets/logo-central.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { listCanonicalFreights } from "@/lib/financial/foundation";
import {
  getFinancialAccess,
  getFinancialDocumentDetails,
  hasFinancialPermission,
  listFinancialAccounts,
  listFinancialChart,
  listFinancialCostCenters,
  listFinancialDocuments,
  listFinancialDocumentsPage,
  listFinancialPartners,
  reverseSettlement,
  saveBusinessPartner,
  saveChartAccount,
  saveCostCenter,
  saveFinancialAccount,
  saveFinancialDocument,
  settleInstallment,
  voidFinancialDocument,
} from "@/lib/financial/phase2";
import {
  generateDueFinancialRecurringDocuments,
  generateFinancialRecurringDocuments,
  listFinancialRecurringRules,
  saveFinancialRecurringRule,
  saveFinancialDocumentWithRecurring,
  setFinancialRecurringRuleStatus,
} from "@/lib/financial/phase5";
import {
  approvePayrollEntry,
  calculatePayrollEntry,
  createPayrollEntry,
  deletePayrollItem,
  listEmployeeFinancialProfiles,
  listPayrollEntries,
  postPayrollEntry,
  saveEmployeeFinancialProfile,
  savePayrollItem,
  voidPayrollEntry,
} from "@/lib/financial/payroll";
import {
  getCashFlowEntries,
  getCashFlowSummary,
  getDre12MonthStatement,
  getDreDetail,
  getDreSummary,
  getFinancialDashboard,
} from "@/lib/financial/reports";
import type {
  BusinessPartner,
  CashFlowEntry,
  CashFlowSummary,
  CanonicalFreight,
  ChartAccount,
  CostCenter,
  Dre12MonthBasis,
  Dre12MonthStatement as Dre12MonthStatementData,
  DreDetail,
  DreGroupRow,
  DreSummary,
  EmployeeFinancialProfile,
  FinancialAccess,
  FinancialAccount,
  FinancialDashboard,
  FinancialDocumentDetails,
  FinancialDocumentDirection,
  FinancialDocumentsPageSummary,
  FinancialDocumentInput,
  FinancialRecurringFrequency,
  FinancialInstallment,
  FinancialRecurringKind,
  FinancialRecurringRule,
  FinancialRecurringRuleInput,
  FinancialSettlement,
  PayrollEntry,
  PayrollEntryStatus,
  PayrollItemType,
} from "@/lib/financial/types";
import { useFleet } from "@/lib/store";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

function useFinancialAccess() {
  const [access, setAccess] = useState<FinancialAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getFinancialAccess()
      .then(setAccess)
      .catch(() => setError("Você não possui acesso ao módulo Financeiro."))
      .finally(() => setLoading(false));
  }, []);
  return { access, loading, error };
}

function FinancialBoundary({ children }: { children: (access: FinancialAccess) => ReactNode }) {
  const { access, loading, error } = useFinancialAccess();
  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Carregando Financeiro...
      </div>
    );
  if (!access?.canView)
    return (
      <div className="premium-card m-3 flex min-h-[360px] items-center justify-center p-8 text-center md:m-0">
        <div>
          <Landmark className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="text-lg font-bold">Acesso restrito</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {error || "Solicite uma permissão financeira ao owner."}
          </p>
        </div>
      </div>
    );
  return <>{children(access)}</>;
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
  featured = false,
}: {
  label: string;
  value: number | string;
  icon: typeof Banknote;
  tone?: "default" | "danger" | "success";
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "premium-card financial-kpi min-w-0 p-4",
        featured && "sm:col-span-2 xl:col-span-2",
        tone === "success" && "border-primary/25 bg-primary/5",
        tone === "danger" && "border-destructive/25 bg-destructive/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface/70">
          <Icon
            className={cn(
              "size-4",
              tone === "danger"
                ? "text-destructive"
                : tone === "success"
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          />
        </span>
      </div>
      <div
        className={cn(
          "financial-kpi-value mt-3 text-xl font-black",
          featured && "text-2xl md:text-3xl",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-primary",
        )}
      >
        {typeof value === "number" ? money.format(value) : value}
      </div>
    </div>
  );
}

function effectiveSettlements(document: FinancialDocumentDetails) {
  const reversed = new Set(
    document.settlements
      .filter((s) => s.settlementType === "reversal")
      .map((s) => s.originalSettlementId),
  );
  return document.settlements.filter(
    (s) => s.settlementType === "settlement" && !reversed.has(s.id),
  );
}

export function FinancialOverviewPage() {
  return <FinancialBoundary>{(access) => <OverviewContent access={access} />}</FinancialBoundary>;
}

function LegacyOverviewContent() {
  const [documents, setDocuments] = useState<FinancialDocumentDetails[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  useEffect(() => {
    Promise.all([listFinancialDocuments(), listFinancialAccounts()])
      .then(([d, a]) => {
        setDocuments(d);
        setAccounts(a);
      })
      .catch(() => toast.error("Não foi possível carregar a visão financeira."));
  }, []);
  const open = documents.filter((d) => !["draft", "voided", "settled"].includes(d.status));
  const received = documents
    .filter((d) => d.direction === "receivable")
    .flatMap(effectiveSettlements)
    .filter((s) => s.settledOn >= monthStart())
    .reduce((sum, s) => sum + s.netAmount, 0);
  const paid = documents
    .filter((d) => d.direction === "payable")
    .flatMap(effectiveSettlements)
    .filter((s) => s.settledOn >= monthStart())
    .reduce((sum, s) => sum + s.netAmount, 0);
  const overdue = open
    .flatMap((d) => d.installments)
    .filter((i) => i.balance > 0 && i.dueDate < today());
  return (
    <div
      className={cn(
        "financial-shell space-y-4",
        receiving ? "financial-receivables-shell" : "financial-payables-shell",
      )}
    >
      <PageHeader title="Financeiro" subtitle="Controle real de contas, vencimentos e caixa" />
      <FinancialNav />
      <div className="grid grid-cols-2 gap-3 px-3 md:grid-cols-3 lg:grid-cols-6 md:px-0">
        <Stat
          label="A receber"
          value={open
            .filter((d) => d.direction === "receivable")
            .reduce((s, d) => s + d.installments.reduce((a, i) => a + i.balance, 0), 0)}
          icon={ArrowDownLeft}
        />
        <Stat
          label="A pagar"
          value={open
            .filter((d) => d.direction === "payable")
            .reduce((s, d) => s + d.installments.reduce((a, i) => a + i.balance, 0), 0)}
          icon={ArrowUpRight}
        />
        <Stat label="Recebido no mês" value={received} icon={CircleDollarSign} tone="success" />
        <Stat label="Pago no mês" value={paid} icon={ReceiptText} />
        <Stat
          label="Saldo financeiro"
          value={accounts.reduce((s, a) => s + a.currentBalance, 0)}
          icon={Landmark}
          tone="success"
        />
        <Stat label="Títulos vencidos" value={overdue.length} icon={CalendarClock} tone="danger" />
      </div>
      <div className="grid gap-3 px-3 lg:grid-cols-2 md:px-0">
        <Upcoming
          title="Próximos recebimentos"
          documents={documents.filter((d) => d.direction === "receivable")}
        />
        <Upcoming
          title="Próximos pagamentos"
          documents={documents.filter((d) => d.direction === "payable")}
        />
      </div>
    </div>
  );
}

function Upcoming({ title, documents }: { title: string; documents: FinancialDocumentDetails[] }) {
  const items = documents
    .flatMap((d) =>
      d.installments.map((i) => ({ ...i, description: d.description, partner: d.partnerName })),
    )
    .filter((i) => i.balance > 0 && i.dueDate >= today())
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  return (
    <section className="premium-card p-4">
      <h2 className="text-sm font-extrabold">{title}</h2>
      <div className="mt-3 divide-y divide-border">
        {items.length ? (
          items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-3">
              <CalendarClock className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{i.description}</div>
                <div className="text-xs text-muted-foreground">
                  {i.partner || "Sem parceiro"} · {date.format(new Date(`${i.dueDate}T12:00:00`))}
                </div>
              </div>
              <strong className="text-sm">{money.format(i.balance)}</strong>
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum vencimento próximo.
          </p>
        )}
      </div>
    </section>
  );
}

type PeriodMode = "month" | "quarter" | "year" | "custom";

function periodBounds(mode: PeriodMode) {
  const now = new Date(`${today()}T12:00:00`);
  const year = now.getFullYear();
  const month = now.getMonth();
  if (mode === "year") return [`${year}-01-01`, `${year}-12-31`];
  if (mode === "quarter") {
    const quarterStart = Math.floor(month / 3) * 3;
    const start = new Date(year, quarterStart, 1);
    const end = new Date(year, quarterStart + 3, 0);
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  }
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function marginLabel(value: number | null) {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function signedMoney(value: number) {   return `${value >= 0 ? "+" : "-"} ${money.format(Math.abs(value))}`; }  function exportCsv(filename: string, rows: Array<Record<string, string | number | null>>) {   if (!rows.length) {     toast.info("Nao ha dados para exportar.");     return;   }   const headers = Object.keys(rows[0]);   const csv = [     headers.join(";"),     ...rows.map((row) =>       headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(";"),     ),   ].join("\n");   const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });   const url = URL.createObjectURL(blob);   const link = document.createElement("a");   link.href = url;   link.download = filename;   link.click();   URL.revokeObjectURL(url); }  function ReportPeriodControls({
  mode,
  start,
  end,
  onMode,
  onStart,
  onEnd,
  compact = false,
}: {
  mode: PeriodMode;
  start: string;
  end: string;
  onMode: (mode: PeriodMode) => void;
  onStart: (date: string) => void;
  onEnd: (date: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 px-3 sm:grid-cols-4 md:px-0",
        compact && "financial-period-bar px-0 sm:grid-cols-[1.05fr_1fr_1fr]",
      )}
    >
      <Field label="Periodo">
        <Select
          value={mode}
          onValueChange={(value) => {
            const nextMode = value as PeriodMode;
            onMode(nextMode);
            if (nextMode !== "custom") {
              const [nextStart, nextEnd] = periodBounds(nextMode);
              onStart(nextStart);
              onEnd(nextEnd);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mes atual</SelectItem>
            <SelectItem value="quarter">Trimestre atual</SelectItem>
            <SelectItem value="year">Ano atual</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Inicio">
        <Input type="date" value={start} onChange={(event) => onStart(event.target.value)} />
      </Field>
      <Field label="Fim">
        <Input type="date" value={end} onChange={(event) => onEnd(event.target.value)} />
      </Field>
    </div>
  );
}

function LoadingReport() {
  return (
    <div className="premium-card mx-3 min-h-[300px] p-4 md:mx-0">
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl bg-surface/70" />
        ))}
      </div>
      <div className="mt-4 h-48 animate-pulse rounded-xl bg-surface/70" />
      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Carregando dados financeiros...
      </div>
    </div>
  );
}

function EmptyReport({ text }: { text: string }) {
  return (
    <div className="financial-empty p-8 text-center text-sm text-muted-foreground">
      <Landmark className="mx-auto mb-3 size-7 text-muted-foreground" />
      {text}
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  icon: Icon,
  tone = "default",
  helper,
}: {
  label: string;
  value: number | string;
  icon: typeof Banknote;
  tone?: "default" | "success" | "danger";
  helper?: string;
}) {
  return (
    <article
      className={cn(
        "financial-executive-metric",
        tone === "success" && "financial-executive-metric-success",
        tone === "danger" && "financial-executive-metric-danger",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="financial-eyebrow">{label}</p>
          {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
        </div>
        <span className="financial-icon-orb">
          <Icon className="size-4" />
        </span>
      </div>
      <strong className="financial-hero-value">
        {typeof value === "number" ? money.format(value) : value}
      </strong>
    </article>
  );
}

function SupportMetric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: typeof Banknote;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <article
      className={cn(
        "financial-support-metric",
        tone === "success" && "text-primary",
        tone === "danger" && "text-destructive",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="financial-eyebrow">{label}</p>
        <strong className="financial-support-value">
          {typeof value === "number" ? money.format(value) : value}
        </strong>
      </div>
    </article>
  );
}

function ObligationGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{
    label: string;
    value: number | string;
    icon: typeof Banknote;
    tone?: "default" | "success" | "danger" | "warning";
  }>;
}) {
  return (
    <section className="financial-obligation-group">
      <h3 className="financial-section-kicker">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="financial-obligation-row">
              <div className="flex min-w-0 items-center gap-2">
                <Icon
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground",
                    item.tone === "success" && "text-primary",
                    item.tone === "danger" && "text-destructive",
                    item.tone === "warning" && "text-amber-500",
                  )}
                />
                <span className="truncate text-xs font-bold text-muted-foreground">
                  {item.label}
                </span>
              </div>
              <strong
                className={cn(
                  "shrink-0 text-sm font-black",
                  item.tone === "success" && "text-primary",
                  item.tone === "danger" && "text-destructive",
                  item.tone === "warning" && "text-amber-600",
                )}
              >
                {typeof item.value === "number" ? money.format(item.value) : item.value}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExecutiveCashMetric({
  label,
  value,
  icon: Icon,
  tone,
  signed,
}: {
  label: string;
  value: number;
  icon: typeof Banknote;
  tone?: "success" | "danger";
  signed?: boolean;
}) {
  return (
    <div className="financial-cash-row">
      <span className="financial-cash-icon">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <strong
          className={cn(
            "financial-cash-value",
            tone === "success" && "text-primary",
            tone === "danger" && "text-destructive",
          )}
        >
          {signed ? signedMoney(value) : money.format(value)}
        </strong>
      </div>
    </div>
  );
}

function RestrictedReport({ permission }: { permission: string }) {
  return (
    <div className="premium-card mx-3 flex min-h-[260px] items-center justify-center p-8 text-center md:mx-0">
      <div>
        <ShieldAlert className="mx-auto mb-3 size-8 text-primary" />
        <h2 className="text-lg font-bold">Relatorio restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Solicite a permissao {permission} ao owner.
        </p>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
  signed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "text-sm",
          tone === "success" && "text-primary",
          tone === "danger" && "text-destructive",
        )}
      >
        {signed ? signedMoney(value) : money.format(value)}
      </strong>
    </div>
  );
}

function FinancialStatusBadge({
  state,
  children,
}: {
  state: "default" | "success" | "danger" | "warning" | "muted";
  children: ReactNode;
}) {
  return (
    <Badge
      variant={state === "danger" ? "destructive" : state === "success" ? "default" : "outline"}
      className={cn(
        "whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold",
        state === "warning" && "border-amber-500/35 bg-amber-500/10 text-amber-700",
        state === "muted" && "text-muted-foreground",
      )}
    >
      {children}
    </Badge>
  );
}

function OverviewContent({ access }: { access: FinancialAccess }) {
  const [mode, setMode] = useState<PeriodMode>("month");
  const [start, setStart] = useState(() => periodBounds("month")[0]);
  const [end, setEnd] = useState(() => periodBounds("month")[1]);
  const [dashboard, setDashboard] = useState<FinancialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const canDashboard = hasFinancialPermission(access, "financial.dashboard.view");
  useEffect(() => {
    if (!canDashboard) return;
    setLoading(true);
    getFinancialDashboard({ workspaceId: access.workspaceId, startDate: start, endDate: end })
      .then(setDashboard)
      .catch(() => toast.error("Nao foi possivel carregar o dashboard financeiro."))
      .finally(() => setLoading(false));
  }, [access.workspaceId, canDashboard, start, end]);

  if (!canDashboard) {
    return (
      <div className="financial-shell space-y-4">
        <PageHeader
          title="Financeiro"
          subtitle="Visao consolidada da saude financeira da operacao."
        />
        <FinancialNav compact />
        <RestrictedReport permission="financial.dashboard.view" />
      </div>
    );
  }

  const totals = dashboard?.dre.totals;
  const positions = dashboard?.positions;
  const cash = dashboard?.cashFlow;
  return (
    <div className="financial-shell financial-overview-shell">
      <div className="financial-overview-top">
        <div className="min-w-0">
          <p className="financial-eyebrow">Cockpit financeiro</p>
          <h1 className="mt-1 text-2xl font-black tracking-normal text-foreground md:text-3xl">
            Financeiro
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Visao consolidada da saude financeira da operacao.
          </p>
        </div>
        <ReportPeriodControls
          mode={mode}
          start={start}
          end={end}
          onMode={setMode}
          onStart={setStart}
          onEnd={setEnd}
          compact
        />
      </div>
      <FinancialNav compact />
      {loading || !dashboard || !totals || !positions || !cash ? (
        <LoadingReport />
      ) : (
        <>
          <section className="financial-hero-grid">
            <ExecutiveMetric
              label="Saldo disponivel"
              value={cash.realized.closingBalance}
              icon={Landmark}
              helper="Caixa realizado no periodo"
            />
            <ExecutiveMetric
              label="Resultado do periodo"
              value={totals.managerial_result}
              icon={totals.managerial_result < 0 ? TrendingDown : TrendingUp}
              tone={totals.managerial_result < 0 ? "danger" : "success"}
              helper="Receitas menos custos e despesas"
            />
            <div className="financial-support-stack">
              <SupportMetric
                label="Receitas do periodo"
                value={totals.gross_revenue}
                icon={ArrowDownLeft}
                tone="success"
              />
              <SupportMetric
                label="Custos + despesas"
                value={Math.abs(totals.variable_costs + totals.operating_expenses)}
                icon={ArrowUpRight}
              />
              <SupportMetric
                label="Margem"
                value={marginLabel(totals.managerialMargin)}
                icon={BarChart3}
                tone={totals.managerial_result < 0 ? "danger" : "success"}
              />
            </div>
          </section>

          <section className="financial-obligations">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div>
                <p className="financial-eyebrow">Compromissos</p>
                <h2 className="text-base font-black">Obrigacoes e alertas de caixa</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ObligationGroup
                title="Posicao"
                items={[
                  { label: "A receber", value: positions.receivable_open, icon: WalletCards },
                  { label: "A pagar", value: positions.payable_open, icon: ReceiptText },
                ]}
              />
              <ObligationGroup
                title="Atencao"
                items={[
                  {
                    label: "Receber vencido",
                    value: positions.receivable_overdue,
                    icon: CalendarClock,
                    tone: positions.receivable_overdue > 0 ? "danger" : "default",
                  },
                  {
                    label: "Pagar vencido",
                    value: positions.payable_overdue,
                    icon: ShieldAlert,
                    tone: positions.payable_overdue > 0 ? "danger" : "default",
                  },
                  {
                    label: "Vence em 7 dias",
                    value: positions.due_next_7d,
                    icon: CalendarClock,
                    tone: positions.due_next_7d > 0 ? "warning" : "default",
                  },
                ]}
              />
              <ObligationGroup
                title="Curto prazo"
                items={[
                  {
                    label: "Entradas 30 dias",
                    value: cash.projection.inflows_30d,
                    icon: ArrowDownLeft,
                    tone: "success",
                  },
                  {
                    label: "Saidas 30 dias",
                    value: cash.projection.outflows_30d,
                    icon: ArrowUpRight,
                  },
                ]}
              />
            </div>
          </section>

          <div className="financial-analysis-grid">
            <section className="financial-chart-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="financial-eyebrow">Evolucao</p>
                  <h2 className="text-base font-black">Evolucao mensal por competencia</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden items-center gap-1 text-xs font-bold text-muted-foreground sm:flex">
                    <span className="size-2 rounded-full bg-primary" />
                    Receita
                  </span>
                  <span className="hidden items-center gap-1 text-xs font-bold text-muted-foreground sm:flex">
                    <span className="size-2 rounded-full bg-[#f97316]" />
                    Custos
                  </span>
                  <Badge variant="outline" className="rounded-lg">
                    12 meses
                  </Badge>
                </div>
              </div>
              <div className="mt-5 h-[300px] md:h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.evolution}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${Number(value) / 1000}k`}
                    />
                    <ChartTooltip formatter={(value) => money.format(Number(value))} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Receita"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="costs_expenses"
                      name="Custos/Despesas"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="result"
                      name="Resultado"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="financial-cash-panel">
              <div>
                <p className="financial-eyebrow">Caixa realizado</p>
                <h2 className="text-base font-black">Fluxo realizado no periodo</h2>
              </div>
              <div className="mt-5 grid gap-3">
                <ExecutiveCashMetric
                  label="Saldo inicial"
                  value={cash.openingBalance}
                  icon={Landmark}
                />
                <ExecutiveCashMetric
                  label="Entradas realizadas"
                  value={cash.realized.inflows}
                  icon={ArrowDownLeft}
                  tone="success"
                />
                <ExecutiveCashMetric
                  label="Saidas realizadas"
                  value={cash.realized.outflows}
                  icon={ArrowUpRight}
                />
                <ExecutiveCashMetric
                  label="Variacao de caixa"
                  value={cash.realized.net_change}
                  icon={cash.realized.net_change < 0 ? TrendingDown : TrendingUp}
                  tone={cash.realized.net_change < 0 ? "danger" : "success"}
                  signed
                />
              </div>
            </section>
          </div>

          <div className="financial-intel-grid">
            <section className="financial-intel-panel">
              <div>
                <p className="financial-eyebrow">Custos</p>
                <h2 className="text-base font-black">Top categorias de custo</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {dashboard.topCosts.length ? (
                  dashboard.topCosts.map((item, index) => {
                    const maxAmount = Math.max(...dashboard.topCosts.map((cost) => cost.amount));
                    const width =
                      maxAmount > 0 ? `${Math.max(8, (item.amount / maxAmount) * 100)}%` : "8%";
                    return (
                      <div key={item.id} className="financial-cost-row">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="financial-rank">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold">{item.name}</div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                              <div className="h-full rounded-full bg-primary" style={{ width }} />
                            </div>
                            <div className="mt-1 text-[11px] font-bold text-muted-foreground">
                              {item.code}
                            </div>
                          </div>
                        </div>
                        <strong className="shrink-0 text-sm font-black">
                          {money.format(item.amount)}
                        </strong>
                      </div>
                    );
                  })
                ) : (
                  <EmptyReport text="Nenhum custo no periodo." />
                )}
              </div>
            </section>
            <section className="financial-intel-panel">
              <div>
                <p className="financial-eyebrow">Inteligencia executiva</p>
                <h2 className="text-base font-black">Alertas financeiros</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {dashboard.alerts.length ? (
                  dashboard.alerts.map((alert) => (
                    <div
                      key={alert.type}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border p-3 text-sm",
                        alert.severity === "danger"
                          ? "border-destructive/30 bg-destructive/8"
                          : "border-amber-500/30 bg-amber-500/8",
                      )}
                    >
                      <span className="font-bold">{alert.label}</span>
                      <span className="shrink-0 font-black">
                        {alert.amount !== undefined ? money.format(alert.amount) : alert.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyReport text="Sem alertas criticos no periodo." />
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function FinancialDrePage() {
  return <FinancialBoundary>{(access) => <DreContent access={access} />}</FinancialBoundary>;
}

function dreValueTone(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function DreExecutiveSummary({ summary }: { summary: DreSummary }) {
  return (
    <section className="financial-dre-summary">
      <article className="financial-dre-result-card">
        <p className="financial-eyebrow">Resultado Gerencial</p>
        <strong
          className={cn(
            "financial-dre-result-value",
            summary.totals.managerial_result < 0 && "text-destructive",
          )}
        >
          {money.format(summary.totals.managerial_result)}
        </strong>
      </article>
      <article className="financial-dre-margin-card">
        <p className="financial-eyebrow">Margem</p>
        <strong>{marginLabel(summary.totals.managerialMargin)}</strong>
      </article>
      <div className="financial-dre-secondary-metrics">
        <MiniMetric label="Receita bruta" value={summary.totals.gross_revenue} tone="success" />
        <MiniMetric label="Custos" value={Math.abs(summary.totals.variable_costs)} />
        <MiniMetric label="Despesas" value={Math.abs(summary.totals.operating_expenses)} />
      </div>
    </section>
  );
}

function DreStatement({
  summary,
  selectedGroup,
  onGroup,
}: {
  summary: DreSummary;
  selectedGroup: string | null;
  onGroup: (group: DreGroupRow) => void;
}) {
  const groups = [...summary.groups].sort((a, b) => a.sort_order - b.sort_order);
  const hasRevenueGroup = groups.some((group) =>
    ["gross_revenue", "revenue_deduction"].includes(group.dre_group),
  );
  const hasCostGroup = groups.some((group) => group.dre_group === "variable_cost");
  const hasOperatingGroup = groups.some((group) =>
    ["operating_expense", "depreciation_amortization"].includes(group.dre_group),
  );

  return (
    <section className="financial-dre-statement">
      <div className="financial-dre-statement-head">
        <div>
          <p className="financial-section-kicker">Demonstrativo</p>
          <h2>DRE Gerencial</h2>
        </div>
        <Badge variant={summary.reconciliation.ok ? "outline" : "destructive"}>
          {summary.reconciliation.ok ? "Reconciliado" : "Diferença"}
        </Badge>
      </div>
      <div className="financial-dre-sheet">
        {groups.map((group) => (
          <button
            key={group.dre_group}
            type="button"
            onClick={() => onGroup(group)}
            className={cn(
              "financial-dre-row",
              selectedGroup === group.dre_group && "financial-dre-row-selected",
            )}
          >
            <div className="financial-dre-row-label">
              <span>{group.label}</span>
              <small>{group.document_count} documentos</small>
            </div>
            <div className="financial-dre-row-value">
              <strong
                className={cn(
                  dreValueTone(group.signed_amount) === "positive" && "text-primary",
                  dreValueTone(group.signed_amount) === "negative" && "text-destructive",
                )}
              >
                {signedMoney(group.signed_amount)}
              </strong>
              <ChevronRight className="size-4" />
            </div>
          </button>
        ))}
        {hasRevenueGroup && (
          <div className="financial-dre-row financial-dre-subtotal">
            <div className="financial-dre-row-label">
              <span>Receita líquida</span>
            </div>
            <strong>{money.format(summary.totals.netRevenue)}</strong>
          </div>
        )}
        {hasCostGroup && (
          <div className="financial-dre-row financial-dre-subtotal">
            <div className="financial-dre-row-label">
              <span>Resultado bruto</span>
            </div>
            <strong>{money.format(summary.totals.grossResult)}</strong>
          </div>
        )}
        {hasOperatingGroup && (
          <div className="financial-dre-row financial-dre-subtotal">
            <div className="financial-dre-row-label">
              <span>Resultado operacional</span>
            </div>
            <strong>{money.format(summary.totals.operatingResult)}</strong>
          </div>
        )}
        <div className="financial-dre-row financial-dre-final">
          <div className="financial-dre-row-label">
            <span>Resultado gerencial</span>
            <small>Margem {marginLabel(summary.totals.managerialMargin)}</small>
          </div>
          <strong
            className={cn(
              summary.totals.managerial_result < 0 ? "text-destructive" : "text-primary",
            )}
          >
            {money.format(summary.totals.managerial_result)}
          </strong>
        </div>
      </div>
      {(summary.totals.unclassified_amount > 0 || summary.totals.unallocated_amount > 0) && (
        <div className="financial-dre-notes">
          {summary.totals.unclassified_amount > 0 && (
            <span>
              {money.format(summary.totals.unclassified_amount)} pendentes de classificação.
            </span>
          )}
          {summary.totals.unallocated_amount > 0 && (
            <span>Resíduo não alocado: {money.format(summary.totals.unallocated_amount)}.</span>
          )}
        </div>
      )}
    </section>
  );
}

function DreDetailPanel({
  detail,
  selectedAccount,
  onAccount,
}: {
  detail: DreDetail | null;
  selectedAccount: string | null;
  onAccount: (account: string | null) => void;
}) {
  return (
    <aside className="financial-dre-detail">
      <div>
        <p className="financial-section-kicker">Drilldown</p>
        <h2>Detalhamento</h2>
      </div>
      {!detail ? (
        <div className="financial-dre-detail-empty">Selecione uma linha da DRE.</div>
      ) : selectedAccount ? (
        <div className="financial-dre-detail-list">
          {detail.documents.map((document) => (
            <div key={document.document_id} className="financial-dre-document">
              <div className="min-w-0">
                <strong>{document.description}</strong>
                <span>
                  {date.format(new Date(`${document.competence_date}T12:00:00`))} ·{" "}
                  {document.partner_name || "Sem parceiro"} · {document.source_type || "manual"}
                </span>
              </div>
              <strong className={cn(document.signed_amount < 0 && "text-destructive")}>
                {signedMoney(document.signed_amount)}
              </strong>
              {document.visible_document_id === null && (
                <Badge variant="outline">salarios restritos</Badge>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="financial-dre-detail-list">
          {detail.accounts.map((account) => (
            <button
              key={account.chart_account_id || "unclassified"}
              type="button"
              onClick={() => onAccount(account.chart_account_id)}
              className="financial-dre-account"
            >
              <div className="min-w-0">
                <strong>{account.name}</strong>
                <span>
                  {account.code} · {account.document_count} documentos
                </span>
              </div>
              <div className="financial-dre-account-value">
                <strong className={cn(account.signed_amount < 0 && "text-destructive")}>
                  {signedMoney(account.signed_amount)}
                </strong>
                <Eye className="size-4" />
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function dreYearFromDate(value: string) {
  const parsed = Number(value.slice(0, 4));
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

function Dre12MonthStatement({
  statement,
  loading,
}: {
  statement: Dre12MonthStatementData | null;
  loading: boolean;
}) {
  const rows = statement?.rows ?? [];
  const months = statement?.months ?? [];
  const basis = statement?.basis ?? "accrual";

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <img src={frotakLogo} alt="Frotak" className="h-12 w-24 rounded-md object-cover" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Demonstrativo gerencial 12 meses
            </p>
            <h2 className="text-xl font-black">
              {statement?.title ?? "Demonstrativo gerencial 12 meses"}
            </h2>
            <span className="text-sm text-muted-foreground">
              Ano base: {statement?.year ?? new Date().getFullYear()} · Base: {statement?.basisLabel ?? "Lancamento"}
            </span>
          </div>
        </div>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:text-right">
          <span>Base: {basis === "cash" ? "Conciliacao" : "Lancamento"}</span>
          <span>{basis === "cash" ? "Data da baixa/conciliacao" : "Competencia do motor financeiro"}</span>
          <span>{basis === "cash" ? "Somente pago/recebido" : "Independe de pagamento"}</span>
          <span>Gerado em {date.format(new Date())}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="w-[360px] py-2 pr-3">Conta</th>
              {months.map((month) => (
                <th key={month.index} className="px-2 py-2 text-right">
                  {month.label.slice(0, 3)}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Total</th>
              <th className="py-2 pl-2 text-right">Media</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={15} className="py-8 text-center text-muted-foreground">
                  Carregando demonstrativo...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => {
                const isRoot = row.level === 0;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/70",
                      isRoot && "bg-muted/35 font-black",
                      row.level === 1 && "font-bold",
                    )}
                  >
                    <td className="py-2 pr-3">
                      <div style={{ paddingLeft: row.level * 14 }} className="flex min-w-0 gap-2">
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {row.code}
                        </span>
                        <span className="truncate">{row.name}</span>
                      </div>
                    </td>
                    {row.monthly.map((value, index) => (
                      <td
                        key={`${row.id}-${index}`}
                        className={cn("px-2 py-2 text-right", value < 0 && "text-destructive")}
                      >
                        {value ? money.format(value) : "-"}
                      </td>
                    ))}
                    <td className={cn("px-2 py-2 text-right font-bold", row.total < 0 && "text-destructive")}>
                      {money.format(row.total)}
                    </td>
                    <td className={cn("py-2 pl-2 text-right", row.average < 0 && "text-destructive")}>
                      {money.format(row.average)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={15} className="py-8 text-center text-muted-foreground">
                  Nenhum lancamento gerencial encontrado para o ano selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DreContent({ access }: { access: FinancialAccess }) {
  const [mode, setMode] = useState<PeriodMode>("month");
  const [start, setStart] = useState(() => periodBounds("month")[0]);
  const [end, setEnd] = useState(() => periodBounds("month")[1]);
  const [costCenterId, setCostCenterId] = useState("all");
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [summary, setSummary] = useState<DreSummary | null>(null);
  const [detail, setDetail] = useState<DreDetail | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dre12Basis, setDre12Basis] = useState<Dre12MonthBasis>("accrual");
  const [dre12Statement, setDre12Statement] = useState<Dre12MonthStatementData | null>(null);
  const [dre12Loading, setDre12Loading] = useState(true);
  const canDre = hasFinancialPermission(access, "financial.dre.view");
  const dreYear = dreYearFromDate(start);

  const payload = useMemo(
    () => ({
      workspaceId: access.workspaceId,
      startDate: start,
      endDate: end,
      costCenterId: costCenterId === "all" ? null : costCenterId,
    }),
    [access.workspaceId, costCenterId, end, start],
  );

  const loadSummary = useCallback(async () => {
    if (!canDre) return;
    setLoading(true);
    setDre12Loading(true);
    const [nextSummary, nextCenters, nextStatement] = await Promise.all([
      getDreSummary(payload),
      listFinancialCostCenters(access.workspaceId),
      getDre12MonthStatement({
        workspaceId: access.workspaceId,
        year: dreYear,
        basis: dre12Basis,
        costCenterId: costCenterId === "all" ? null : costCenterId,
      }),
    ]);
    setSummary(nextSummary);
    setCenters(nextCenters);
    setDre12Statement(nextStatement);
    setDetail(null);
    setSelectedGroup(null);
    setSelectedAccount(null);
    setLoading(false);
    setDre12Loading(false);
  }, [access.workspaceId, canDre, costCenterId, dre12Basis, dreYear, payload]);

  useEffect(() => {
    loadSummary().catch(() => {
      setLoading(false);
      setDre12Loading(false);
      toast.error("Nao foi possivel carregar a DRE gerencial.");
    });
  }, [loadSummary]);

  const openGroup = async (group: DreGroupRow) => {
    setSelectedGroup(group.dre_group);
    setSelectedAccount(null);
    setDetail(await getDreDetail({ ...payload, dreGroup: group.dre_group }));
  };

  const openAccount = async (account: string | null) => {
    setSelectedAccount(account);
    setDetail(
      await getDreDetail({
        ...payload,
        dreGroup: selectedGroup,
        chartAccountId: account,
      }),
    );
  };

  if (!canDre) {
    return (
      <div className="financial-shell space-y-4">
        <PageHeader title="DRE Gerencial" subtitle="Visao gerencial por regime de competencia" />
        <FinancialNav />
        <RestrictedReport permission="financial.dre.view" />
      </div>
    );
  }

  return (
    <div className="financial-shell financial-dre-shell space-y-4">
      <PageHeader
        title="DRE Gerencial"
        subtitle="Visao gerencial por regime de competencia"
        actions={
          summary ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  'dre-' + start + '-' + end + '.csv',
                  summary.groups.map((group) => ({
                    grupo: group.label,
                    valor_assinado: group.signed_amount,
                    movimento: group.movement_amount,
                    documentos: group.document_count,
                  })),
                )
              }
            >
              <Download className="size-4" />
              CSV
            </Button>
          ) : undefined
        }
      />
      <FinancialNav />
      <section className="financial-dre-control-bar">
        <ReportPeriodControls
          mode={mode}
          start={start}
          end={end}
          onMode={setMode}
          onStart={setStart}
          onEnd={setEnd}
          compact
        />
        <Field label="Apropriacao">
          <Select value={costCenterId} onValueChange={setCostCenterId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Consolidado</SelectItem>
              {centers.map((center) => (
                <SelectItem key={center.id} value={center.id}>
                  {center.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Base">
          <Select value={dre12Basis} onValueChange={(value) => setDre12Basis(value as Dre12MonthBasis)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accrual">Lançamento</SelectItem>
              <SelectItem value="cash">Conciliação</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </section>
      {loading || !summary ? (
        <LoadingReport />
      ) : (
        <>
          <DreExecutiveSummary summary={summary} />
          <Dre12MonthStatement statement={dre12Statement} loading={dre12Loading} />
          <div className="financial-dre-layout">
            <DreStatement
              summary={summary}
              selectedGroup={selectedGroup}
              onGroup={(group) => openGroup(group).catch(() => toast.error("Falha no drilldown."))}
            />
            <DreDetailPanel
              detail={detail}
              selectedAccount={selectedAccount}
              onAccount={(account) =>
                openAccount(account).catch(() => toast.error("Falha no detalhe."))
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

export function FinancialCashFlowPage() {
  return <FinancialBoundary>{(access) => <CashFlowContent access={access} />}</FinancialBoundary>;
}

const cashFlowStatusLabel: Record<CashFlowEntry["status"], string> = {
  settlement: "Realizado",
  reversal: "Estorno",
  forecast: "Previsto",
  overdue: "Vencido",
};

type CashFlowDayGroup = {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  count: number;
};

function CashFlowMovementStep({
  label,
  value,
  tone = "default",
  featured = false,
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "outflow";
  featured?: boolean;
}) {
  return (
    <article
      className={cn(
        "financial-cashflow-step",
        tone === "success" && "financial-cashflow-step-success",
        tone === "outflow" && "financial-cashflow-step-outflow",
        featured && "financial-cashflow-step-featured",
      )}
    >
      <span className="financial-eyebrow">{label}</span>
      <strong className="financial-cashflow-step-value">
        {tone === "success"
          ? signedMoney(value)
          : tone === "outflow"
            ? `- ${money.format(value)}`
            : money.format(value)}
      </strong>
    </article>
  );
}

function CashFlowForecastPanel({ summary }: { summary: CashFlowSummary }) {
  const projected7 = summary.realized.closingBalance + summary.projection.net_7d;
  const projected30 = summary.realized.closingBalance + summary.projection.net_30d;
  return (
    <section className="financial-cashflow-forecast">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="financial-section-kicker">Previsão de Caixa</p>
          <h2 className="mt-1 text-lg font-black">Próximos compromissos</h2>
        </div>
        <CalendarClock className="size-5 shrink-0 text-primary" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.25fr]">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <MiniMetric
            label="Entradas previstas"
            value={summary.forecast.expected_inflows}
            tone="success"
          />
          <MiniMetric label="Saídas previstas" value={summary.forecast.expected_outflows} />
          <MiniMetric
            label="Vencido"
            value={summary.forecast.overdue_amount}
            tone={summary.forecast.overdue_amount > 0 ? "danger" : undefined}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="financial-cashflow-projection">
            <span className="financial-eyebrow">Saldo projetado 7 dias</span>
            <strong>{money.format(projected7)}</strong>
          </article>
          <article className="financial-cashflow-projection financial-cashflow-projection-strong">
            <span className="financial-eyebrow">Saldo projetado 30 dias</span>
            <strong>{money.format(projected30)}</strong>
          </article>
        </div>
      </div>
    </section>
  );
}

function CashFlowTimeline({
  groups,
  maxMovement,
}: {
  groups: CashFlowDayGroup[];
  maxMovement: number;
}) {
  return (
    <section className="financial-cashflow-temporal">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="financial-section-kicker">Visão Temporal</p>
          <h2 className="mt-1 text-lg font-black">Evolução do período</h2>
        </div>
        <TrendingUp className="size-5 shrink-0 text-primary" />
      </div>
      <div className="mt-4 grid gap-3">
        {groups.length ? (
          groups.map((group) => (
            <div key={group.date} className="financial-cashflow-day">
              <div className="financial-cashflow-day-head">
                <div>
                  <strong>{date.format(new Date(`${group.date}T12:00:00`))}</strong>
                  <span>
                    {group.count} movimentação{group.count === 1 ? "" : "ões"}
                  </span>
                </div>
                <strong className={cn(group.net < 0 && "text-destructive")}>
                  {signedMoney(group.net)}
                </strong>
              </div>
              <div className="financial-cashflow-bars" aria-hidden="true">
                <span
                  className="financial-cashflow-bar financial-cashflow-bar-in"
                  style={{ width: `${Math.max(3, (group.inflows / maxMovement) * 100)}%` }}
                />
                <span
                  className="financial-cashflow-bar financial-cashflow-bar-out"
                  style={{ width: `${Math.max(3, (group.outflows / maxMovement) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="financial-cashflow-empty">
            Nenhuma movimentação temporal para os filtros selecionados.
          </div>
        )}
      </div>
    </section>
  );
}

function CashFlowMovementList({ entries }: { entries: CashFlowEntry[] }) {
  return (
    <section className="financial-cashflow-movements">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="financial-section-kicker">Operacional</p>
          <h2 className="mt-1 text-lg font-black">Movimentações do período</h2>
        </div>
        <ReceiptText className="size-5 shrink-0 text-primary" />
      </div>
      <div className="mt-3 divide-y divide-border/70">
        {entries.length ? (
          entries.map((entry) => (
            <div key={entry.entry_id} className="financial-cashflow-movement-row">
              <div className="financial-cashflow-date-chip">
                {date.format(new Date(`${entry.entry_date}T12:00:00`))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black">{entry.description}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {entry.document_number && <span>Doc. {entry.document_number}</span>}
                  <span>{entry.financial_account_name || "Sem conta financeira"}</span>
                  <span>{entry.chart_account_name || "Sem categoria"}</span>
                  <Badge variant={entry.status === "overdue" ? "destructive" : "secondary"}>
                    {cashFlowStatusLabel[entry.status]}
                  </Badge>
                </div>
              </div>
              <div className="financial-cashflow-row-value">
                <span>{entry.direction === "receivable" ? "Entrada" : "Saída"}</span>
                <strong className={cn(entry.signed_amount < 0 && "text-destructive")}>
                  {signedMoney(entry.signed_amount)}
                </strong>
              </div>
            </div>
          ))
        ) : (
          <div className="financial-cashflow-empty">Nenhum lançamento no período.</div>
        )}
      </div>
    </section>
  );
}

function CashFlowContent({ access }: { access: FinancialAccess }) {
  const [mode, setMode] = useState<PeriodMode>("month");
  const [start, setStart] = useState(() => periodBounds("month")[0]);
  const [end, setEnd] = useState(() => periodBounds("month")[1]);
  const [view, setView] = useState<"realized" | "forecast">("realized");
  const [direction, setDirection] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [entries, setEntries] = useState<CashFlowEntry[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const canCashFlow = hasFinancialPermission(access, "financial.cashflow.view");
  const payload = useMemo(
    () => ({
      workspaceId: access.workspaceId,
      startDate: start,
      endDate: end,
      financialAccountId: accountId === "all" ? null : accountId,
    }),
    [access.workspaceId, accountId, end, start],
  );
  const load = useCallback(async () => {
    if (!canCashFlow) return;
    setLoading(true);
    const [nextSummary, nextEntries, nextAccounts] = await Promise.all([
      getCashFlowSummary(payload),
      getCashFlowEntries({
        ...payload,
        mode: view,
        direction: direction === "all" ? null : (direction as "receivable" | "payable"),
      }),
      listFinancialAccounts(),
    ]);
    setSummary(nextSummary);
    setEntries(nextEntries);
    setAccounts(nextAccounts);
    setLoading(false);
  }, [canCashFlow, direction, payload, view]);
  useEffect(() => {
    load().catch(() => {
      setLoading(false);
      toast.error("Nao foi possivel carregar o fluxo de caixa.");
    });
  }, [load]);
  const chronologicalEntries = useMemo(
    () => [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [entries],
  );
  const temporalGroups = useMemo(() => {
    const groups = new Map<string, CashFlowDayGroup>();
    chronologicalEntries.forEach((entry) => {
      const current = groups.get(entry.entry_date) ?? {
        date: entry.entry_date,
        inflows: 0,
        outflows: 0,
        net: 0,
        count: 0,
      };
      if (entry.direction === "receivable") current.inflows += entry.amount;
      if (entry.direction === "payable") current.outflows += entry.amount;
      current.net += entry.signed_amount;
      current.count += 1;
      groups.set(entry.entry_date, current);
    });
    return Array.from(groups.values());
  }, [chronologicalEntries]);
  const maxTemporalMovement = useMemo(
    () =>
      Math.max(
        1,
        ...temporalGroups.flatMap((group) => [Math.abs(group.inflows), Math.abs(group.outflows)]),
      ),
    [temporalGroups],
  );

  if (!canCashFlow) {
    return (
      <div className="financial-shell space-y-4">
        <PageHeader
          title="Fluxo de Caixa"
          subtitle="Regime de caixa por baixas e previsao por vencimentos."
        />
        <FinancialNav />
        <RestrictedReport permission="financial.cashflow.view" />
      </div>
    );
  }

  return (
    <div className="financial-shell financial-cashflow-shell space-y-4">
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Movimentações realizadas e compromissos previstos"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCsv(
                `fluxo-caixa-${view}-${start}-${end}.csv`,
                entries.map((entry) => ({
                  data: entry.entry_date,
                  tipo: entry.direction === "receivable" ? "entrada" : "saida",
                  status: entry.status,
                  descricao: entry.description,
                  parceiro: entry.partner_name,
                  conta_financeira: entry.financial_account_name,
                  categoria: entry.chart_account_name,
                  valor: entry.signed_amount,
                })),
              )
            }
          >
            <Download className="size-4" />
            CSV
          </Button>
        }
      />
      <FinancialNav />
      <section className="financial-cashflow-control-bar">
        <ReportPeriodControls
          mode={mode}
          start={start}
          end={end}
          onMode={setMode}
          onStart={setStart}
          onEnd={setEnd}
          compact
        />
        <div className="financial-cashflow-filter-grid">
          <Field label="Visão">
            <Select
              value={view}
              onValueChange={(value) => setView(value as "realized" | "forecast")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realized">Realizado</SelectItem>
                <SelectItem value="forecast">Previsto</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Direção">
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Entradas e saídas</SelectItem>
                <SelectItem value="receivable">Entradas</SelectItem>
                <SelectItem value="payable">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Conta financeira">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Consolidado</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>
      {loading || !summary ? (
        <LoadingReport />
      ) : (
        <>
          <section className="financial-cashflow-equation">
            <CashFlowMovementStep label="Saldo inicial" value={summary.openingBalance} />
            <ChevronRight className="financial-cashflow-arrow" />
            <CashFlowMovementStep
              label="Entradas"
              value={summary.realized.inflows}
              tone="success"
            />
            <ChevronRight className="financial-cashflow-arrow" />
            <CashFlowMovementStep label="Saídas" value={summary.realized.outflows} tone="outflow" />
            <ChevronRight className="financial-cashflow-arrow" />
            <CashFlowMovementStep
              label="Saldo final"
              value={summary.realized.closingBalance}
              featured
            />
          </section>
          <CashFlowForecastPanel summary={summary} />
          <div className="financial-cashflow-main-grid">
            <CashFlowTimeline groups={temporalGroups} maxMovement={maxTemporalMovement} />
            <CashFlowMovementList entries={chronologicalEntries} />
          </div>
        </>
      )}
    </div>
  );
}

type TitleFilters = {
  search: string;
  status: string;
  origin: string;
  partner: string;
  start: string;
  end: string;
  category: string;
  center: string;
  min: string;
  max: string;
};
const initialFilters = (): TitleFilters => ({
  search: "",
  status: "all",
  origin: "all",
  partner: "all",
  start: monthStart(),
  end: today(),
  category: "all",
  center: "all",
  min: "",
  max: "",
});

const TITLE_PAGE_SIZE = 50;

const emptyTitleSummary = (): FinancialDocumentsPageSummary => ({
  openBalance: 0,
  overdue: 0,
  overdueCount: 0,
  settledPeriod: 0,
  upcoming: 0,
  upcomingCount: 0,
  payablePressure: {
    overdue: { amount: 0, count: 0 },
    week: { amount: 0, count: 0 },
    halfMonth: { amount: 0, count: 0 },
    month: { amount: 0, count: 0 },
    later: { amount: 0, count: 0 },
  },
});

export function FinancialTitlesPage({ direction }: { direction: FinancialDocumentDirection }) {
  return (
    <FinancialBoundary>
      {(access) => <TitlesContent access={access} direction={direction} />}
    </FinancialBoundary>
  );
}

function TitlesContent({
  access,
  direction,
}: {
  access: FinancialAccess;
  direction: FinancialDocumentDirection;
}) {
  const receiving = direction === "receivable";
  const [documents, setDocuments] = useState<FinancialDocumentDetails[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [chart, setChart] = useState<ChartAccount[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [freights, setFreights] = useState<CanonicalFreight[]>([]);
  const [recurringRules, setRecurringRules] = useState<FinancialRecurringRule[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [documentsPage, setDocumentsPage] = useState(1);
  const [documentsSummary, setDocumentsSummary] =
    useState<FinancialDocumentsPageSummary>(emptyTitleSummary);
  const [loadingDocumentId, setLoadingDocumentId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<FinancialDocumentDetails | null>(null);
  const [detailDocument, setDetailDocument] = useState<FinancialDocumentDetails | null>(null);
  const [settleTarget, setSettleTarget] = useState<{
    document: FinancialDocumentDetails;
    installment: FinancialInstallment;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const { vehicles, drivers, products } = useFleet();
  const canManageRecurring = hasFinancialPermission(access, "financial.manage_recurring");
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const recurringFallbackWorkspaces = useRef(new Set<string>());

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  const loadDocuments = useCallback(async () => {
    try {
      const page = await listFinancialDocumentsPage({
        workspaceId: access.workspaceId,
        direction,
        page: documentsPage,
        pageSize: TITLE_PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: filters.status,
        origin: filters.origin,
        partnerId: filters.partner === "all" ? undefined : filters.partner,
        chartAccountId: filters.category === "all" ? undefined : filters.category,
        costCenterId: filters.center === "all" ? undefined : filters.center,
        startDate: filters.start || undefined,
        endDate: filters.end || undefined,
        minAmount: filters.min || undefined,
        maxAmount: filters.max || undefined,
      });
      setDocuments(page.rows);
      setDocumentsTotal(page.total);
      setDocumentsSummary(page.summary);
    } catch (error) {
      console.error("[financeiro] Falha ao carregar titulos", error);
      toast.error("Nao foi possivel carregar os titulos.");
      setDocuments([]);
      setDocumentsTotal(0);
      setDocumentsSummary(emptyTitleSummary());
    }
  }, [
    access.workspaceId,
    debouncedSearch,
    direction,
    documentsPage,
    filters.category,
    filters.center,
    filters.end,
    filters.max,
    filters.min,
    filters.origin,
    filters.partner,
    filters.start,
    filters.status,
  ]);

  const loadAuxiliaryData = useCallback(async () => {
    const [partnersResult, accountsResult, chartResult, centersResult, freightsResult, recurringResult] =
      await Promise.allSettled([
        listFinancialPartners(access.tenantId),
        listFinancialAccounts(access.workspaceId),
        listFinancialChart(access.tenantId),
        listFinancialCostCenters(access.workspaceId),
        listCanonicalFreights(access.workspaceId),
        listFinancialRecurringRules(),
      ]);

    const applyAuxiliaryResult = <T,>(
      result: PromiseSettledResult<T[]>,
      setter: (value: T[]) => void,
      label: string,
    ) => {
      if (result.status === "fulfilled") {
        setter(result.value);
        return;
      }
      console.error(`[financeiro] Falha ao carregar ${label}`, result.reason);
      toast.error(`Nao foi possivel carregar ${label}.`);
      setter([]);
    };

    applyAuxiliaryResult(partnersResult, setPartners, "parceiros financeiros");
    applyAuxiliaryResult(accountsResult, setAccounts, "bancos e caixas");
    applyAuxiliaryResult(chartResult, setChart, "gerenciais");
    applyAuxiliaryResult(centersResult, setCenters, "apropriacoes");
    applyAuxiliaryResult(freightsResult, setFreights, "fretes financeiros");
    applyAuxiliaryResult(recurringResult, setRecurringRules, "recorrencias financeiras");
  }, [access.tenantId, access.workspaceId]);

  useEffect(() => {
    if (!canManageRecurring) return;
    if (recurringFallbackWorkspaces.current.has(access.workspaceId)) return;
    recurringFallbackWorkspaces.current.add(access.workspaceId);
    generateDueFinancialRecurringDocuments(access.workspaceId, today().slice(0, 7))
      .then(() => loadDocuments())
      .catch((error) => {
        console.error("[financeiro] Fallback de recorrencia falhou", error);
        toast.error("Nao foi possivel reconciliar recorrencias financeiras.");
      });
  }, [access.workspaceId, canManageRecurring, loadDocuments]);

  useEffect(() => {
    loadAuxiliaryData().catch((error) => {
      console.error("[financeiro] Falha inesperada ao carregar dados auxiliares", error);
      toast.error("Nao foi possivel carregar a pagina financeira.");
    });
  }, [loadAuxiliaryData]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    setDocumentsPage(1);
  }, [direction, filters]);
  const allowedPartners = partners.filter(
    (p) =>
      p.roles.includes(receiving ? "customer" : "supplier") ||
      p.roles.includes(receiving ? "sender" : "recipient"),
  );
  const recurringById = useMemo(
    () => new Map(recurringRules.map((rule) => [rule.id, rule])),
    [recurringRules],
  );
  const filtered = documents;
  const openBalance = documentsSummary.openBalance;
  const overdue = documentsSummary.overdue;
  const settledPeriod = documentsSummary.settledPeriod;
  const upcoming = documentsSummary.upcoming;
  const overdueTitlesCount = documentsSummary.overdueCount;
  const upcomingTitlesCount = documentsSummary.upcomingCount;
  const filtersActive =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.origin !== "all" ||
    filters.partner !== "all" ||
    filters.start !== monthStart() ||
    filters.end !== today() ||
    filters.category !== "all" ||
    filters.center !== "all" ||
    filters.min !== "" ||
    filters.max !== "";
  const canCreate = hasFinancialPermission(access, "financial.create");
  const canSettle = hasFinancialPermission(
    access,
    receiving ? "financial.receive" : "financial.pay",
  );
  const loadDocumentDetails = useCallback(async (document: FinancialDocumentDetails) => {
    setLoadingDocumentId(document.id);
    try {
      return await getFinancialDocumentDetails(document.id);
    } catch (error) {
      console.error("[financeiro] Falha ao carregar detalhe do titulo", error);
      toast.error("Nao foi possivel carregar o detalhe do titulo.");
      return null;
    } finally {
      setLoadingDocumentId(null);
    }
  }, []);
  const openDocumentDetails = useCallback(
    async (document: FinancialDocumentDetails) => {
      const details = await loadDocumentDetails(document);
      if (details) setDetailDocument(details);
    },
    [loadDocumentDetails],
  );
  const editDocument = useCallback(
    async (document: FinancialDocumentDetails) => {
      const details = await loadDocumentDetails(document);
      if (!details) return;
      setEditingDocument(details);
      setFormOpen(true);
    },
    [loadDocumentDetails],
  );
  const settleDocument = useCallback(
    async (document: FinancialDocumentDetails, installment: FinancialInstallment) => {
      const details = await loadDocumentDetails(document);
      if (!details) return;
      const detailedInstallment =
        details.installments.find((item) => item.id === installment.id) ??
        firstOpenInstallment(details);
      if (!detailedInstallment) {
        toast.error("Nao foi possivel localizar a parcela em aberto.");
        return;
      }
      setSettleTarget({ document: details, installment: detailedInstallment });
    },
    [loadDocumentDetails],
  );
  const totalPages = Math.max(1, Math.ceil(documentsTotal / TITLE_PAGE_SIZE));
  return (
    <div
      className={cn(
        "financial-shell space-y-4",
        receiving ? "financial-receivables-shell" : "financial-payables-shell",
      )}
    >
      <PageHeader
        title={receiving ? "Contas a Receber" : "Contas a Pagar"}
        subtitle={
          receiving
            ? "Clientes, vencimentos e recebimentos do período"
            : "Fornecedores, vencimentos e pagamentos do período"
        }
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setEditingDocument(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Novo título
            </Button>
          ) : undefined
        }
      />
      <FinancialNav />
      {loadingDocumentId && (
        <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Carregando detalhes do titulo...
        </div>
      )}
      {receiving ? (
        <>
          <ReceivablesSummary
            openBalance={openBalance}
            overdue={overdue}
            settledPeriod={settledPeriod}
            upcoming={upcoming}
          />
          <ReceivablesPriority
            overdueCount={overdueTitlesCount}
            overdueAmount={overdue}
            upcomingCount={upcomingTitlesCount}
            upcomingAmount={upcoming}
          />
          <div className="hidden md:block">
            <ReceivablesFilterPanel
              filters={filters}
              setFilters={setFilters}
              partners={allowedPartners}
              chart={chart}
              centers={centers}
            />
          </div>
          <div className="px-3 md:hidden">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Settings2 className="size-4" />
                  Filtros
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-lg">
                <SheetHeader className="text-left">
                  <SheetTitle>Filtrar títulos</SheetTitle>
                  <SheetDescription>
                    Refine a consulta por período, parceiro e situação.
                  </SheetDescription>
                </SheetHeader>
                <ReceivablesFilterPanel
                  embedded
                  filters={filters}
                  setFilters={setFilters}
                  partners={allowedPartners}
                  chart={chart}
                  centers={centers}
                />
                <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
                  Aplicar filtros
                </Button>
              </SheetContent>
            </Sheet>
          </div>
          <ReceivablesTitleList
            documents={filtered}
            total={documentsTotal}
            canSettle={canSettle}
            canReverse={hasFinancialPermission(access, "financial.reverse_settlement")}
            canEdit={hasFinancialPermission(access, "financial.edit_draft")}
            recurringById={recurringById}
            filtersActive={filtersActive}
            canCreate={canCreate}
            onNew={() => {
              setEditingDocument(null);
              setFormOpen(true);
            }}
            onEdit={editDocument}
            onSettle={settleDocument}
            onOpenDetails={openDocumentDetails}
            onCancelRecurring={async (rule) => {
              try {
                await setFinancialRecurringRuleStatus(rule.id, access.workspaceId, "ended");
                toast.success("Recorrencia cancelada. Titulos ja gerados foram preservados.");
                await Promise.all([loadDocuments(), loadAuxiliaryData()]);
              } catch {
                toast.error("Nao foi possivel cancelar a recorrencia.");
              }
            }}
            onReverse={async (settlement) => {
              const reason = window.prompt("Informe o motivo do estorno:");
              if (!reason) return;
              try {
                await reverseSettlement(settlement.id, reason);
                toast.success("Baixa estornada.");
                await loadDocuments();
              } catch {
                toast.error("Não foi possível estornar a baixa.");
              }
            }}
            onVoid={async (document) => {
              const reason = window.prompt("Motivo do cancelamento:");
              if (!reason) return;
              try {
                await voidFinancialDocument(document.id, reason);
                toast.success("Título cancelado.");
                await loadDocuments();
              } catch {
                toast.error("Não foi possível cancelar o título.");
              }
            }}
          />
          <FinancialPagination
            page={documentsPage}
            pageSize={TITLE_PAGE_SIZE}
            total={documentsTotal}
            totalPages={totalPages}
            onPageChange={setDocumentsPage}
          />
        </>
      ) : (
        <>
          <PayablesSummary
            openBalance={openBalance}
            overdue={overdue}
            settledPeriod={settledPeriod}
          />
          <PayablesPressure summary={documentsSummary} />
          <div className="hidden md:block">
            <PayablesFilterPanel
              filters={filters}
              setFilters={setFilters}
              partners={allowedPartners}
              chart={chart}
              centers={centers}
            />
          </div>
          <div className="px-3 md:hidden">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Settings2 className="size-4" />
                  Filtros
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-lg">
                <SheetHeader className="text-left">
                  <SheetTitle>Filtrar títulos</SheetTitle>
                  <SheetDescription>
                    Refine a consulta por período, fornecedor e situação.
                  </SheetDescription>
                </SheetHeader>
                <PayablesFilterPanel
                  embedded
                  filters={filters}
                  setFilters={setFilters}
                  partners={allowedPartners}
                  chart={chart}
                  centers={centers}
                />
                <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
                  Aplicar filtros
                </Button>
              </SheetContent>
            </Sheet>
          </div>
          <PayablesTitleList
            documents={filtered}
            total={documentsTotal}
            canSettle={canSettle}
            canReverse={hasFinancialPermission(access, "financial.reverse_settlement")}
            canEdit={hasFinancialPermission(access, "financial.edit_draft")}
            recurringById={recurringById}
            filtersActive={filtersActive}
            canCreate={canCreate}
            onNew={() => {
              setEditingDocument(null);
              setFormOpen(true);
            }}
            onEdit={editDocument}
            onSettle={settleDocument}
            onOpenDetails={openDocumentDetails}
            onCancelRecurring={async (rule) => {
              try {
                await setFinancialRecurringRuleStatus(rule.id, access.workspaceId, "ended");
                toast.success("Recorrencia cancelada. Titulos ja gerados foram preservados.");
                await Promise.all([loadDocuments(), loadAuxiliaryData()]);
              } catch {
                toast.error("Nao foi possivel cancelar a recorrencia.");
              }
            }}
            onReverse={async (settlement) => {
              const reason = window.prompt("Informe o motivo do estorno:");
              if (!reason) return;
              try {
                await reverseSettlement(settlement.id, reason);
                toast.success("Baixa estornada.");
                await loadDocuments();
              } catch {
                toast.error("Não foi possível estornar a baixa.");
              }
            }}
            onVoid={async (document) => {
              const reason = window.prompt("Motivo do cancelamento:");
              if (!reason) return;
              try {
                await voidFinancialDocument(document.id, reason);
                toast.success("Título cancelado.");
                await loadDocuments();
              } catch {
                toast.error("Não foi possível cancelar o título.");
              }
            }}
          />
          <FinancialPagination
            page={documentsPage}
            pageSize={TITLE_PAGE_SIZE}
            total={documentsTotal}
            totalPages={totalPages}
            onPageChange={setDocumentsPage}
          />
        </>
      )}
      <DocumentDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        access={access}
        direction={direction}
        partners={allowedPartners}
        chart={chart}
        centers={centers}
        freights={freights}
        vehicles={vehicles}
        drivers={drivers}
        products={products}
        saving={saving}
        document={editingDocument}
        onSave={async (input, recurring) => {
          setSaving(true);
          try {
            if (recurring) {
              await saveFinancialDocumentWithRecurring({ document: input, recurring });
            } else {
              await saveFinancialDocument(input);
            }
            toast.success("Título salvo com sucesso.");
            setFormOpen(false);
            setEditingDocument(null);
            await Promise.all([loadDocuments(), loadAuxiliaryData()]);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
          } finally {
            setSaving(false);
          }
        }}
        onPartnerCreated={loadAuxiliaryData}
      />
      <SettlementDialog
        target={settleTarget}
        accounts={accounts.filter((a) => a.active)}
        centers={centers}
        vehicles={vehicles}
        drivers={drivers}
        saving={saving}
        actionLabel={receiving ? "Receber" : "Pagar"}
        onOpenChange={(open) => !open && setSettleTarget(null)}
        onSave={async (input) => {
          setSaving(true);
          try {
            await settleInstallment(input);
            toast.success(receiving ? "Recebimento registrado." : "Pagamento registrado.");
            setSettleTarget(null);
            await loadDocuments();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha na baixa.");
          } finally {
            setSaving(false);
          }
        }}
      />
      <TitleDetailsDialog
        document={detailDocument}
        recurringRule={
          detailDocument?.sourceType === "recurring_rule" && detailDocument.sourceId
            ? recurringById.get(detailDocument.sourceId) ?? null
            : null
        }
        chart={chart}
        centers={centers}
        vehicles={vehicles}
        drivers={drivers}
        onOpenChange={(open) => {
          if (!open) setDetailDocument(null);
        }}
      />
    </div>
  );
}

function FinancialPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span>
        Exibindo {start}-{end} de {total} titulos
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Anterior
        </Button>
        <span>
          Pagina {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Proxima
        </Button>
      </div>
    </div>
  );
}

function documentBalance(document: FinancialDocumentDetails) {
  if (typeof document.outstandingBalance === "number") {
    return document.outstandingBalance;
  }
  return document.installments.reduce((sum, installment) => sum + installment.balance, 0);
}

function firstOpenInstallment(document: FinancialDocumentDetails) {
  return document.installments.find((installment) => installment.balance > 0) ?? null;
}

function receivableDueState(document: FinancialDocumentDetails) {
  const installment = firstOpenInstallment(document);
  const state = visualStatus(document);
  if (state === "settled") return { label: "Recebido", tone: "success" as const };
  if (state === "voided") return { label: "Cancelado", tone: "muted" as const };
  if (!installment) return { label: "Sem vencimento", tone: "muted" as const };
  if (installment.dueDate < today()) return { label: "Vencido", tone: "danger" as const };
  if (installment.dueDate === today()) return { label: "Vence hoje", tone: "warning" as const };
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  if (installment.dueDate <= limit.toISOString().slice(0, 10)) {
    return { label: "Próx. 7 dias", tone: "warning" as const };
  }
  return { label: "No prazo", tone: "muted" as const };
}

function ReceivablesSummary({
  openBalance,
  overdue,
  settledPeriod,
  upcoming,
}: {
  openBalance: number;
  overdue: number;
  settledPeriod: number;
  upcoming: number;
}) {
  return (
    <section className="financial-receivables-summary">
      <article className="financial-receivables-main-metric">
        <p className="financial-eyebrow">A Receber</p>
        <strong>{money.format(openBalance)}</strong>
        <span>Estoque financeiro aberto</span>
      </article>
      <div className="financial-receivables-side-metrics">
        <ReceivableMiniMetric label="Vencido" value={overdue} tone="danger" />
        <ReceivableMiniMetric label="Recebido no período" value={settledPeriod} tone="success" />
        <ReceivableMiniMetric label="Próximos 7 dias" value={upcoming} tone="future" />
      </div>
    </section>
  );
}

function ReceivableMiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "success" | "future";
}) {
  return (
    <article className={cn("financial-receivables-mini-metric", `financial-receivables-${tone}`)}>
      <span>{label}</span>
      <strong>{money.format(value)}</strong>
    </article>
  );
}

function ReceivablesPriority({
  overdueCount,
  overdueAmount,
  upcomingCount,
  upcomingAmount,
}: {
  overdueCount: number;
  overdueAmount: number;
  upcomingCount: number;
  upcomingAmount: number;
}) {
  return (
    <section className="financial-receivables-priority">
      <div>
        <p className="financial-section-kicker">Atenção</p>
        <h2>Prioridades de cobrança</h2>
      </div>
      <div className="financial-receivables-priority-items">
        <div>
          <ShieldAlert className="size-4" />
          <span>Vencidos</span>
          <strong>
            {overdueCount} títulos · {money.format(overdueAmount)}
          </strong>
        </div>
        <div>
          <CalendarClock className="size-4" />
          <span>Vencendo em 7 dias</span>
          <strong>
            {upcomingCount} títulos · {money.format(upcomingAmount)}
          </strong>
        </div>
      </div>
    </section>
  );
}

function ReceivablesFilterPanel({
  embedded = false,
  filters,
  setFilters,
  partners,
  chart,
  centers,
}: {
  embedded?: boolean;
  filters: TitleFilters;
  setFilters: (f: TitleFilters) => void;
  partners: BusinessPartner[];
  chart: ChartAccount[];
  centers: CostCenter[];
}) {
  const set = (key: keyof TitleFilters, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <section
      className={cn(
        "financial-receivables-filters",
        embedded && "financial-receivables-filters-embedded",
      )}
    >
      <div className="financial-receivables-filter-main">
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar título, documento ou parceiro"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </div>
        <Input
          type="date"
          value={filters.start}
          onChange={(event) => set("start", event.target.value)}
        />
        <Input
          type="date"
          value={filters.end}
          onChange={(event) => set("end", event.target.value)}
        />
        <SimpleSelect
          value={filters.status}
          onChange={(value) => set("status", value)}
          all="Todos os status"
          items={Object.entries(statusLabels)}
        />
        <SimpleSelect
          value={filters.partner}
          onChange={(value) => set("partner", value)}
          all="Todos os clientes"
          items={partners.map((partner) => [partner.id, partner.tradeName])}
        />
      </div>
      <div className="financial-receivables-filter-advanced">
        <SimpleSelect
          value={filters.origin}
          onChange={(value) => set("origin", value)}
          all="Todas as origens"
          items={Object.entries(originLabels)}
        />
        <SimpleSelect
          value={filters.category}
          onChange={(value) => set("category", value)}
          all="Todas as categorias"
          items={chart
            .filter((account) => account.isPostable)
            .map((account) => [account.id, `${account.code} · ${account.name}`])}
        />
        <SimpleSelect
          value={filters.center}
          onChange={(value) => set("center", value)}
          all="Todos os centros"
          items={centers.map((center) => [center.id, center.name])}
        />
        <Input
          type="number"
          placeholder="Valor mínimo"
          value={filters.min}
          onChange={(event) => set("min", event.target.value)}
        />
        <Input
          type="number"
          placeholder="Valor máximo"
          value={filters.max}
          onChange={(event) => set("max", event.target.value)}
        />
        <Button variant="outline" onClick={() => setFilters(initialFilters())}>
          <Settings2 className="size-4" />
          Limpar
        </Button>
      </div>
    </section>
  );
}

function ReceivablesTitleList({
  documents,
  total,
  canSettle,
  canReverse,
  canEdit,
  recurringById,
  filtersActive,
  canCreate,
  onNew,
  onSettle,
  onReverse,
  onVoid,
  onEdit,
  onOpenDetails,
  onCancelRecurring,
}: {
  documents: FinancialDocumentDetails[];
  total: number;
  canSettle: boolean;
  canReverse: boolean;
  canEdit: boolean;
  recurringById: Map<string, FinancialRecurringRule>;
  filtersActive: boolean;
  canCreate: boolean;
  onNew: () => void;
  onSettle: (d: FinancialDocumentDetails, i: FinancialInstallment) => void;
  onReverse: (s: FinancialSettlement) => void;
  onVoid: (d: FinancialDocumentDetails) => void;
  onEdit: (d: FinancialDocumentDetails) => void;
  onOpenDetails: (d: FinancialDocumentDetails) => void;
  onCancelRecurring: (rule: FinancialRecurringRule) => void;
}) {
  return (
    <section className="financial-receivables-list">
      <div className="financial-receivables-list-head">
        <div>
          <p className="financial-section-kicker">Títulos</p>
          <h2>Carteira de recebíveis</h2>
        </div>
        <span>{total} encontrados</span>
      </div>
      <div className="hidden financial-receivables-table-head md:grid">
        <span>Cliente e título</span>
        <span>Vencimento</span>
        <span>Valor</span>
        <span>Situação</span>
        <span>Ação</span>
      </div>
      {documents.length ? (
        documents.map((document) => (
          <ReceivablesTitleRow
            key={document.id}
            document={document}
            canSettle={canSettle}
            canReverse={canReverse}
            canEdit={canEdit}
            recurringRule={
              document.sourceType === "recurring_rule" && document.sourceId
                ? recurringById.get(document.sourceId) ?? null
                : null
            }
            onSettle={onSettle}
            onReverse={onReverse}
            onVoid={onVoid}
            onEdit={onEdit}
            onOpenDetails={onOpenDetails}
            onCancelRecurring={onCancelRecurring}
          />
        ))
      ) : (
        <div className="financial-receivables-empty">
          <strong>Nenhum título encontrado</strong>
          <span>
            {filtersActive
              ? "Nenhum título encontrado para os filtros atuais."
              : "Cadastre um novo título para começar."}
          </span>
          {!filtersActive && canCreate && (
            <Button size="sm" variant="outline" onClick={onNew}>
              <Plus className="size-4" />
              Novo título
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function ReceivablesTitleRow({
  document,
  canSettle,
  canReverse,
  canEdit,
  recurringRule,
  onSettle,
  onReverse,
  onVoid,
  onEdit,
  onOpenDetails,
  onCancelRecurring,
}: {
  document: FinancialDocumentDetails;
  canSettle: boolean;
  canReverse: boolean;
  canEdit: boolean;
  recurringRule: FinancialRecurringRule | null;
  onSettle: (d: FinancialDocumentDetails, i: FinancialInstallment) => void;
  onReverse: (s: FinancialSettlement) => void;
  onVoid: (d: FinancialDocumentDetails) => void;
  onEdit: (d: FinancialDocumentDetails) => void;
  onOpenDetails: (d: FinancialDocumentDetails) => void;
  onCancelRecurring: (rule: FinancialRecurringRule) => void;
}) {
  const installment = firstOpenInstallment(document);
  const state = visualStatus(document);
  const balance = documentBalance(document);
  const activeSettlements = effectiveSettlements(document);
  const dueState = receivableDueState(document);
  const canAct =
    Boolean(installment && canSettle && !["draft", "voided"].includes(document.status)) ||
    (document.status === "draft" && canEdit) ||
    (canReverse && activeSettlements.length > 0);

  return (
    <article
      className="financial-receivables-row cursor-pointer"
      onClick={() => onOpenDetails(document)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpenDetails(document);
      }}
    >
      <div className="financial-receivables-title-cell">
        <strong>{document.partnerName || "Cliente não informado"}</strong>
        <span>{document.description}</span>
        <small>
          {document.documentNumber || "Sem número"} ·{" "}
          {originLabels[documentOrigin(document.sourceType)]} ·{" "}
          {recurringRule ? "Recorrente" : "Nao recorrente"}
        </small>
      </div>
      <div className="financial-receivables-due-cell">
        <FinancialStatusBadge state={dueState.tone}>{dueState.label}</FinancialStatusBadge>
        <span>{installment ? date.format(new Date(`${installment.dueDate}T12:00:00`)) : "-"}</span>
      </div>
      <div className="financial-receivables-value-cell">
        <strong>{money.format(balance)}</strong>
        <span>de {money.format(document.originalAmount)}</span>
      </div>
      <div>
        <FinancialStatusBadge
          state={state === "overdue" ? "danger" : state === "settled" ? "success" : "muted"}
        >
          {statusLabel(state, "receivable")}
        </FinancialStatusBadge>
      </div>
      <div className="hidden financial-receivables-actions md:flex">
        {installment && canSettle && !["draft", "voided"].includes(document.status) && (
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSettle(document, installment);
            }}
          >
            Receber
          </Button>
        )}
        {document.status === "draft" && canEdit && (
          <>
            <Button
              size="icon"
              variant="outline"
              title="Editar rascunho"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(document);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onVoid(document);
              }}
            >
              Cancelar
            </Button>
          </>
        )}
        {recurringRule?.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onCancelRecurring(recurringRule);
            }}
          >
            Cancelar recorrencia
          </Button>
        )}
        {canReverse &&
          activeSettlements.map((settlement) => (
            <Button
              key={settlement.id}
              size="icon"
              variant="ghost"
              title="Estornar baixa"
              onClick={(event) => {
                event.stopPropagation();
                onReverse(settlement);
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          ))}
      </div>
      {canAct && (
        <div className="financial-receivables-mobile-action md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" aria-label="Ações do título">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {installment && canSettle && !["draft", "voided"].includes(document.status) && (
                <DropdownMenuItem onSelect={() => onSettle(document, installment)}>
                  <CircleDollarSign />
                  Receber
                </DropdownMenuItem>
              )}
              {document.status === "draft" && canEdit && (
                <DropdownMenuItem onSelect={() => onEdit(document)}>
                  <Pencil /> Editar rascunho
                </DropdownMenuItem>
              )}
              {document.status === "draft" && canEdit && (
                <DropdownMenuItem onSelect={() => onVoid(document)}>
                  <ReceiptText /> Cancelar título
                </DropdownMenuItem>
              )}
              {canReverse &&
                activeSettlements.map((settlement) => (
                  <DropdownMenuItem key={settlement.id} onSelect={() => onReverse(settlement)}>
                    <RotateCcw /> Estornar baixa
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </article>
  );
}

function payableDueState(document: FinancialDocumentDetails) {
  const installment = firstOpenInstallment(document);
  const state = visualStatus(document);
  if (state === "settled") return { label: "Pago", tone: "success" as const };
  if (state === "voided") return { label: "Cancelado", tone: "muted" as const };
  if (!installment) return { label: "Sem vencimento", tone: "muted" as const };
  if (installment.dueDate < today()) return { label: "Vencido", tone: "danger" as const };
  if (installment.dueDate === today()) return { label: "Vence hoje", tone: "warning" as const };
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  if (installment.dueDate <= limit.toISOString().slice(0, 10)) {
    return { label: "Compromisso 7 dias", tone: "warning" as const };
  }
  return { label: "Programado", tone: "muted" as const };
}

function daysUntil(dueDate: string) {
  const base = new Date(`${today()}T12:00:00`);
  const due = new Date(`${dueDate}T12:00:00`);
  return Math.floor((due.getTime() - base.getTime()) / 86_400_000);
}

function payableBucketForDays(days: number) {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  if (days <= 15) return "halfMonth";
  if (days <= 30) return "month";
  return "later";
}

const payablePressureBuckets = [
  { key: "overdue", label: "Vencido", tone: "danger" },
  { key: "week", label: "Até 7 dias", tone: "warning" },
  { key: "halfMonth", label: "8-15 dias", tone: "neutral" },
  { key: "month", label: "16-30 dias", tone: "neutral" },
  { key: "later", label: "Após 30 dias", tone: "muted" },
] as const;

const payableAgendaGroups = [
  { key: "overdue", label: "Vencidos" },
  { key: "today", label: "Vencem hoje" },
  { key: "week", label: "Próximos 7 dias" },
  { key: "later", label: "Mais adiante" },
  { key: "closed", label: "Concluídos ou sem vencimento" },
] as const;

function summarizePayablePressure(documents: FinancialDocumentDetails[]) {
  const summary = payablePressureBuckets.reduce(
    (acc, bucket) => ({
      ...acc,
      [bucket.key]: { amount: 0, count: 0 },
    }),
    {} as Record<(typeof payablePressureBuckets)[number]["key"], { amount: number; count: number }>,
  );

  for (const document of documents) {
    for (const installment of document.installments) {
      if (installment.balance <= 0 || !installment.dueDate) continue;
      const bucket = payableBucketForDays(daysUntil(installment.dueDate));
      const key = bucket === "today" ? "week" : bucket;
      summary[key].amount += installment.balance;
      summary[key].count += 1;
    }
  }

  return summary;
}

function payableAgendaGroup(document: FinancialDocumentDetails) {
  const installment = firstOpenInstallment(document);
  const state = visualStatus(document);
  if (!installment || state === "settled" || state === "voided") return "closed";
  const bucket = payableBucketForDays(daysUntil(installment.dueDate));
  if (bucket === "today") return "today";
  if (bucket === "overdue") return "overdue";
  if (bucket === "week") return "week";
  return "later";
}

function PayablesSummary({
  openBalance,
  overdue,
  settledPeriod,
}: {
  openBalance: number;
  overdue: number;
  settledPeriod: number;
}) {
  return (
    <section className="financial-payables-summary">
      <article className="financial-payables-main-metric">
        <p className="financial-eyebrow">A Pagar</p>
        <strong>{money.format(openBalance)}</strong>
        <span>Compromissos financeiros em aberto</span>
      </article>
      <div className="financial-payables-secondary-board">
        <PayableMiniMetric label="Vencido" value={overdue} tone="danger" />
        <PayableMiniMetric label="Pago no período" value={settledPeriod} tone="success" />
      </div>
    </section>
  );
}

function PayableMiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "success" | "future";
}) {
  return (
    <article className={cn("financial-payables-mini-metric", `financial-payables-${tone}`)}>
      <span>{label}</span>
      <strong>{money.format(value)}</strong>
    </article>
  );
}

function PayablesPressure({ summary }: { summary: FinancialDocumentsPageSummary }) {
  const pressure = summary.payablePressure ?? summarizePayablePressure([]);
  const week = pressure.week;
  const overdue = pressure.overdue;
  return (
    <section className="financial-payables-pressure">
      <div className="financial-payables-pressure-title">
        <p className="financial-section-kicker">Agenda Financeira</p>
        <h2>Pressão de caixa</h2>
        <span>Distribuição por vencimento dos compromissos em aberto.</span>
      </div>
      <article className="financial-payables-week-focus">
        <span>Comprometido nos próximos 7 dias</span>
        <strong>{money.format(week.amount)}</strong>
        <small>
          {week.count} {week.count === 1 ? "parcela" : "parcelas"} exigem programação imediata
        </small>
      </article>
      <article className="financial-payables-overdue-alert">
        <ShieldAlert className="size-4" />
        <span>Vencido</span>
        <strong>{money.format(overdue.amount)}</strong>
        <small>
          {overdue.count} {overdue.count === 1 ? "parcela" : "parcelas"}
        </small>
      </article>
      <div className="financial-payables-pressure-track">
        {payablePressureBuckets.map((bucket) => (
          <div
            key={bucket.key}
            className={cn(
              "financial-payables-pressure-item",
              `financial-payables-pressure-${bucket.tone}`,
            )}
          >
            <span>{bucket.label}</span>
            <strong>{money.format(pressure[bucket.key].amount)}</strong>
            <small>
              {pressure[bucket.key].count}{" "}
              {pressure[bucket.key].count === 1 ? "parcela" : "parcelas"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PayablesFilterPanel({
  embedded = false,
  filters,
  setFilters,
  partners,
  chart,
  centers,
}: {
  embedded?: boolean;
  filters: TitleFilters;
  setFilters: (f: TitleFilters) => void;
  partners: BusinessPartner[];
  chart: ChartAccount[];
  centers: CostCenter[];
}) {
  const set = (key: keyof TitleFilters, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <section
      className={cn(
        "financial-payables-filters",
        embedded && "financial-payables-filters-embedded",
      )}
    >
      <div className="financial-payables-filter-main">
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar título, documento ou fornecedor"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </div>
        <Input
          type="date"
          value={filters.start}
          onChange={(event) => set("start", event.target.value)}
        />
        <Input
          type="date"
          value={filters.end}
          onChange={(event) => set("end", event.target.value)}
        />
        <SimpleSelect
          value={filters.status}
          onChange={(value) => set("status", value)}
          all="Todos os status"
          items={Object.entries(statusLabels)}
        />
        <SimpleSelect
          value={filters.partner}
          onChange={(value) => set("partner", value)}
          all="Todos os fornecedores"
          items={partners.map((partner) => [partner.id, partner.tradeName])}
        />
      </div>
      <div className="financial-payables-filter-secondary">
        <SimpleSelect
          value={filters.origin}
          onChange={(value) => set("origin", value)}
          all="Todas as origens"
          items={Object.entries(originLabels)}
        />
        <SimpleSelect
          value={filters.category}
          onChange={(value) => set("category", value)}
          all="Todas as categorias"
          items={chart
            .filter((account) => account.isPostable)
            .map((account) => [account.id, `${account.code} · ${account.name}`])}
        />
        <SimpleSelect
          value={filters.center}
          onChange={(value) => set("center", value)}
          all="Todos os centros"
          items={centers.map((center) => [center.id, center.name])}
        />
        <Input
          type="number"
          placeholder="Valor mínimo"
          value={filters.min}
          onChange={(event) => set("min", event.target.value)}
        />
        <Input
          type="number"
          placeholder="Valor máximo"
          value={filters.max}
          onChange={(event) => set("max", event.target.value)}
        />
        <Button variant="outline" onClick={() => setFilters(initialFilters())}>
          <Settings2 className="size-4" />
          Limpar
        </Button>
      </div>
    </section>
  );
}

function PayablesTitleList({
  documents,
  total,
  canSettle,
  canReverse,
  canEdit,
  recurringById,
  filtersActive,
  canCreate,
  onNew,
  onSettle,
  onReverse,
  onVoid,
  onEdit,
  onOpenDetails,
  onCancelRecurring,
}: {
  documents: FinancialDocumentDetails[];
  total: number;
  canSettle: boolean;
  canReverse: boolean;
  canEdit: boolean;
  recurringById: Map<string, FinancialRecurringRule>;
  filtersActive: boolean;
  canCreate: boolean;
  onNew: () => void;
  onSettle: (d: FinancialDocumentDetails, i: FinancialInstallment) => void;
  onReverse: (s: FinancialSettlement) => void;
  onVoid: (d: FinancialDocumentDetails) => void;
  onEdit: (d: FinancialDocumentDetails) => void;
  onOpenDetails: (d: FinancialDocumentDetails) => void;
  onCancelRecurring: (rule: FinancialRecurringRule) => void;
}) {
  const supplierCounts = documents.reduce<Record<string, number>>((acc, document) => {
    const key = document.partnerName || "Fornecedor não informado";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const orderedDocuments = [...documents].sort((a, b) => {
    const aInstallment = firstOpenInstallment(a);
    const bInstallment = firstOpenInstallment(b);
    if (!aInstallment && !bInstallment) return 0;
    if (!aInstallment) return 1;
    if (!bInstallment) return -1;
    return aInstallment.dueDate.localeCompare(bInstallment.dueDate);
  });
  const grouped = payableAgendaGroups.map((group) => ({
    ...group,
    documents: orderedDocuments.filter((document) => payableAgendaGroup(document) === group.key),
  }));

  return (
    <section className="financial-payables-list">
      <div className="financial-payables-list-head">
        <div>
          <p className="financial-section-kicker">Obrigações</p>
          <h2>Agenda de pagamentos</h2>
        </div>
        <span>{total} encontrados</span>
      </div>
      <div className="hidden financial-payables-table-head md:grid">
        <span>Fornecedor e título</span>
        <span>Vencimento</span>
        <span>Valor</span>
        <span>Situação</span>
        <span>Ação</span>
      </div>
      {documents.length ? (
        grouped
          .filter((group) => group.documents.length > 0)
          .map((group) => (
            <div key={group.key} className="financial-payables-agenda-group">
              <div className="financial-payables-agenda-label">
                <CalendarClock className="size-3.5" />
                <span>{group.label}</span>
                <small>{group.documents.length}</small>
              </div>
              {group.documents.map((document) => (
                <PayablesTitleRow
                  key={document.id}
                  document={document}
                  supplierCount={supplierCounts[document.partnerName || "Fornecedor não informado"]}
                  canSettle={canSettle}
                  canReverse={canReverse}
                  canEdit={canEdit}
                  recurringRule={
                    document.sourceType === "recurring_rule" && document.sourceId
                      ? recurringById.get(document.sourceId) ?? null
                      : null
                  }
                  onSettle={onSettle}
                  onReverse={onReverse}
                  onVoid={onVoid}
                  onEdit={onEdit}
                  onOpenDetails={onOpenDetails}
                  onCancelRecurring={onCancelRecurring}
                />
              ))}
            </div>
          ))
      ) : (
        <div className="financial-payables-empty">
          <strong>
            {filtersActive
              ? "Nenhuma obrigação encontrada para os filtros atuais"
              : "Nenhuma obrigação em aberto"}
          </strong>
          <span>
            {filtersActive
              ? "Ajuste período, fornecedor, status ou valor para ampliar a agenda."
              : "Cadastre um novo título para iniciar a programação de pagamentos."}
          </span>
          {!filtersActive && canCreate && (
            <Button size="sm" variant="outline" onClick={onNew}>
              <Plus className="size-4" />
              Novo título
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function PayablesTitleRow({
  document,
  supplierCount,
  canSettle,
  canReverse,
  canEdit,
  recurringRule,
  onSettle,
  onReverse,
  onVoid,
  onEdit,
  onOpenDetails,
  onCancelRecurring,
}: {
  document: FinancialDocumentDetails;
  supplierCount: number;
  canSettle: boolean;
  canReverse: boolean;
  canEdit: boolean;
  recurringRule: FinancialRecurringRule | null;
  onSettle: (d: FinancialDocumentDetails, i: FinancialInstallment) => void;
  onReverse: (s: FinancialSettlement) => void;
  onVoid: (d: FinancialDocumentDetails) => void;
  onEdit: (d: FinancialDocumentDetails) => void;
  onOpenDetails: (d: FinancialDocumentDetails) => void;
  onCancelRecurring: (rule: FinancialRecurringRule) => void;
}) {
  const installment = firstOpenInstallment(document);
  const state = visualStatus(document);
  const balance = documentBalance(document);
  const activeSettlements = effectiveSettlements(document);
  const dueState = payableDueState(document);
  const canAct =
    Boolean(installment && canSettle && !["draft", "voided"].includes(document.status)) ||
    (document.status === "draft" && canEdit) ||
    (canReverse && activeSettlements.length > 0);

  return (
    <article
      className="financial-payables-row cursor-pointer"
      onClick={() => onOpenDetails(document)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpenDetails(document);
      }}
    >
      <div className="financial-payables-partner-cell">
        <strong>{document.partnerName || "Fornecedor não informado"}</strong>
        <span>{document.description}</span>
        <small>
          {document.documentNumber || "Sem número"} ·{" "}
          {originLabels[documentOrigin(document.sourceType)]}
          {" · "}
          {recurringRule ? "Recorrente" : "Nao recorrente"}
          {supplierCount > 1 ? ` · ${supplierCount} títulos na lista` : ""}
        </small>
      </div>
      <div className="financial-payables-due-cell">
        <FinancialStatusBadge state={dueState.tone}>{dueState.label}</FinancialStatusBadge>
        <span>{installment ? date.format(new Date(`${installment.dueDate}T12:00:00`)) : "-"}</span>
      </div>
      <div className="financial-payables-value-cell">
        <strong>{money.format(balance)}</strong>
        <span>de {money.format(document.originalAmount)}</span>
      </div>
      <div>
        <FinancialStatusBadge
          state={state === "overdue" ? "danger" : state === "settled" ? "success" : "muted"}
        >
          {statusLabel(state, "payable")}
        </FinancialStatusBadge>
      </div>
      <div className="hidden financial-payables-actions md:flex">
        {installment && canSettle && !["draft", "voided"].includes(document.status) && (
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSettle(document, installment);
            }}
          >
            Pagar
          </Button>
        )}
        {document.status === "draft" && canEdit && (
          <>
            <Button
              size="icon"
              variant="outline"
              title="Editar rascunho"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(document);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onVoid(document);
              }}
            >
              Cancelar
            </Button>
          </>
        )}
        {recurringRule?.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onCancelRecurring(recurringRule);
            }}
          >
            Cancelar recorrencia
          </Button>
        )}
        {canReverse &&
          activeSettlements.map((settlement) => (
            <Button
              key={settlement.id}
              size="icon"
              variant="ghost"
              title="Estornar baixa"
              onClick={(event) => {
                event.stopPropagation();
                onReverse(settlement);
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          ))}
      </div>
      {canAct && (
        <div className="financial-payables-mobile-action md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" aria-label="Ações do título">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {installment && canSettle && !["draft", "voided"].includes(document.status) && (
                <DropdownMenuItem onSelect={() => onSettle(document, installment)}>
                  <CircleDollarSign />
                  Pagar
                </DropdownMenuItem>
              )}
              {document.status === "draft" && canEdit && (
                <DropdownMenuItem onSelect={() => onEdit(document)}>
                  <Pencil /> Editar rascunho
                </DropdownMenuItem>
              )}
              {document.status === "draft" && canEdit && (
                <DropdownMenuItem onSelect={() => onVoid(document)}>
                  <ReceiptText /> Cancelar título
                </DropdownMenuItem>
              )}
              {canReverse &&
                activeSettlements.map((settlement) => (
                  <DropdownMenuItem key={settlement.id} onSelect={() => onReverse(settlement)}>
                    <RotateCcw /> Estornar baixa
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </article>
  );
}

function TitleDetailsDialog({
  document,
  recurringRule,
  chart,
  centers,
  vehicles,
  drivers,
  onOpenChange,
}: {
  document: FinancialDocumentDetails | null;
  recurringRule: FinancialRecurringRule | null;
  chart: ChartAccount[];
  centers: CostCenter[];
  vehicles: Array<{ id: string; plate: string }>;
  drivers: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
}) {
  const chartAccount = chart.find((item) => item.id === document?.chartAccountId);
  const center = centers.find((item) => item.id === document?.costCenterId);
  const vehicle = vehicles.find((item) => item.id === document?.vehicleId);
  const driver = drivers.find((item) => item.id === document?.driverId);
  const settlements = document ? effectiveSettlements(document) : [];

  return (
    <Dialog open={Boolean(document)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{document?.description || "Titulo financeiro"}</DialogTitle>
          <DialogDescription>
            Resumo completo do titulo, apropriacao, recorrencia e baixas relacionadas.
          </DialogDescription>
        </DialogHeader>
        {document ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTile label="Valor original" value={money.format(document.originalAmount)} />
              <InfoTile label="Saldo aberto" value={money.format(documentBalance(document))} />
              <InfoTile label="Parceiro" value={document.partnerName || "Nao informado"} />
              <InfoTile label="Status" value={statusLabel(visualStatus(document), document.direction)} />
              <InfoTile
                label="Competencia"
                value={
                  document.competenceDate
                    ? date.format(new Date(`${document.competenceDate}T12:00:00`))
                    : "-"
                }
              />
              <InfoTile
                label="Emissao"
                value={
                  document.issueDate
                    ? date.format(new Date(`${document.issueDate}T12:00:00`))
                    : "-"
                }
              />
              <InfoTile
                label="Data de lancamento"
                value={
                  document.entryDate
                    ? date.format(new Date(`${document.entryDate}T12:00:00`))
                    : "-"
                }
              />
              <InfoTile
                label="Vencimento"
                value={
                  document.installments[0]?.dueDate
                    ? date.format(new Date(`${document.installments[0].dueDate}T12:00:00`))
                    : "-"
                }
              />
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="financial-section-kicker">Gerencial e apropriacao</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InfoTile
                  label="Gerencial"
                  value={chartAccount ? `${chartAccount.code} - ${chartAccount.name}` : "Nao informado"}
                />
                <InfoTile label="Empresa / setor" value={center?.name || "Empresa inteira"} />
                <InfoTile label="Caminhao" value={vehicle?.plate || "Nao apropriado"} />
                <InfoTile label="Funcionario" value={driver?.name || "Nao apropriado"} />
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="financial-section-kicker">Recorrencia</p>
              <p className="mt-2 text-sm font-semibold">
                {recurringRule
                  ? `${recurringFrequencyLabel[recurringRule.frequency]} - dia ${recurringRule.dueDay} - ${recurringStatusLabel[recurringRule.status]}`
                  : "Nao recorrente"}
              </p>
              {recurringRule ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Cancelar a recorrencia encerra novas geracoes e preserva titulos anteriores.
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="financial-section-kicker">Baixas relacionadas</p>
              <div className="mt-3 space-y-2">
                {settlements.length ? (
                  settlements.map((settlement) => (
                    <div
                      key={settlement.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/35 p-3 text-sm"
                    >
                      <span>
                        {date.format(new Date(`${settlement.settledOn}T12:00:00`))} -{" "}
                        {settlement.paymentMethod}
                      </span>
                      <strong>{money.format(settlement.netAmount)}</strong>
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhuma baixa registrada.</span>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <p className="mt-1 text-sm font-extrabold text-foreground">{value}</p>
    </div>
  );
}

function visualStatus(d: FinancialDocumentDetails) {
  if (d.status === "draft") return "draft";
  if (d.status === "voided") return "voided";
  if (d.status === "settled") return "settled";
  if (d.status === "partially_settled") return "partial";
  if (d.installments.some((i) => i.balance > 0 && i.dueDate < today())) return "overdue";
  return "open";
}
const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  open: "A vencer",
  overdue: "Vencido",
  partial: "Parcial",
  settled: "Liquidado",
  voided: "Cancelado",
};

const originLabels: Record<string, string> = {
  manual: "Manual",
  fuel: "Abastecimento",
  payroll: "Salarios",
  recurring: "Recorrencia",
  freight: "Frete",
  other: "Outras",
};

function documentOrigin(sourceType: string | null) {
  if (!sourceType) return "manual";
  if (sourceType === "payroll" || sourceType === "payroll_advance") return "payroll";
  if (sourceType === "recurring_rule") return "recurring";
  if (sourceType === "fuel_record") return "fuel";
  if (sourceType === "freight" || sourceType === "freight_expense") return "freight";
  return "other";
}

function statusLabel(state: string, direction: FinancialDocumentDirection) {
  if (state === "partial") {
    return direction === "receivable" ? "Parcialmente recebido" : "Parcialmente pago";
  }
  if (state === "settled") return direction === "receivable" ? "Recebido" : "Pago";
  return statusLabels[state];
}

function FilterPanel({
  embedded = false,
  filters,
  setFilters,
  partners,
  chart,
  centers,
}: {
  embedded?: boolean;
  filters: TitleFilters;
  setFilters: (f: TitleFilters) => void;
  partners: BusinessPartner[];
  chart: ChartAccount[];
  centers: CostCenter[];
}) {
  const set = (key: keyof TitleFilters, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8",
        embedded ? "pt-4" : "financial-filter-bar mx-3 p-4 md:mx-0",
      )}
    >
      <div className="relative sm:col-span-2">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar título, documento ou parceiro"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>
      <Input type="date" value={filters.start} onChange={(e) => set("start", e.target.value)} />
      <Input type="date" value={filters.end} onChange={(e) => set("end", e.target.value)} />
      <SimpleSelect
        value={filters.partner}
        onChange={(v) => set("partner", v)}
        all="Todos os parceiros"
        items={partners.map((p) => [p.id, p.tradeName])}
      />
      <SimpleSelect
        value={filters.status}
        onChange={(v) => set("status", v)}
        all="Todos os status"
        items={Object.entries(statusLabels)}
      />
      <SimpleSelect
        value={filters.origin}
        onChange={(v) => set("origin", v)}
        all="Todas as origens"
        items={Object.entries(originLabels)}
      />
      <SimpleSelect
        value={filters.category}
        onChange={(v) => set("category", v)}
        all="Todas as categorias"
        items={chart.filter((a) => a.isPostable).map((a) => [a.id, `${a.code} · ${a.name}`])}
      />
      <SimpleSelect
        value={filters.center}
        onChange={(v) => set("center", v)}
        all="Todos os centros"
        items={centers.map((c) => [c.id, c.name])}
      />
      <Input
        type="number"
        placeholder="Valor mínimo"
        value={filters.min}
        onChange={(e) => set("min", e.target.value)}
      />
      <Input
        type="number"
        placeholder="Valor máximo"
        value={filters.max}
        onChange={(e) => set("max", e.target.value)}
      />
      <Button variant="outline" onClick={() => setFilters(initialFilters())}>
        <Settings2 className="size-4" />
        Limpar
      </Button>
    </div>
  );
}
function SimpleSelect({
  value,
  onChange,
  all,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  all: string;
  items: Array<readonly [string, string]>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {items.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TitleList({
  documents,
  direction,
  canSettle,
  canReverse,
  canEdit,
  onSettle,
  onReverse,
  onVoid,
  onEdit,
}: {
  documents: FinancialDocumentDetails[];
  direction: FinancialDocumentDirection;
  canSettle: boolean;
  canReverse: boolean;
  canEdit: boolean;
  onSettle: (d: FinancialDocumentDetails, i: FinancialInstallment) => void;
  onReverse: (s: FinancialSettlement) => void;
  onVoid: (d: FinancialDocumentDetails) => void;
  onEdit: (d: FinancialDocumentDetails) => void;
}) {
  return (
    <section className="premium-card mx-3 overflow-hidden md:mx-0">
      <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-3 border-b border-border financial-table-head px-4 py-3 md:grid">
        <span>Título</span>
        <span>Parceiro</span>
        <span>Origem</span>
        <span>Vencimento</span>
        <span>Valor</span>
        <span>Situação</span>
        <span>Ação</span>
      </div>
      {documents.length ? (
        documents.map((d) => (
          <TitleRow
            key={d.id}
            document={d}
            direction={direction}
            canSettle={canSettle}
            canReverse={canReverse}
            canEdit={canEdit}
            onSettle={onSettle}
            onReverse={onReverse}
            onVoid={onVoid}
            onEdit={onEdit}
          />
        ))
      ) : (
        <div className="p-4">
          <EmptyReport text="Nenhum titulo encontrado para os filtros atuais." />
        </div>
      )}
    </section>
  );
}
function TitleRow({
  document: d,
  direction,
  canSettle,
  canReverse,
  canEdit,
  onSettle,
  onReverse,
  onVoid,
  onEdit,
}: {
  document: FinancialDocumentDetails;
  direction: FinancialDocumentDirection;
  canSettle: boolean;
  canReverse: boolean;
  canEdit: boolean;
  onSettle: (d: FinancialDocumentDetails, i: FinancialInstallment) => void;
  onReverse: (s: FinancialSettlement) => void;
  onVoid: (d: FinancialDocumentDetails) => void;
  onEdit: (d: FinancialDocumentDetails) => void;
}) {
  const installment = d.installments.find((i) => i.balance > 0);
  const state = visualStatus(d);
  const balance = d.installments.reduce((s, i) => s + i.balance, 0);
  const activeSettlements = effectiveSettlements(d);
  const canAct =
    Boolean(installment && canSettle && !["draft", "voided"].includes(d.status)) ||
    (d.status === "draft" && canEdit) ||
    (canReverse && activeSettlements.length > 0);
  return (
    <div className="financial-row relative grid gap-3 border-b border-border p-4 pr-16 last:border-0 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr_1fr_auto] md:items-center md:pr-4">
      <div>
        <div className="text-sm font-extrabold">{d.description}</div>
        <div className="text-xs text-muted-foreground">
          {d.documentNumber || "Sem número"} · {d.installments.length} parcela(s)
        </div>
      </div>
      <div className="text-sm">
        <span className="md:hidden text-xs text-muted-foreground">Parceiro · </span>
        {d.partnerName || "Não informado"}
      </div>
      <div>
        <FinancialStatusBadge state="muted">
          {originLabels[documentOrigin(d.sourceType)]}
        </FinancialStatusBadge>
      </div>
      <div className="text-sm">
        <span className="md:hidden text-xs text-muted-foreground">Vencimento · </span>
        {installment ? date.format(new Date(`${installment.dueDate}T12:00:00`)) : "-"}
      </div>
      <div>
        <strong className="text-sm">{money.format(balance)}</strong>
        <div className="text-[11px] text-muted-foreground">de {money.format(d.originalAmount)}</div>
      </div>
      <div>
        <FinancialStatusBadge
          state={state === "overdue" ? "danger" : state === "settled" ? "success" : "muted"}
        >
          {statusLabel(state, direction)}
        </FinancialStatusBadge>
      </div>
      <div className="hidden flex-wrap gap-2 md:flex">
        {installment && canSettle && !["draft", "voided"].includes(d.status) && (
          <Button size="sm" onClick={() => onSettle(d, installment)}>
            {direction === "receivable" ? "Receber" : "Pagar"}
          </Button>
        )}
        {d.status === "draft" && canEdit && (
          <>
            <Button size="icon" variant="outline" title="Editar rascunho" onClick={() => onEdit(d)}>
              <Pencil className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onVoid(d)}>
              Cancelar
            </Button>
          </>
        )}
        {canReverse &&
          activeSettlements.map((s) => (
            <Button
              key={s.id}
              size="icon"
              variant="ghost"
              title="Estornar baixa"
              onClick={() => onReverse(s)}
            >
              <RotateCcw className="size-4" />
            </Button>
          ))}
      </div>
      {canAct && (
        <div className="absolute right-4 top-4 md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" aria-label="Ações do título">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {installment && canSettle && !["draft", "voided"].includes(d.status) && (
                <DropdownMenuItem onSelect={() => onSettle(d, installment)}>
                  <CircleDollarSign />
                  {direction === "receivable" ? "Receber" : "Pagar"}
                </DropdownMenuItem>
              )}
              {d.status === "draft" && canEdit && (
                <DropdownMenuItem onSelect={() => onEdit(d)}>
                  <Pencil /> Editar rascunho
                </DropdownMenuItem>
              )}
              {d.status === "draft" && canEdit && (
                <DropdownMenuItem onSelect={() => onVoid(d)}>
                  <ReceiptText /> Cancelar título
                </DropdownMenuItem>
              )}
              {canReverse &&
                activeSettlements.map((settlement) => (
                  <DropdownMenuItem key={settlement.id} onSelect={() => onReverse(settlement)}>
                    <RotateCcw /> Estornar baixa
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function DocumentDialog({
  open,
  onOpenChange,
  access,
  direction,
  partners,
  chart,
  centers,
  freights,
  vehicles,
  drivers,
  products,
  saving,
  document,
  onSave,
  onPartnerCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  access: FinancialAccess;
  direction: FinancialDocumentDirection;
  partners: BusinessPartner[];
  chart: ChartAccount[];
  centers: CostCenter[];
  freights: CanonicalFreight[];
  vehicles: Array<{ id: string; plate: string }>;
  drivers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  saving: boolean;
  document: FinancialDocumentDetails | null;
  onSave: (i: FinancialDocumentInput, recurring?: FinancialRecurringRuleInput) => void;
  onPartnerCreated: () => void;
}) {
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [customInstallments, setCustomInstallments] = useState<
    Array<{ amount: string; dueDate: string }>
  >([]);
  const [customMode, setCustomMode] = useState(false);
  const [form, setForm] = useState({
    partnerId: "",
    description: "",
    documentNumber: "",
    issueDate: today(),
    competenceDate: today(),
    entryDate: today(),
    amount: "",
    dueDate: today(),
    installments: "1",
    chartAccountId: "",
    costCenterId: "",
    vehicleId: "",
    driverId: "",
    freightId: "",
    productId: "",
    notes: "",
    status: "posted",
    recurring: "no",
    recurringDueDay: "5",
    recurringStartMonth: nextCompetenceMonthFrom(today()),
    recurringAutoPost: "true",
  });
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  useEffect(() => {
    if (!open) return;
    if (document) {
      setForm({
        partnerId: document.partnerId || "",
        description: document.description,
        documentNumber: document.documentNumber || "",
        issueDate: document.issueDate || today(),
        competenceDate: document.competenceDate || today(),
        entryDate: document.entryDate || today(),
        amount: String(document.originalAmount),
        dueDate: document.installments[0]?.dueDate || today(),
        installments: String(document.installments.length || 1),
        chartAccountId: document.chartAccountId || "",
        costCenterId: document.costCenterId || "",
        vehicleId: document.vehicleId || "",
        driverId: document.driverId || "",
        freightId: document.freightId || "",
        productId: document.productId || "",
        notes: document.notes || "",
        status: "draft",
        recurring: "no",
        recurringDueDay: "5",
        recurringStartMonth: nextCompetenceMonthFrom(document.installments[0]?.dueDate || today()),
        recurringAutoPost: "true",
      });
      setCustomMode(true);
      setCustomInstallments(
        document.installments.map((item) => ({
          amount: String(item.amount),
          dueDate: item.dueDate,
        })),
      );
      return;
    }
    setForm({
      partnerId: "",
      description: "",
      documentNumber: "",
      issueDate: today(),
      competenceDate: today(),
      entryDate: today(),
      amount: "",
      dueDate: today(),
      installments: "1",
      chartAccountId: "",
      costCenterId: "",
      vehicleId: "",
      driverId: "",
      freightId: "",
      productId: "",
      notes: "",
      status: "posted",
      recurring: "no",
      recurringDueDay: "5",
      recurringStartMonth: nextCompetenceMonthFrom(today()),
      recurringAutoPost: "true",
    });
    setCustomMode(false);
    setCustomInstallments([]);
  }, [document, open]);
  const setInstallmentCount = (value: string) => {
    const count = Math.max(1, Math.min(120, Number(value) || 1));
    set("installments", String(count));
    setCustomInstallments((current) =>
      Array.from(
        { length: count },
        (_, index) => current[index] || { amount: "", dueDate: index === 0 ? form.dueDate : "" },
      ),
    );
  };
  const customTotal = customInstallments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const customInstallmentsValid =
    !customMode ||
    (customInstallments.length === Number(form.installments) &&
      customInstallments.every((item) => Number(item.amount) > 0 && item.dueDate) &&
      Math.abs(customTotal - Number(form.amount || 0)) < 0.005);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {document
                ? "Editar rascunho"
                : direction === "receivable"
                  ? "Novo título a receber"
                  : "Novo título a pagar"}
            </DialogTitle>
            <DialogDescription>
              Cadastre o fato financeiro e seus vencimentos sem alterar a operação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={direction === "receivable" ? "Cliente" : "Fornecedor"}>
              <div className="flex gap-2">
                <SimpleSelect
                  value={form.partnerId || "all"}
                  onChange={(v) => set("partnerId", v === "all" ? "" : v)}
                  all="Selecionar parceiro"
                  items={partners.map((p) => [p.id, p.tradeName])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setPartnerOpen(true)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </Field>
            <Field label="Número / documento">
              <Input
                value={form.documentNumber}
                onChange={(e) => set("documentNumber", e.target.value)}
              />
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Input
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <Field label="Emissão">
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) => set("issueDate", e.target.value)}
              />
            </Field>
            <Field label="Competência">
              <Input
                type="date"
                value={form.competenceDate}
                onChange={(e) => set("competenceDate", e.target.value)}
              />
            </Field>
            <Field label="Data de lancamento">
              <Input
                type="date"
                value={form.entryDate}
                onChange={(e) => set("entryDate", e.target.value)}
              />
            </Field>
            <Field label="Valor">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
            <Field label="Primeiro vencimento">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </Field>
            <Field label="Número de parcelas">
              <Input
                type="number"
                min="1"
                max="120"
                value={form.installments}
                onChange={(e) => setInstallmentCount(e.target.value)}
              />
            </Field>
            <Field label="Distribuição das parcelas">
              <Select
                value={customMode ? "custom" : "equal"}
                onValueChange={(value) => {
                  setCustomMode(value === "custom");
                  if (value === "custom") setInstallmentCount(form.installments);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Valores iguais, mensal</SelectItem>
                  <SelectItem value="custom">Valores e datas personalizados</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {customMode && (
              <div className="space-y-2 rounded-md border border-border p-3 sm:col-span-2">
                <div className="text-xs font-bold text-muted-foreground">
                  Parcelas personalizadas
                </div>
                {customInstallments.map((item, index) => (
                  <div key={index} className="grid grid-cols-[52px_1fr_1fr] items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{index + 1}ª</span>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Valor"
                      value={item.amount}
                      onChange={(event) =>
                        setCustomInstallments((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, amount: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <Input
                      type="date"
                      value={item.dueDate}
                      onChange={(event) =>
                        setCustomInstallments((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, dueDate: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <div className="text-right text-xs font-bold text-muted-foreground">
                  Soma: {money.format(customTotal)}
                </div>
              </div>
            )}
            <div className="rounded-md border border-border p-3 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Recorrencia">
                  <Select
                    value={form.recurring}
                    onValueChange={(value) =>
                      setForm({
                        ...form,
                        recurring: value,
                        recurringStartMonth:
                          form.recurringStartMonth || nextCompetenceMonthFrom(form.dueDate),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Nao recorrente</SelectItem>
                      <SelectItem value="yes">Recorrente</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.recurring === "yes" && (
                  <>
                    <Field label="Dia mensal">
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={form.recurringDueDay}
                        onChange={(e) => set("recurringDueDay", e.target.value)}
                      />
                    </Field>
                    <Field label="Inicio">
                      <Input
                        type="month"
                        value={form.recurringStartMonth}
                        onChange={(e) => set("recurringStartMonth", e.target.value)}
                      />
                    </Field>
                    <Field label="Gerar lancado">
                      <Select
                        value={form.recurringAutoPost}
                        onValueChange={(value) => set("recurringAutoPost", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Sim</SelectItem>
                          <SelectItem value="false">Rascunho</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
              </div>
              {form.recurring === "yes" && (
                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                  A regra gera os proximos titulos e preserva historico quando cancelada.
                </p>
              )}
            </div>
            <Field label="Categoria">
              <SimpleSelect
                value={form.chartAccountId || "all"}
                onChange={(v) => set("chartAccountId", v === "all" ? "" : v)}
                all="Selecionar categoria"
                items={chart
                  .filter((a) => a.isPostable && a.active)
                  .map((a) => [a.id, `${a.code} · ${a.name}`])}
              />
            </Field>
            <Field label="Setor / gerencial">
              <SimpleSelect
                value={form.costCenterId || "all"}
                onChange={(v) => set("costCenterId", v === "all" ? "" : v)}
                all="Empresa inteira"
                items={centers.filter((c) => c.active).map((c) => [c.id, c.name])}
              />
            </Field>
            <Field label="Caminhao / placa">
              <SimpleSelect
                value={form.vehicleId || "all"}
                onChange={(v) =>
                  setForm({ ...form, vehicleId: v === "all" ? "" : v, driverId: "", freightId: "" })
                }
                all="Nao apropriar por caminhao"
                items={vehicles.map((v) => [v.id, v.plate])}
              />
            </Field>
            <Field label="Funcionario">
              <SimpleSelect
                value={form.driverId || "all"}
                onChange={(v) =>
                  setForm({ ...form, driverId: v === "all" ? "" : v, vehicleId: "", freightId: "" })
                }
                all="Nao apropriar por funcionario"
                items={drivers.filter((d) => d.active).map((d) => [d.id, d.name])}
              />
            </Field>
            <Field label="Produto (opcional)">
              <SimpleSelect
                value={form.productId || "all"}
                onChange={(v) => set("productId", v === "all" ? "" : v)}
                all="Sem produto"
                items={products.map((p) => [p.id, p.name])}
              />
            </Field>
            <Field label="Situação">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="posted">Lançado</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Observação" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                saving ||
                !form.amount ||
                !form.dueDate ||
                (form.recurring === "yes" && (!form.chartAccountId || !form.recurringStartMonth)) ||
                !customInstallmentsValid
              }
              onClick={() =>
                onSave(
                  {
                    id: document?.id,
                    workspaceId: access.workspaceId,
                    direction,
                    partnerId: form.partnerId,
                    documentType: "manual",
                    documentNumber: form.documentNumber,
                    description: form.description,
                    originalAmount: Number(form.amount),
                    competenceDate: form.competenceDate,
                    issueDate: form.issueDate,
                    entryDate: form.entryDate,
                    chartAccountId: form.chartAccountId,
                    costCenterId: form.costCenterId,
                    vehicleId: form.vehicleId,
                    driverId: form.driverId,
                    freightId: form.freightId,
                    productId: form.productId,
                    notes: form.notes,
                    status: form.status as "draft" | "posted",
                    installmentCount: Number(form.installments),
                    firstDueDate: form.dueDate,
                    installments: customMode
                      ? customInstallments.map((item) => ({
                          amount: Number(item.amount),
                          dueDate: item.dueDate,
                        }))
                      : undefined,
                  },
                  form.recurring === "yes" && !document
                    ? {
                        workspaceId: access.workspaceId,
                        kind:
                          direction === "receivable" ? "recurring_income" : "recurring_expense",
                        name:
                          form.description ||
                          (direction === "receivable"
                            ? "Titulo recorrente a receber"
                            : "Titulo recorrente a pagar"),
                        partnerId: form.partnerId,
                        driverId: form.driverId,
                        vehicleId: form.vehicleId,
                        costCenterId: form.costCenterId,
                        chartAccountId: form.chartAccountId,
                        amount: Number(form.amount),
                        frequency: "MONTHLY",
                        dueDay: Number(form.recurringDueDay || 1),
                        startMonth: normalizeMonth(form.recurringStartMonth),
                        autoPost: form.recurringAutoPost === "true",
                        status: "active",
                        notes: form.notes,
                      }
                    : undefined,
                )
              }
            >
              {saving && <LoaderCircle className="size-4 animate-spin" />}Salvar título
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PartnerDialog
        open={partnerOpen}
        onOpenChange={setPartnerOpen}
        access={access}
        role={direction === "receivable" ? "customer" : "supplier"}
        onSaved={onPartnerCreated}
      />
    </>
  );
}

function PartnerDialog({
  open,
  onOpenChange,
  access,
  role,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  access: FinancialAccess;
  role: "customer" | "supplier";
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [tax, setTax] = useState("");
  const [receivableDays, setReceivableDays] = useState("");
  const [payableDays, setPayableDays] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo {role === "customer" ? "cliente" : "fornecedor"}</DialogTitle>
          <DialogDescription>Cadastro financeiro unificado por tenant.</DialogDescription>
        </DialogHeader>
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="CPF/CNPJ">
          <Input value={tax} onChange={(e) => setTax(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prazo padrão a receber">
            <Input
              type="number"
              min="0"
              value={receivableDays}
              onChange={(event) => setReceivableDays(event.target.value)}
              placeholder="Opcional"
            />
          </Field>
          <Field label="Prazo padrão a pagar">
            <Input
              type="number"
              min="0"
              value={payableDays}
              onChange={(event) => setPayableDays(event.target.value)}
              placeholder="Opcional"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!name}
            onClick={async () => {
              try {
                await saveBusinessPartner({
                  workspaceId: access.workspaceId,
                  tradeName: name,
                  taxId: tax,
                  role,
                  defaultReceivableDueDays:
                    receivableDays.trim() === "" ? null : Number(receivableDays),
                  defaultPayableDueDays: payableDays.trim() === "" ? null : Number(payableDays),
                });
                toast.success("Parceiro cadastrado.");
                onOpenChange(false);
                onSaved();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao cadastrar.");
              }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettlementDialog({
  target,
  accounts,
  centers,
  vehicles,
  drivers,
  saving,
  actionLabel,
  onOpenChange,
  onSave,
}: {
  target: { document: FinancialDocumentDetails; installment: FinancialInstallment } | null;
  accounts: FinancialAccount[];
  centers: CostCenter[];
  vehicles: Array<{ id: string; plate: string }>;
  drivers: Array<{ id: string; name: string }>;
  saving: boolean;
  actionLabel: string;
  onOpenChange: (v: boolean) => void;
  onSave: (i: {
    installmentId: string;
    financialAccountId: string;
    amount: number;
    interestAmount: number;
    penaltyAmount: number;
    discountAmount: number;
    settledOn: string;
    paymentMethod: string;
    notes: string;
    adjustmentAllocation?: {
      scope: "company" | "cost_center" | "vehicle" | "driver";
      costCenterId?: string | null;
      vehicleId?: string | null;
      driverId?: string | null;
    };
  }) => void;
}) {
  const [form, setForm] = useState({
    amount: "",
    account: "",
    interest: "0",
    penalty: "0",
    discount: "0",
    date: today(),
    method: "pix",
    notes: "",
    allocationScope: "company",
    costCenterId: "",
    vehicleId: "",
    driverId: "",
  });
  useEffect(() => {
    if (target) {
      setForm((f) => ({
        ...f,
        amount: String(target.installment.balance),
        allocationScope: "company",
        costCenterId: "",
        vehicleId: "",
        driverId: "",
      }));
    }
  }, [target]);
  const hasAdjustments =
    Number(form.interest || 0) > 0 || Number(form.penalty || 0) > 0 || Number(form.discount || 0) > 0;
  const requiresAdjustmentAllocation =
    Boolean(target) && hasAdjustments && (target?.document.allocationCount ?? 0) === 0;
  const adjustmentAllocationMissing =
    requiresAdjustmentAllocation &&
    ((form.allocationScope === "cost_center" && !form.costCenterId) ||
      (form.allocationScope === "vehicle" && !form.vehicleId) ||
      (form.allocationScope === "driver" && !form.driverId));
  const buildAdjustmentAllocation = () => {
    if (!requiresAdjustmentAllocation) return undefined;
    return {
      scope: form.allocationScope as "company" | "cost_center" | "vehicle" | "driver",
      costCenterId: form.allocationScope === "cost_center" ? form.costCenterId : null,
      vehicleId: form.allocationScope === "vehicle" ? form.vehicleId : null,
      driverId: form.allocationScope === "driver" ? form.driverId : null,
    };
  };
  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} parcela</DialogTitle>
          <DialogDescription>
            Saldo disponível: {money.format(target?.installment.balance || 0)}. A baixa não altera o
            valor original.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor principal">
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Banco / caixa" className="sm:col-span-2">
            <SimpleSelect
              value={form.account || "all"}
              onChange={(v) => setForm({ ...form, account: v === "all" ? "" : v })}
              all="Selecionar conta"
              items={accounts.map((a) => [a.id, `${a.name} · ${money.format(a.currentBalance)}`])}
            />
          </Field>
          <Field label="Juros">
            <Input
              type="number"
              step="0.01"
              value={form.interest}
              onChange={(e) => setForm({ ...form, interest: e.target.value })}
            />
          </Field>
          <Field label="Multa">
            <Input
              type="number"
              step="0.01"
              value={form.penalty}
              onChange={(e) => setForm({ ...form, penalty: e.target.value })}
            />
          </Field>
          <Field label="Desconto">
            <Input
              type="number"
              step="0.01"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
            />
          </Field>
          {hasAdjustments && (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">
              <strong className="mb-1 block text-foreground">Classificacao gerencial dos ajustes</strong>
              <span className="block">Juros entram no gerencial 7.03 - Juros e aparecem no DRE em Resultado Financeiro.</span>
              <span className="block">Multas entram no gerencial 7.04 - Multas e aparecem no DRE em Resultado Financeiro.</span>
              <span className="block">Descontos seguem a categoria propria de descontos da baixa.</span>
            </div>
          )}
          <Field label="Forma">
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="bank_transfer">Transferência</SelectItem>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="card">Cartão</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {requiresAdjustmentAllocation && (
            <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 sm:col-span-2">
              <div>
                <div className="text-sm font-bold">Apropriação dos ajustes</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este título não possui apropriação. Para lançar juros, multa ou desconto, informe
                  onde esses ajustes devem entrar no gerencial.
                </p>
              </div>
              <Field label="Tipo de apropriação">
                <Select
                  value={form.allocationScope}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      allocationScope: value,
                      costCenterId: "",
                      vehicleId: "",
                      driverId: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Empresa inteira</SelectItem>
                    <SelectItem value="cost_center">Setor / gerencial</SelectItem>
                    <SelectItem value="vehicle">Caminhão</SelectItem>
                    <SelectItem value="driver">Funcionário</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.allocationScope === "cost_center" && (
                <Field label="Setor / gerencial">
                  <SimpleSelect
                    value={form.costCenterId || "all"}
                    onChange={(value) =>
                      setForm({ ...form, costCenterId: value === "all" ? "" : value })
                    }
                    all="Selecionar apropriação"
                    items={centers.filter((center) => center.active).map((center) => [center.id, center.name])}
                  />
                </Field>
              )}
              {form.allocationScope === "vehicle" && (
                <Field label="Caminhão">
                  <SimpleSelect
                    value={form.vehicleId || "all"}
                    onChange={(value) =>
                      setForm({ ...form, vehicleId: value === "all" ? "" : value })
                    }
                    all="Selecionar caminhão"
                    items={vehicles.map((vehicle) => [vehicle.id, vehicle.plate])}
                  />
                </Field>
              )}
              {form.allocationScope === "driver" && (
                <Field label="Funcionário">
                  <SimpleSelect
                    value={form.driverId || "all"}
                    onChange={(value) =>
                      setForm({ ...form, driverId: value === "all" ? "" : value })
                    }
                    all="Selecionar funcionário"
                    items={drivers.map((driver) => [driver.id, driver.name])}
                  />
                </Field>
              )}
            </div>
          )}
          <Field label="Observação" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              saving ||
              !target ||
              !form.account ||
              Number(form.amount) <= 0 ||
              adjustmentAllocationMissing
            }
            onClick={() =>
              target &&
              onSave({
                installmentId: target.installment.id,
                financialAccountId: form.account,
                amount: Number(form.amount),
                interestAmount: Number(form.interest),
                penaltyAmount: Number(form.penalty),
                discountAmount: Number(form.discount),
                settledOn: form.date,
                paymentMethod: form.method,
                notes: form.notes,
                adjustmentAllocation: buildAdjustmentAllocation(),
              })
            }
          >
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const recurringKindLabel: Record<FinancialRecurringKind, string> = {
  salary: "Salario",
  recurring_income: "Receita recorrente",
  recurring_expense: "Despesa recorrente",
  fixed_cost: "Custo fixo",
};

const recurringStatusLabel: Record<FinancialRecurringRule["status"], string> = {
  active: "Ativa",
  paused: "Pausada",
  ended: "Encerrada",
};

const recurringFrequencyLabel: Record<FinancialRecurringFrequency, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  YEARLY: "Anual",
};

function currentCompetenceMonth() {
  return today().slice(0, 7);
}

function nextCompetenceMonthFrom(dateValue: string) {
  const base = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
  base.setMonth(base.getMonth() + 1, 1);
  return base.toISOString().slice(0, 7);
}

function normalizeMonth(value: string) {
  return value.length === 7 ? `${value}-01` : value;
}

function denormalizeMonth(value: string | null) {
  return value ? value.slice(0, 7) : "";
}

function emptyRecurringForm(access: FinancialAccess) {
  return {
    id: "",
    workspaceId: access.workspaceId,
    kind: "recurring_expense" as FinancialRecurringKind,
    name: "",
    partnerId: "",
    employeeName: "",
    driverId: "",
    vehicleId: "",
    costCenterId: "",
    chartAccountId: "",
    amount: "",
    frequency: "MONTHLY" as FinancialRecurringFrequency,
    dueDay: "5",
    startMonth: currentCompetenceMonth(),
    endMonth: "",
    autoPost: "true",
    status: "active" as FinancialRecurringRule["status"],
    notes: "",
  };
}

export function FinancialRecurringPage() {
  return (
    <FinancialBoundary>
      {(access) => <FinancialRecurringContent access={access} />}
    </FinancialBoundary>
  );
}

function FinancialRecurringContent({ access }: { access: FinancialAccess }) {
  const [rules, setRules] = useState<FinancialRecurringRule[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [chart, setChart] = useState<ChartAccount[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [competenceMonth, setCompetenceMonth] = useState(currentCompetenceMonth());
  const [form, setForm] = useState(() => emptyRecurringForm(access));
  const { vehicles, drivers } = useFleet();
  const canManage = hasFinancialPermission(access, "financial.manage_recurring");

  const load = useCallback(async () => {
    const [nextRules, nextPartners, nextChart, nextCenters] = await Promise.all([
      listFinancialRecurringRules(),
      listFinancialPartners(),
      listFinancialChart(),
      listFinancialCostCenters(),
    ]);
    setRules(nextRules);
    setPartners(nextPartners);
    setChart(nextChart);
    setCenters(nextCenters);
  }, []);

  useEffect(() => {
    load().catch(() => toast.error("Nao foi possivel carregar salarios e recorrencias."));
  }, [load]);

  const active = rules.filter((rule) => rule.status === "active");
  const monthlyTotal = active.reduce((sum, rule) => sum + rule.amount, 0);
  const salaryTotal = active
    .filter((rule) => rule.kind === "salary")
    .reduce((sum, rule) => sum + rule.amount, 0);
  const pendingGeneration = active.filter(
    (rule) => rule.lastGeneratedCompetence !== normalizeMonth(competenceMonth),
  ).length;

  const openNew = () => {
    const next = emptyRecurringForm(access);
    next.chartAccountId =
      chart.find((account) => account.code === "5.03")?.id ||
      chart.find((account) => account.code === "5.05")?.id ||
      "";
    next.costCenterId =
      centers.find((center) => center.code === "ADMINISTRATIVO")?.id ||
      centers.find((center) => center.code === "OPERACAO")?.id ||
      "";
    setForm(next);
    setOpen(true);
  };

  const openEdit = (rule: FinancialRecurringRule) => {
    setForm({
      id: rule.id,
      workspaceId: rule.workspaceId,
      kind: rule.kind,
      name: rule.name,
      partnerId: rule.partnerId || "",
      employeeName: rule.employeeName || "",
      driverId: rule.driverId || "",
      vehicleId: rule.vehicleId || "",
      costCenterId: rule.costCenterId,
      chartAccountId: rule.chartAccountId,
      amount: String(rule.amount),
      frequency: rule.frequency,
      dueDay: String(rule.dueDay),
      startMonth: denormalizeMonth(rule.startMonth),
      endMonth: denormalizeMonth(rule.endMonth),
      autoPost: String(rule.autoPost),
      status: rule.status,
      notes: rule.notes || "",
    });
    setOpen(true);
  };

  const submit = async () => {
    const payload: FinancialRecurringRuleInput = {
      id: form.id || undefined,
      workspaceId: access.workspaceId,
      kind: form.kind,
      name: form.name,
      partnerId: form.partnerId || undefined,
      employeeName: form.employeeName || undefined,
      driverId: form.driverId || undefined,
      vehicleId: form.vehicleId || undefined,
      costCenterId: form.costCenterId,
      chartAccountId: form.chartAccountId,
      amount: Number(form.amount),
      frequency: form.frequency,
      dueDay: Number(form.dueDay),
      startMonth: normalizeMonth(form.startMonth),
      endMonth: form.endMonth ? normalizeMonth(form.endMonth) : undefined,
      autoPost: form.autoPost === "true",
      status: form.status,
      notes: form.notes || undefined,
    };
    setSaving(true);
    try {
      await saveFinancialRecurringRule(payload);
      toast.success("Recorrencia salva.");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar recorrencia.");
    } finally {
      setSaving(false);
    }
  };

  const generate = async (ruleId?: string) => {
    setGenerating(true);
    try {
      const result = await generateFinancialRecurringDocuments(
        access.workspaceId,
        normalizeMonth(competenceMonth),
        ruleId,
      );
      toast.success(`${result.generated} titulo(s) gerado(s), ${result.skipped} ja existiam.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar titulos.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="financial-shell space-y-4">
      <PageHeader
        title="Despesas Recorrentes"
        subtitle="Custos periodicos gerando titulos canonicos por competencia"
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => void generate()} disabled={generating}>
                <RefreshCw className={cn("size-4", generating && "animate-spin")} />
                Gerar competencia
              </Button>
              <Button onClick={openNew}>
                <Plus className="size-4" />
                Nova despesa
              </Button>
            </>
          ) : undefined
        }
      />
      <FinancialNav />

      <div className="grid grid-cols-2 gap-3 px-3 lg:grid-cols-4 md:px-0">
        <Stat label="Ativas" value={active.length} icon={Repeat2} />
        <Stat label="Salario simples" value={salaryTotal} icon={ReceiptText} />
        <Stat label="Custo ativo" value={monthlyTotal} icon={WalletCards} tone="danger" />
        <Stat label="A gerar" value={pendingGeneration} icon={CalendarClock} />
      </div>

      <section className="financial-filter-bar mx-3 p-4 md:mx-0">
        <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-end">
          <Field label="Competencia">
            <Input
              type="month"
              value={competenceMonth}
              onChange={(event) => setCompetenceMonth(event.target.value)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            A geracao usa source_type, source_id e source_event para nao duplicar titulos do mesmo
            periodo.
          </p>
        </div>
      </section>

      <section className="premium-card mx-3 overflow-hidden md:mx-0">
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_1fr_auto] gap-3 border-b border-border financial-table-head px-4 py-3 md:grid">
          <span>Regra</span>
          <span>Tipo</span>
          <span>Alocacao</span>
          <span>Frequencia</span>
          <span>Vencimento</span>
          <span>Valor</span>
          <span>Acao</span>
        </div>
        {rules.length ? (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="financial-row grid gap-3 border-b border-border p-4 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <div className="text-sm font-extrabold">{rule.name}</div>
                <div className="text-xs text-muted-foreground">
                  {rule.partnerName || rule.employeeName || rule.driverName || "Sem favorecido"} -{" "}
                  {recurringStatusLabel[rule.status]}
                </div>
              </div>
              <div className="text-sm">{recurringKindLabel[rule.kind]}</div>
              <div className="text-sm">
                {rule.vehiclePlate || rule.costCenterName || "Nao alocado"}
                <span className="block text-xs text-muted-foreground">
                  {rule.chartAccountName || "Sem categoria"}
                </span>
              </div>
              <div className="text-sm">{recurringFrequencyLabel[rule.frequency]}</div>
              <div className="text-sm">
                Dia {rule.dueDay}
                <span className="block text-xs text-muted-foreground">
                  desde {denormalizeMonth(rule.startMonth)}
                </span>
              </div>
              <strong className="text-sm">{money.format(rule.amount)}</strong>
              <div className="flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <Button
                      size="icon"
                      variant="outline"
                      title="Editar"
                      onClick={() => openEdit(rule)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      title="Gerar esta regra"
                      disabled={generating || rule.status !== "active"}
                      onClick={() => void generate(rule.id)}
                    >
                      <CalendarClock className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const nextStatus = rule.status === "active" ? "paused" : "active";
                        await setFinancialRecurringRuleStatus(
                          rule.id,
                          access.workspaceId,
                          nextStatus,
                        );
                        toast.success(
                          nextStatus === "active" ? "Recorrencia ativada." : "Recorrencia pausada.",
                        );
                        await load();
                      }}
                    >
                      {rule.status === "active" ? "Pausar" : "Ativar"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4">
            <EmptyReport text="Nenhum salario ou custo recorrente cadastrado." />
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar recorrencia" : "Nova recorrencia"}</DialogTitle>
            <DialogDescription>
              A regra gera contas a pagar e alocacoes financeiras sem duplicar o resultado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                value={form.kind}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    kind: value as FinancialRecurringKind,
                    chartAccountId:
                      value === "salary"
                        ? chart.find((account) => account.code === "5.03")?.id ||
                          current.chartAccountId
                        : current.chartAccountId,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">Salario</SelectItem>
                  <SelectItem value="recurring_expense">Despesa recorrente</SelectItem>
                  <SelectItem value="fixed_cost">Custo fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Situacao">
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as FinancialRecurringRule["status"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="ended">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nome da regra" className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Fornecedor / favorecido">
              <SimpleSelect
                value={form.partnerId || "all"}
                onChange={(value) => setForm({ ...form, partnerId: value === "all" ? "" : value })}
                all="Sem parceiro"
                items={partners
                  .filter((partner) => partner.roles.includes("supplier"))
                  .map((partner) => [partner.id, partner.tradeName])}
              />
            </Field>
            <Field label="Funcionario / referencia">
              <Input
                value={form.employeeName}
                onChange={(event) => setForm({ ...form, employeeName: event.target.value })}
              />
            </Field>
            <Field label="Motorista">
              <SimpleSelect
                value={form.driverId || "all"}
                onChange={(value) => setForm({ ...form, driverId: value === "all" ? "" : value })}
                all="Sem motorista"
                items={drivers.map((driver) => [driver.id, driver.name])}
              />
            </Field>
            <Field label="Caminhao">
              <SimpleSelect
                value={form.vehicleId || "all"}
                onChange={(value) => setForm({ ...form, vehicleId: value === "all" ? "" : value })}
                all="Sem caminhao"
                items={vehicles.map((vehicle) => [vehicle.id, vehicle.plate])}
              />
            </Field>
            <Field label="Categoria">
              <SimpleSelect
                value={form.chartAccountId || "all"}
                onChange={(value) =>
                  setForm({ ...form, chartAccountId: value === "all" ? "" : value })
                }
                all="Selecionar categoria"
                items={chart
                  .filter(
                    (account) =>
                      account.active && account.isPostable && account.accountType === "expense",
                  )
                  .map((account) => [account.id, `${account.code} - ${account.name}`])}
              />
            </Field>
            <Field label="Apropriação">
              <SimpleSelect
                value={form.costCenterId || "all"}
                onChange={(value) =>
                  setForm({ ...form, costCenterId: value === "all" ? "" : value })
                }
                all="Selecionar centro"
                items={centers
                  .filter((center) => center.active)
                  .map((center) => [center.id, center.name])}
              />
            </Field>
            <Field label="Valor mensal">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </Field>
            <Field label="Frequencia">
              <Select
                value={form.frequency}
                onValueChange={(value) =>
                  setForm({ ...form, frequency: value as FinancialRecurringFrequency })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Mensal</SelectItem>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                  <SelectItem value="YEARLY">Anual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Dia vencimento">
              <Input
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(event) => setForm({ ...form, dueDay: event.target.value })}
              />
            </Field>
            <Field label="Mes inicial">
              <Input
                type="month"
                value={form.startMonth}
                onChange={(event) => setForm({ ...form, startMonth: event.target.value })}
              />
            </Field>
            <Field label="Mes final">
              <Input
                type="month"
                value={form.endMonth}
                onChange={(event) => setForm({ ...form, endMonth: event.target.value })}
              />
            </Field>
            <Field label="Geracao">
              <Select
                value={form.autoPost}
                onValueChange={(value) => setForm({ ...form, autoPost: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Postar automaticamente</SelectItem>
                  <SelectItem value="false">Gerar rascunho</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Observacoes" className="sm:col-span-2">
              <Textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={
                saving ||
                !form.name ||
                !form.chartAccountId ||
                !form.costCenterId ||
                Number(form.amount) <= 0
              }
              onClick={() => void submit()}
            >
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              Salvar recorrencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const payrollStatusLabel: Record<PayrollEntryStatus, string> = {
  draft: "Rascunho",
  calculated: "Calculada",
  approved: "Aprovada",
  posted: "Postada",
  paid: "Paga",
  voided: "Cancelada",
};

const payrollItemLabel: Record<PayrollItemType, string> = {
  SALARY_BASE: "Salario base",
  COMMISSION: "Comissao",
  OVERTIME: "Hora extra",
  DAILY_ALLOWANCE: "Diaria",
  BONUS: "Bonificacao",
  ADDITIONAL: "Adicional",
  BENEFIT: "Beneficio",
  OTHER_EARNING: "Outro provento",
  ADVANCE: "Adiantamento",
  DISCOUNT: "Desconto",
  OTHER_DEDUCTION: "Outra deducao",
};

function nextPayrollDueDate(month: string, preferredDay = 5) {
  const [year, rawMonth] = month.split("-").map(Number);
  const lastDay = new Date(year, rawMonth, 0).getDate();
  const day = Math.min(Math.max(preferredDay || 5, 1), lastDay);
  const dateValue = new Date(year, rawMonth - 1, day, 12);
  return dateValue.toISOString().slice(0, 10);
}

function emptyEmployeeForm(access: FinancialAccess, chart: ChartAccount[], centers: CostCenter[]) {
  return {
    id: "",
    displayName: "",
    driverId: "",
    jobTitle: "",
    baseSalary: "",
    paymentDate: nextPayrollDueDate(currentCompetenceMonth()),
    defaultCostCenterId:
      centers.find((center) => center.code === "OPERACAO")?.id ||
      centers.find((center) => center.active)?.id ||
      "",
    defaultChartAccountId:
      chart.find((account) => account.code === "5.03")?.id ||
      chart.find(
        (account) => account.active && account.isPostable && account.accountType === "expense",
      )?.id ||
      "",
    defaultPayDay: "5",
    admissionDate: "",
    active: "true",
    notes: "",
    workspaceId: access.workspaceId,
  };
}

export function FinancialPayrollPage() {
  return (
    <FinancialBoundary>{(access) => <FinancialPayrollContent access={access} />}</FinancialBoundary>
  );
}

function FinancialPayrollContent({ access }: { access: FinancialAccess }) {
  const [employees, setEmployees] = useState<EmployeeFinancialProfile[]>([]);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [chart, setChart] = useState<ChartAccount[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [competence, setCompetence] = useState(currentCompetenceMonth());
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [centerFilter, setCenterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [detail, setDetail] = useState<PayrollEntry | null>(null);
  const [itemForm, setItemForm] = useState({
    itemType: "COMMISSION" as PayrollItemType,
    description: "",
    amount: "",
    employeeAdvanceId: "",
  });
  const [employeeForm, setEmployeeForm] = useState(() => emptyEmployeeForm(access, [], []));
  const [saving, setSaving] = useState(false);
  const { drivers } = useFleet();
  const canView = hasFinancialPermission(access, "financial.payroll.view");
  const canManage = hasFinancialPermission(access, "financial.payroll.manage");
  const canApprove = hasFinancialPermission(access, "financial.payroll.approve");
  const canPost = hasFinancialPermission(access, "financial.payroll.post");
  const canVoid = hasFinancialPermission(access, "financial.payroll.void");

  const load = useCallback(async () => {
    const [nextEmployees, nextEntries, nextChart, nextCenters] = await Promise.all([
      listEmployeeFinancialProfiles(),
      listPayrollEntries(),
      listFinancialChart(access.tenantId),
      listFinancialCostCenters(access.workspaceId),
    ]);
    setEmployees(nextEmployees);
    setEntries(nextEntries);
    setChart(nextChart);
    setCenters(nextCenters);
  }, [access.tenantId, access.workspaceId]);

  useEffect(() => {
    if (canView) load().catch(() => toast.error("Nao foi possivel carregar os salarios."));
  }, [canView, load]);

  if (!canView) {
    return (
      <div className="financial-shell space-y-4">
        <PageHeader title="Salarios" subtitle="Salarios cadastrados e enviados ao financeiro" />
        <FinancialNav />
        <section className="premium-card mx-3 p-8 text-center md:mx-0">
          <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h2 className="text-lg font-bold">Acesso restrito</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Solicite a permissao financial.payroll.view ao owner.
          </p>
        </section>
      </div>
    );
  }

  const filtered = entries.filter((entry) => {
    const job = entry.jobTitleSnapshot || "";
    return (
      entry.competenceMonth.slice(0, 7) === competence &&
      (employeeFilter === "all" || entry.employeeProfileId === employeeFilter) &&
      (roleFilter === "all" || job === roleFilter) &&
      (centerFilter === "all" || entry.costCenterId === centerFilter) &&
      (statusFilter === "all" || entry.status === statusFilter)
    );
  });
  const gross = filtered.reduce((sum, entry) => sum + entry.grossAmount, 0);
  const deductions = filtered.reduce((sum, entry) => sum + entry.deductionAmount, 0);
  const net = filtered.reduce((sum, entry) => sum + entry.netAmount, 0);
  const paid = filtered
    .filter((entry) => entry.status === "paid")
    .reduce((sum, entry) => sum + entry.netAmount, 0);
  const payable = filtered
    .filter((entry) => !["paid", "voided"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.netAmount, 0);
  const roles = Array.from(new Set(employees.map((employee) => employee.jobTitle).filter(Boolean)));

  const openEmployee = (employee?: EmployeeFinancialProfile) => {
    if (employee) {
      setEmployeeForm({
        id: employee.id,
        workspaceId: access.workspaceId,
        displayName: employee.displayName,
        driverId: employee.driverId || "",
        jobTitle: employee.jobTitle || "",
        baseSalary: String(employee.baseSalary),
        paymentDate: nextPayrollDueDate(currentCompetenceMonth(), employee.defaultPayDay),
        defaultCostCenterId: employee.defaultCostCenterId,
        defaultChartAccountId: employee.defaultChartAccountId,
        defaultPayDay: String(employee.defaultPayDay),
        admissionDate: employee.admissionDate || "",
        active: String(employee.active),
        notes: employee.notes || "",
      });
    } else {
      setEmployeeForm(emptyEmployeeForm(access, chart, centers));
    }
    setEmployeeOpen(true);
  };

  const saveEmployee = async () => {
    setSaving(true);
    try {
      const paymentDate = employeeForm.paymentDate || nextPayrollDueDate(currentCompetenceMonth());
      const payDay = Number(paymentDate.slice(8, 10));
      const employeeProfileId = await saveEmployeeFinancialProfile({
        id: employeeForm.id || undefined,
        workspaceId: access.workspaceId,
        displayName: employeeForm.displayName,
        driverId: employeeForm.driverId || undefined,
        jobTitle: employeeForm.jobTitle || undefined,
        baseSalary: Number(employeeForm.baseSalary),
        defaultCostCenterId: employeeForm.defaultCostCenterId,
        defaultChartAccountId: employeeForm.defaultChartAccountId,
        defaultPayDay: payDay,
        admissionDate: employeeForm.admissionDate || undefined,
        active: employeeForm.active === "true",
        notes: employeeForm.notes || undefined,
      });
      if (!employeeForm.id) {
        const payrollEntryId = await createPayrollEntry({
          workspaceId: access.workspaceId,
          employeeProfileId,
          competenceMonth: normalizeMonth(paymentDate.slice(0, 7)),
          dueDate: paymentDate,
        });
        await calculatePayrollEntry(payrollEntryId);
        await approvePayrollEntry(payrollEntryId);
        await postPayrollEntry(payrollEntryId);
      }
      toast.success(
        employeeForm.id
          ? "Funcionario salvo."
          : "Funcionario salvo e salario enviado para o financeiro.",
      );
      setEmployeeOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar funcionario.");
    } finally {
      setSaving(false);
    }
  };

  const runEntryAction = async (
    entry: PayrollEntry,
    action: "calculate" | "approve" | "post" | "void",
  ) => {
    try {
      if (action === "calculate") await calculatePayrollEntry(entry.id);
      if (action === "approve") await approvePayrollEntry(entry.id);
      if (action === "post") await postPayrollEntry(entry.id);
      if (action === "void") {
        const reason = window.prompt("Motivo do cancelamento:");
        if (!reason) return;
        await voidPayrollEntry(entry.id, reason);
      }
      toast.success("Salario atualizado.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na acao do salario.");
    }
  };

  const addItem = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await savePayrollItem({
        payrollEntryId: detail.id,
        itemType: itemForm.itemType,
        description: itemForm.description || payrollItemLabel[itemForm.itemType],
        amount: Number(itemForm.amount),
        employeeAdvanceId: itemForm.employeeAdvanceId || undefined,
      });
      setItemForm({ itemType: "COMMISSION", description: "", amount: "", employeeAdvanceId: "" });
      await load();
      const nextDetail =
        (await listPayrollEntries()).find((entry) => entry.id === detail.id) ?? null;
      setDetail(nextDetail);
      toast.success("Item incluido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao incluir item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="financial-shell space-y-4">
      <PageHeader
        title="Salarios"
        subtitle="Salarios cadastrados e enviados ao financeiro"
        actions={
          canManage ? (
            <Button onClick={() => openEmployee()}>
              <Plus className="size-4" />
              Novo funcionario
            </Button>
          ) : undefined
        }
      />
      <FinancialNav />

      <div className="grid grid-cols-2 gap-3 px-3 lg:grid-cols-5 md:px-0">
        <Stat label="Salarios brutos" value={gross} icon={ReceiptText} />
        <Stat label="Descontos" value={deductions} icon={ArrowUpRight} tone="danger" />
        <Stat label="Salarios liquidos" value={net} icon={CircleDollarSign} tone="success" />
        <Stat label="Pago" value={paid} icon={Banknote} tone="success" />
        <Stat label="A pagar" value={payable} icon={WalletCards} />
      </div>

      <section className="financial-filter-bar mx-3 p-4 md:mx-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            type="month"
            value={competence}
            onChange={(event) => setCompetence(event.target.value)}
          />
          <SimpleSelect
            value={employeeFilter}
            onChange={setEmployeeFilter}
            all="Todos os funcionarios"
            items={employees.map((employee) => [employee.id, employee.displayName])}
          />
          <SimpleSelect
            value={roleFilter}
            onChange={setRoleFilter}
            all="Todas as funcoes"
            items={roles.map((role) => [role || "", role || "Sem funcao"])}
          />
          <SimpleSelect
            value={centerFilter}
            onChange={setCenterFilter}
            all="Todos os centros"
            items={centers.map((center) => [center.id, center.name])}
          />
          <SimpleSelect
            value={statusFilter}
            onChange={setStatusFilter}
            all="Todos os status"
            items={Object.entries(payrollStatusLabel)}
          />
        </div>
      </section>

      <section className="premium-card mx-3 overflow-hidden md:mx-0">
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 border-b border-border financial-table-head px-4 py-3 md:grid">
          <span>Funcionario</span>
          <span>Funcao</span>
          <span>Bruto</span>
          <span>Descontos</span>
          <span>Liquido</span>
          <span>Status</span>
          <span>Acao</span>
        </div>
        {filtered.length ? (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="financial-row grid gap-3 border-b border-border p-4 last:border-0 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <div className="text-sm font-extrabold">{entry.employeeNameSnapshot}</div>
                <div className="text-xs text-muted-foreground">
                  Vence {date.format(new Date(`${entry.dueDate}T12:00:00`))}
                </div>
              </div>
              <div className="text-sm">{entry.jobTitleSnapshot || "Sem funcao"}</div>
              <strong className="text-sm">{money.format(entry.grossAmount)}</strong>
              <strong className="text-sm text-destructive">
                {money.format(entry.deductionAmount)}
              </strong>
              <strong className="text-sm text-primary">{money.format(entry.netAmount)}</strong>
              <div>
                <Badge variant={entry.status === "voided" ? "destructive" : "outline"}>
                  {payrollStatusLabel[entry.status]}
                </Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" aria-label="Acoes do salario">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDetail(entry)}>
                    <ReceiptText /> Abrir
                  </DropdownMenuItem>
                  {canManage && ["draft", "calculated"].includes(entry.status) && (
                    <DropdownMenuItem onSelect={() => void runEntryAction(entry, "calculate")}>
                      <RefreshCw /> Calcular
                    </DropdownMenuItem>
                  )}
                  {canApprove && entry.status === "calculated" && (
                    <DropdownMenuItem onSelect={() => void runEntryAction(entry, "approve")}>
                      <ShieldAlert /> Aprovar
                    </DropdownMenuItem>
                  )}
                  {canPost && entry.status === "approved" && (
                    <DropdownMenuItem onSelect={() => void runEntryAction(entry, "post")}>
                      <ArrowUpRight /> Postar
                    </DropdownMenuItem>
                  )}
                  {entry.financialDocumentId && (
                    <DropdownMenuItem asChild>
                      <Link to="/financeiro/pagar">
                        <WalletCards /> Ver titulo
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canVoid && !["paid", "voided"].includes(entry.status) && (
                    <DropdownMenuItem onSelect={() => void runEntryAction(entry, "void")}>
                      <RotateCcw /> Cancelar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum salario nesta competencia.
          </div>
        )}
      </section>

      <Dialog open={employeeOpen} onOpenChange={setEmployeeOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {employeeForm.id ? "Editar funcionario" : "Funcionario financeiro"}
            </DialogTitle>
            <DialogDescription>
              Vincule motorista quando existir ou cadastre uma referencia administrativa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2">
              <Input
                value={employeeForm.displayName}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, displayName: event.target.value })
                }
              />
            </Field>
            <Field label="Motorista">
              <SimpleSelect
                value={employeeForm.driverId || "all"}
                onChange={(value) => {
                  const driver = drivers.find((item) => item.id === value);
                  setEmployeeForm({
                    ...employeeForm,
                    driverId: value === "all" ? "" : value,
                    displayName:
                      value !== "all" && driver && !employeeForm.displayName
                        ? driver.name
                        : employeeForm.displayName,
                  });
                }}
                all="Sem motorista"
                items={drivers.map((driver) => [driver.id, driver.name])}
              />
            </Field>
            <Field label="Funcao">
              <Input
                value={employeeForm.jobTitle}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, jobTitle: event.target.value })
                }
              />
            </Field>
            <Field label="Valor do salario">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={employeeForm.baseSalary}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, baseSalary: event.target.value })
                }
              />
            </Field>
            <Field label="Data de pagamento">
              <Input
                type="date"
                value={employeeForm.paymentDate}
                onChange={(event) =>
                  setEmployeeForm({
                    ...employeeForm,
                    paymentDate: event.target.value,
                    defaultPayDay: event.target.value ? event.target.value.slice(8, 10) : "",
                  })
                }
              />
            </Field>
            <Field label="Conta contabil">
              <SimpleSelect
                value={employeeForm.defaultChartAccountId || "all"}
                onChange={(value) =>
                  setEmployeeForm({
                    ...employeeForm,
                    defaultChartAccountId: value === "all" ? "" : value,
                  })
                }
                all="Selecionar conta"
                items={chart
                  .filter(
                    (account) =>
                      account.active && account.isPostable && account.accountType === "expense",
                  )
                  .map((account) => [account.id, `${account.code} - ${account.name}`])}
              />
            </Field>
            <Field label="Apropriação">
              <SimpleSelect
                value={employeeForm.defaultCostCenterId || "all"}
                onChange={(value) =>
                  setEmployeeForm({
                    ...employeeForm,
                    defaultCostCenterId: value === "all" ? "" : value,
                  })
                }
                all="Selecionar centro"
                items={centers
                  .filter((center) => center.active)
                  .map((center) => [center.id, center.name])}
              />
            </Field>
            <Field label="Admissao">
              <Input
                type="date"
                value={employeeForm.admissionDate}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, admissionDate: event.target.value })
                }
              />
            </Field>
            <Field label="Situacao">
              <Select
                value={employeeForm.active}
                onValueChange={(value) => setEmployeeForm({ ...employeeForm, active: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Observacoes" className="sm:col-span-2">
              <Textarea
                value={employeeForm.notes}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, notes: event.target.value })
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={
                saving ||
                !employeeForm.displayName ||
                Number(employeeForm.baseSalary) <= 0 ||
                !employeeForm.paymentDate ||
                !employeeForm.defaultChartAccountId ||
                !employeeForm.defaultCostCenterId
              }
              onClick={() => void saveEmployee()}
            >
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {employeeForm.id ? "Salvar funcionario" : "Salvar e enviar ao DRE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.employeeNameSnapshot}</DialogTitle>
                <DialogDescription>
                  {detail.competenceMonth.slice(0, 7)} - {payrollStatusLabel[detail.status]}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Bruto" value={detail.grossAmount} icon={ReceiptText} />
                <Stat
                  label="Descontos"
                  value={detail.deductionAmount}
                  icon={ArrowUpRight}
                  tone="danger"
                />
                <Stat
                  label="Liquido"
                  value={detail.netAmount}
                  icon={CircleDollarSign}
                  tone="success"
                />
              </div>
              <section className="rounded-lg border border-border">
                {detail.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border p-3 last:border-0"
                  >
                    <Badge variant={item.direction === "deduction" ? "destructive" : "outline"}>
                      {payrollItemLabel[item.itemType]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{item.description}</div>
                    </div>
                    <strong className="text-sm">{money.format(item.amount)}</strong>
                    {canManage &&
                      ["draft", "calculated"].includes(detail.status) &&
                      item.itemType !== "SALARY_BASE" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Remover"
                          onClick={async () => {
                            await deletePayrollItem(item.id);
                            await load();
                            const nextDetail =
                              (await listPayrollEntries()).find(
                                (entry) => entry.id === detail.id,
                              ) ?? null;
                            setDetail(nextDetail);
                          }}
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                  </div>
                ))}
              </section>
              {canManage && ["draft", "calculated"].includes(detail.status) && (
                <section className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[180px_1fr_140px_auto]">
                  <SimpleSelect
                    value={itemForm.itemType}
                    onChange={(value) =>
                      setItemForm({
                        ...itemForm,
                        itemType: value as PayrollItemType,
                        description: payrollItemLabel[value as PayrollItemType],
                      })
                    }
                    all="Tipo"
                    items={Object.entries(payrollItemLabel).filter(
                      ([value]) => value !== "ADVANCE",
                    )}
                  />
                  <Input
                    value={itemForm.description}
                    onChange={(event) =>
                      setItemForm({ ...itemForm, description: event.target.value })
                    }
                    placeholder="Descricao"
                  />
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={itemForm.amount}
                    onChange={(event) => setItemForm({ ...itemForm, amount: event.target.value })}
                    placeholder="Valor"
                  />
                  <Button
                    disabled={saving || Number(itemForm.amount) <= 0}
                    onClick={() => void addItem()}
                  >
                    Adicionar
                  </Button>
                </section>
              )}
              <DialogFooter>
                {canManage && ["draft", "calculated"].includes(detail.status) && (
                  <Button
                    variant="outline"
                    onClick={() => void runEntryAction(detail, "calculate")}
                  >
                    Calcular
                  </Button>
                )}
                {canApprove && detail.status === "calculated" && (
                  <Button variant="outline" onClick={() => void runEntryAction(detail, "approve")}>
                    Aprovar
                  </Button>
                )}
                {canPost && detail.status === "approved" && (
                  <Button onClick={() => void runEntryAction(detail, "post")}>Postar</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Trash2Icon() {
  return <span className="text-sm font-black">x</span>;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function FinancialAccountsPage() {
  return <FinancialBoundary>{(access) => <AccountsContent access={access} />}</FinancialBoundary>;
}
function AccountsContent({ access }: { access: FinancialAccess }) {
  const [items, setItems] = useState<FinancialAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "checking",
    bank: "",
    agency: "",
    number: "",
    balance: "0",
    date: today(),
    active: "true",
  });
  const openNewAccount = () => {
    setForm({
      id: "",
      name: "",
      type: "checking",
      bank: "",
      agency: "",
      number: "",
      balance: "0",
      date: today(),
      active: "true",
    });
    setOpen(true);
  };
  const openAccount = (account: FinancialAccount) => {
    setForm({
      id: account.id,
      name: account.name,
      type: account.accountType,
      bank: account.bankName || "",
      agency: account.agency || "",
      number: account.accountNumber || "",
      balance: String(account.openingBalance),
      date: account.openingBalanceDate,
      active: String(account.active),
    });
    setOpen(true);
  };
  const load = () => listFinancialAccounts().then(setItems);
  useEffect(() => {
    load().catch(() => toast.error("Falha ao carregar contas."));
  }, []);
  const can = hasFinancialPermission(access, "financial.manage_accounts");
  return (
    <div className="financial-shell space-y-4">
      <PageHeader
        title="Bancos e Caixas"
        subtitle="Saldos calculados por movimentações"
        actions={
          can ? (
            <Button onClick={openNewAccount}>
              <Plus className="size-4" />
              Nova conta
            </Button>
          ) : undefined
        }
      />
      <FinancialNav />
      <div className="grid gap-3 px-3 sm:grid-cols-2 xl:grid-cols-3 md:px-0">
        {items.map((a) => (
          <div key={a.id} className="premium-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-extrabold">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.bankName || "Conta interna"} {a.accountNumber && `· ${a.accountNumber}`}
                </div>
              </div>
              <Landmark className="size-5 text-primary" />
            </div>
            <div className="mt-5 text-[10px] font-bold uppercase text-muted-foreground">
              Saldo atual
            </div>
            <div className="mt-1 text-2xl font-black">{money.format(a.currentBalance)}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Saldo inicial: {money.format(a.openingBalance)} em{" "}
              {date.format(new Date(`${a.openingBalanceDate}T12:00:00`))}
            </div>
            {can && (
              <Button className="mt-4" size="sm" variant="outline" onClick={() => openAccount(a)}>
                <Pencil className="size-4" />
                Editar
              </Button>
            )}
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar conta financeira" : "Nova conta financeira"}
            </DialogTitle>
            <DialogDescription>
              O saldo futuro será calculado pelas baixas registradas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Tipo">
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Conta corrente</SelectItem>
                  <SelectItem value="savings">Poupança</SelectItem>
                  <SelectItem value="cash">Caixa</SelectItem>
                  <SelectItem value="wallet">Carteira</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Banco">
              <Input
                value={form.bank}
                onChange={(e) => setForm({ ...form, bank: e.target.value })}
              />
            </Field>
            <Field label="Agência">
              <Input
                value={form.agency}
                onChange={(e) => setForm({ ...form, agency: e.target.value })}
              />
            </Field>
            <Field label="Conta">
              <Input
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
            </Field>
            <Field label="Saldo inicial">
              <Input
                type="number"
                step="0.01"
                value={form.balance}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
              />
            </Field>
            <Field label="Data do saldo">
              <Input
                type="date"
                value={form.date}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Situação">
              <Select
                value={form.active}
                onValueChange={(value) => setForm({ ...form, active: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativa</SelectItem>
                  <SelectItem value="false">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={!form.name}
              onClick={async () => {
                try {
                  await saveFinancialAccount({
                    id: form.id,
                    workspaceId: access.workspaceId,
                    name: form.name,
                    accountType: form.type,
                    bankName: form.bank,
                    agency: form.agency,
                    accountNumber: form.number,
                    openingBalance: Number(form.balance),
                    openingBalanceDate: form.date,
                    active: form.active === "true",
                  });
                  toast.success(form.id ? "Conta atualizada." : "Conta criada.");
                  setOpen(false);
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
                }
              }}
            >
              Salvar conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FinancialChartPage() {
  return (
    <FinancialBoundary>
      {(access) => <StructurePage access={access} kind="chart" />}
    </FinancialBoundary>
  );
}
export function FinancialCostCentersPage() {
  return (
    <FinancialBoundary>
      {(access) => <StructurePage access={access} kind="centers" />}
    </FinancialBoundary>
  );
}
function StructurePage({ access, kind }: { access: FinancialAccess; kind: "chart" | "centers" }) {
  const [chart, setChart] = useState<ChartAccount[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    code: "",
    name: "",
    parent: "",
    type: "expense",
    balance: "debit",
    dre: "operating_expense",
    active: "true",
  });
  const openNewStructure = () => {
    setForm({
      id: "",
      code: "",
      name: "",
      parent: "",
      type: "expense",
      balance: "debit",
      dre: "operating_expense",
      active: "true",
    });
    setOpen(true);
  };
  const openStructure = (item: ChartAccount | CostCenter) => {
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      parent: item.parentId || "",
      type: "accountType" in item ? item.accountType : "expense",
      balance: "normalBalance" in item ? item.normalBalance : "debit",
      dre: "dreGroup" in item && item.dreGroup ? item.dreGroup : "operating_expense",
      active: String(item.active),
    });
    setOpen(true);
  };
  const load = useCallback(async () => {
    if (kind === "chart") setChart(await listFinancialChart(access.tenantId));
    else setCenters(await listFinancialCostCenters(access.workspaceId));
  }, [access.tenantId, access.workspaceId, kind]);
  useEffect(() => {
    load().catch(() => toast.error("Falha ao carregar estrutura."));
  }, [load]);
  const can = hasFinancialPermission(
    access,
    kind === "chart" ? "financial.manage_chart" : "financial.manage_cost_centers",
  );
  const items = kind === "chart" ? chart : centers;
  const itemLevel = (item: ChartAccount | CostCenter) =>
    Math.max(0, item.code.split(".").length - 1);
  return (
    <div className="financial-shell space-y-4">
      <PageHeader
        title={kind === "chart" ? "Gerenciais" : "Apropriações"}
        subtitle={
          kind === "chart"
            ? "Categorias hierárquicas e classificação gerencial"
            : "Estrutura organizacional para alocações"
        }
        actions={
          can ? (
            <Button onClick={openNewStructure}>
              <Plus className="size-4" />
              {kind === "chart" ? "Nova conta" : "Novo centro"}
            </Button>
          ) : undefined
        }
      />
      <FinancialNav />
      <section className="premium-card mx-3 overflow-hidden md:mx-0">
        {!items.length && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma estrutura cadastrada para este workspace.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
            style={{ paddingLeft: `${16 + itemLevel(item) * 20}px` }}
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              {kind === "chart" ? <Tags className="size-4" /> : <Building2 className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                  {item.code}
                </span>
                <span>{item.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {item.parentId ? "Nível vinculado" : "Conta raiz"} ·{" "}
                {item.active ? "Ativo" : "Inativo"}
                {kind === "chart" && "dreGroup" in item && item.dreGroup
                  ? ` · ${item.dreGroup}`
                  : ""}
              </div>
            </div>
            {item.isSystem && <Badge variant="outline">Estrutural</Badge>}
            {can && !item.isSystem ? (
              <Button
                size="icon"
                variant="ghost"
                title="Editar"
                onClick={() => openStructure(item)}
              >
                <Pencil className="size-4" />
              </Button>
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? "Editar estrutura"
                : kind === "chart"
                  ? "Nova conta"
                  : "Nova apropriação"}
            </DialogTitle>
            <DialogDescription>
              Crie um item personalizado sem alterar as estruturas obrigatórias.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Nome">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Pai">
              <SimpleSelect
                value={form.parent || "all"}
                onChange={(v) => setForm({ ...form, parent: v === "all" ? "" : v })}
                all="Sem pai"
                items={items.map((i) => [i.id, `${i.code} · ${i.name}`])}
              />
            </Field>
            {kind === "chart" && (
              <>
                <Field label="Tipo">
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Receita</SelectItem>
                      <SelectItem value="expense">Despesa</SelectItem>
                      <SelectItem value="asset">Ativo</SelectItem>
                      <SelectItem value="liability">Passivo</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Classificação DRE">
                  <SimpleSelect
                    value={form.dre}
                    onChange={(v) => setForm({ ...form, dre: v })}
                    all="Sem classificação"
                    items={[
                      ["gross_revenue", "Receita bruta"],
                      ["revenue_deduction", "Deduções"],
                      ["variable_cost", "Custos variáveis"],
                      ["operating_expense", "Despesas operacionais"],
                      ["depreciation_amortization", "Depreciação"],
                      ["financial_result", "Resultado financeiro"],
                      ["income_tax", "Impostos"],
                      ["other_result", "Outros resultados"],
                    ]}
                  />
                </Field>
              </>
            )}
            <Field label="Situação">
              <Select
                value={form.active}
                onValueChange={(value) => setForm({ ...form, active: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={!form.code || !form.name}
              onClick={async () => {
                try {
                  if (kind === "chart")
                    await saveChartAccount({
                      id: form.id,
                      workspaceId: access.workspaceId,
                      code: form.code,
                      name: form.name,
                      parentId: form.parent,
                      accountType: form.type,
                      normalBalance: form.type === "revenue" ? "credit" : "debit",
                      dreGroup: form.dre,
                      active: form.active === "true",
                    });
                  else
                    await saveCostCenter({
                      id: form.id,
                      workspaceId: access.workspaceId,
                      code: form.code,
                      name: form.name,
                      parentId: form.parent,
                      active: form.active === "true",
                    });
                  toast.success("Estrutura atualizada.");
                  setOpen(false);
                  await load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
