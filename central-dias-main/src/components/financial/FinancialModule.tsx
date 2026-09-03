import { Link, useLocation } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  LoaderCircle,
  MoreVertical,
  Plus,
  Pencil,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Tags,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
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
  hasFinancialPermission,
  listFinancialAccounts,
  listFinancialChart,
  listFinancialCostCenters,
  listFinancialDocuments,
  listFinancialPartners,
  getFinancialIntegrationSettings,
  listFinancialIntegrationJobs,
  processFinancialIntegrations,
  reverseSettlement,
  saveBusinessPartner,
  saveChartAccount,
  saveCostCenter,
  saveFinancialAccount,
  saveFinancialDocument,
  saveFinancialIntegrationSettings,
  settleInstallment,
  voidFinancialDocument,
} from "@/lib/financial/phase2";
import type {
  BusinessPartner,
  CanonicalFreight,
  ChartAccount,
  CostCenter,
  FinancialAccess,
  FinancialAccount,
  FinancialDocumentDetails,
  FinancialDocumentDirection,
  FinancialDocumentInput,
  FinancialInstallment,
  FinancialIntegrationJob,
  FinancialIntegrationSettings,
  FinancialSettlement,
} from "@/lib/financial/types";
import { useFleet } from "@/lib/store";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

const financeNav = [
  ["/financeiro", "Visão Geral", BadgeDollarSign],
  ["/financeiro/receber", "Contas a Receber", ArrowDownLeft],
  ["/financeiro/pagar", "Contas a Pagar", ArrowUpRight],
  ["/financeiro/contas", "Bancos e Caixas", Landmark],
  ["/financeiro/plano-contas", "Plano de Contas", Tags],
  ["/financeiro/centros-custo", "Centros de Custo", Building2],
  ["/financeiro/integracoes", "Integrações", RefreshCw],
] as const;

function FinancialNav() {
  const location = useLocation();
  return (
    <nav className="mx-3 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 md:mx-0">
      {financeNav.map(([to, label, Icon]) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-bold transition",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
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
}: {
  label: string;
  value: number | string;
  icon: typeof Banknote;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="premium-card min-w-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
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
      </div>
      <div
        className={cn(
          "mt-2 truncate text-xl font-black",
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
  return <FinancialBoundary>{() => <OverviewContent />}</FinancialBoundary>;
}

function OverviewContent() {
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
    <div className="space-y-3 pb-6">
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

type TitleFilters = {
  search: string;
  status: string;
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
  partner: "all",
  start: monthStart(),
  end: today(),
  category: "all",
  center: "all",
  min: "",
  max: "",
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
  const [filters, setFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<FinancialDocumentDetails | null>(null);
  const [settleTarget, setSettleTarget] = useState<{
    document: FinancialDocumentDetails;
    installment: FinancialInstallment;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const { vehicles, products } = useFleet();
  const load = useCallback(async () => {
    const [d, p, a, c, cc, f] = await Promise.all([
      listFinancialDocuments(direction),
      listFinancialPartners(),
      listFinancialAccounts(),
      listFinancialChart(),
      listFinancialCostCenters(),
      listCanonicalFreights(),
    ]);
    setDocuments(d);
    setPartners(p);
    setAccounts(a);
    setChart(c);
    setCenters(cc);
    setFreights(f);
  }, [direction]);
  useEffect(() => {
    load().catch(() => toast.error("Não foi possível carregar os títulos."));
  }, [load]);
  const allowedPartners = partners.filter(
    (p) =>
      p.roles.includes(receiving ? "customer" : "supplier") ||
      p.roles.includes(receiving ? "sender" : "recipient"),
  );
  const filtered = useMemo(
    () =>
      documents.filter((d) => {
        const due = d.installments[0]?.dueDate || "";
        const balance = d.installments.reduce((s, i) => s + i.balance, 0);
        return (
          (!filters.search ||
            `${d.description} ${d.documentNumber || ""} ${d.partnerName || ""}`
              .toLowerCase()
              .includes(filters.search.toLowerCase())) &&
          (filters.status === "all" || visualStatus(d) === filters.status) &&
          (filters.partner === "all" || d.partnerId === filters.partner) &&
          (filters.category === "all" || d.chartAccountId === filters.category) &&
          (filters.center === "all" || d.costCenterId === filters.center) &&
          (!filters.start || due >= filters.start) &&
          (!filters.end || due <= filters.end) &&
          (!filters.min || balance >= Number(filters.min)) &&
          (!filters.max || balance <= Number(filters.max))
        );
      }),
    [documents, filters],
  );
  const openBalance = documents
    .filter((d) => !["draft", "voided", "settled"].includes(d.status))
    .reduce((s, d) => s + d.installments.reduce((a, i) => a + i.balance, 0), 0);
  const overdue = documents
    .flatMap((d) => d.installments)
    .filter((i) => i.balance > 0 && i.dueDate < today())
    .reduce((s, i) => s + i.balance, 0);
  const settledPeriod = documents
    .flatMap(effectiveSettlements)
    .filter((s) => s.settledOn >= filters.start && s.settledOn <= filters.end)
    .reduce((s, i) => s + i.netAmount, 0);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const date7 = in7.toISOString().slice(0, 10);
  const upcoming = documents
    .flatMap((d) => d.installments)
    .filter((i) => i.balance > 0 && i.dueDate >= today() && i.dueDate <= date7)
    .reduce((s, i) => s + i.balance, 0);
  const canCreate = hasFinancialPermission(access, "financial.create");
  const canSettle = hasFinancialPermission(
    access,
    receiving ? "financial.receive" : "financial.pay",
  );
  return (
    <div className="space-y-3 pb-6">
      <PageHeader
        title={receiving ? "Contas a Receber" : "Contas a Pagar"}
        subtitle={
          receiving ? "Clientes, parcelas e recebimentos" : "Fornecedores, parcelas e pagamentos"
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
      <div className="grid grid-cols-2 gap-3 px-3 lg:grid-cols-4 md:px-0">
        <Stat label={receiving ? "A receber" : "A pagar"} value={openBalance} icon={WalletCards} />
        <Stat label="Vencido" value={overdue} icon={CalendarClock} tone="danger" />
        <Stat
          label={receiving ? "Recebido no período" : "Pago no período"}
          value={settledPeriod}
          icon={CircleDollarSign}
          tone="success"
        />
        <Stat label="Próximos 7 dias" value={upcoming} icon={CalendarClock} />
      </div>
      <div className="hidden md:block">
        <FilterPanel
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
            <FilterPanel
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
      <TitleList
        documents={filtered}
        direction={direction}
        canSettle={canSettle}
        canReverse={hasFinancialPermission(access, "financial.reverse_settlement")}
        canEdit={hasFinancialPermission(access, "financial.edit_draft")}
        onEdit={(document) => {
          setEditingDocument(document);
          setFormOpen(true);
        }}
        onSettle={(document, installment) => setSettleTarget({ document, installment })}
        onReverse={async (settlement) => {
          const reason = window.prompt("Informe o motivo do estorno:");
          if (!reason) return;
          try {
            await reverseSettlement(settlement.id, reason);
            toast.success("Baixa estornada.");
            await load();
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
            await load();
          } catch {
            toast.error("Não foi possível cancelar o título.");
          }
        }}
      />
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
        products={products}
        saving={saving}
        document={editingDocument}
        onSave={async (input) => {
          setSaving(true);
          try {
            await saveFinancialDocument(input);
            toast.success("Título salvo com sucesso.");
            setFormOpen(false);
            setEditingDocument(null);
            await load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
          } finally {
            setSaving(false);
          }
        }}
        onPartnerCreated={load}
      />
      <SettlementDialog
        target={settleTarget}
        accounts={accounts.filter((a) => a.active)}
        saving={saving}
        actionLabel={receiving ? "Receber" : "Pagar"}
        onOpenChange={(open) => !open && setSettleTarget(null)}
        onSave={async (input) => {
          setSaving(true);
          try {
            await settleInstallment(input);
            toast.success(receiving ? "Recebimento registrado." : "Pagamento registrado.");
            setSettleTarget(null);
            await load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha na baixa.");
          } finally {
            setSaving(false);
          }
        }}
      />
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
        embedded ? "pt-4" : "premium-card mx-3 p-4 md:mx-0",
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
      <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto] gap-3 border-b border-border bg-muted/35 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground md:grid">
        <span>Título</span>
        <span>Parceiro</span>
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
        <div className="p-12 text-center text-sm text-muted-foreground">
          Nenhum título encontrado.
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
    <div className="relative grid gap-3 border-b border-border p-4 pr-16 last:border-0 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_auto] md:items-center md:pr-4">
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
      <div className="text-sm">
        <span className="md:hidden text-xs text-muted-foreground">Vencimento · </span>
        {installment ? date.format(new Date(`${installment.dueDate}T12:00:00`)) : "-"}
      </div>
      <div>
        <strong className="text-sm">{money.format(balance)}</strong>
        <div className="text-[11px] text-muted-foreground">de {money.format(d.originalAmount)}</div>
      </div>
      <div>
        <Badge
          variant={
            state === "overdue" ? "destructive" : state === "settled" ? "default" : "outline"
          }
        >
          {statusLabel(state, direction)}
        </Badge>
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
  products: Array<{ id: string; name: string }>;
  saving: boolean;
  document: FinancialDocumentDetails | null;
  onSave: (i: FinancialDocumentInput) => void;
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
    amount: "",
    dueDate: today(),
    installments: "1",
    chartAccountId: "",
    costCenterId: "",
    vehicleId: "",
    freightId: "",
    productId: "",
    notes: "",
    status: "posted",
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
        amount: String(document.originalAmount),
        dueDate: document.installments[0]?.dueDate || today(),
        installments: String(document.installments.length || 1),
        chartAccountId: document.chartAccountId || "",
        costCenterId: document.costCenterId || "",
        vehicleId: document.vehicleId || "",
        freightId: document.freightId || "",
        productId: document.productId || "",
        notes: document.notes || "",
        status: "draft",
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
      amount: "",
      dueDate: today(),
      installments: "1",
      chartAccountId: "",
      costCenterId: "",
      vehicleId: "",
      freightId: "",
      productId: "",
      notes: "",
      status: "posted",
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
            <Field label="Centro de custo">
              <SimpleSelect
                value={form.costCenterId || "all"}
                onChange={(v) => set("costCenterId", v === "all" ? "" : v)}
                all="Não alocado"
                items={centers.filter((c) => c.active).map((c) => [c.id, c.name])}
              />
            </Field>
            <Field label="Caminhão (opcional)">
              <SimpleSelect
                value={form.vehicleId || "all"}
                onChange={(v) => set("vehicleId", v === "all" ? "" : v)}
                all="Sem caminhão"
                items={vehicles.map((v) => [v.id, v.plate])}
              />
            </Field>
            <Field label="Frete (opcional)">
              <SimpleSelect
                value={form.freightId || "all"}
                onChange={(v) => set("freightId", v === "all" ? "" : v)}
                all="Sem frete"
                items={freights
                  .slice(0, 100)
                  .map(
                    (f) => [f.id, `${f.id.slice(0, 8)} · ${f.lifecycleStatus}`] as [string, string],
                  )}
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
                !form.description ||
                !form.amount ||
                !form.dueDate ||
                !customInstallmentsValid
              }
              onClick={() =>
                onSave({
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
                  chartAccountId: form.chartAccountId,
                  costCenterId: form.costCenterId,
                  vehicleId: form.vehicleId,
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
                })
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
  saving,
  actionLabel,
  onOpenChange,
  onSave,
}: {
  target: { document: FinancialDocumentDetails; installment: FinancialInstallment } | null;
  accounts: FinancialAccount[];
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
  });
  useEffect(() => {
    if (target) setForm((f) => ({ ...f, amount: String(target.installment.balance) }));
  }, [target]);
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
            disabled={saving || !target || !form.account || Number(form.amount) <= 0}
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
    <div className="space-y-3 pb-6">
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
    if (kind === "chart") setChart(await listFinancialChart());
    else setCenters(await listFinancialCostCenters());
  }, [kind]);
  useEffect(() => {
    load().catch(() => toast.error("Falha ao carregar estrutura."));
  }, [load]);
  const can = hasFinancialPermission(
    access,
    kind === "chart" ? "financial.manage_chart" : "financial.manage_cost_centers",
  );
  const items = kind === "chart" ? chart : centers;
  return (
    <div className="space-y-3 pb-6">
      <PageHeader
        title={kind === "chart" ? "Plano de Contas" : "Centros de Custo"}
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
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              {kind === "chart" ? <Tags className="size-4" /> : <Building2 className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold">
                {item.code} · {item.name}
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
                  : "Novo centro de custo"}
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

const integrationStatusLabel = {
  pending: "Pendente",
  processed: "Processado",
  failed: "Com erro",
  needs_review: "Revisão necessária",
} as const;

const integrationSourceLabel = {
  freight: "Frete concluído",
  fuel_record: "Abastecimento",
  freight_expense: "Despesa de frete",
} as const;

const integrationReasonLabel: Record<string, string> = {
  payment_terms_missing: "Condicao de pagamento nao definida",
  missing_workspace: "Workspace não identificado",
  missing_freight_value: "Valor do frete ausente",
  missing_customer: "Cliente não identificado",
  missing_vehicle: "Veículo não identificado",
  missing_supplier: "Fornecedor não identificado",
  unknown_category: "Categoria sem classificação segura",
  missing_chart_account: "Conta contábil não encontrada",
  missing_due_policy: "Política de vencimento não definida",
  invalid_amount: "Valor inválido",
};

export function FinancialIntegrationsPage() {
  return (
    <FinancialBoundary>
      {(access) => <FinancialIntegrationsContent access={access} />}
    </FinancialBoundary>
  );
}

function FinancialIntegrationsContent({ access }: { access: FinancialAccess }) {
  const [jobs, setJobs] = useState<FinancialIntegrationJob[]>([]);
  const [settings, setSettings] = useState<FinancialIntegrationSettings>({
    workspaceId: access.workspaceId,
    defaultReceivableDueDays: null,
    defaultPayableDueDays: null,
  });
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const canProcess = hasFinancialPermission(access, "financial.process_integrations");
  const canConfigure = hasFinancialPermission(access, "financial.settings.manage");

  const load = useCallback(async () => {
    const [nextJobs, nextSettings] = await Promise.all([
      listFinancialIntegrationJobs(),
      getFinancialIntegrationSettings(access.workspaceId),
    ]);
    setJobs(nextJobs);
    setSettings(nextSettings);
  }, [access.workspaceId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Não foi possível carregar as integrações financeiras."))
      .finally(() => setLoading(false));
  }, [load]);

  const process = async (jobId?: string) => {
    setProcessingId(jobId ?? "all");
    try {
      const result = await processFinancialIntegrations(jobId);
      toast.success(
        `${result.processed} processado(s), ${result.needsReview} para revisão e ${result.failed} com erro.`,
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao processar integrações.");
    } finally {
      setProcessingId(null);
    }
  };

  const counts = useMemo(
    () =>
      jobs.reduce((result, job) => ({ ...result, [job.status]: result[job.status] + 1 }), {
        pending: 0,
        processed: 0,
        failed: 0,
        needs_review: 0,
      }),
    [jobs],
  );

  return (
    <div className="space-y-3 pb-6">
      <PageHeader
        title="Integrações Financeiras"
        subtitle="Conciliação segura entre fatos operacionais e lançamentos"
        actions={
          canProcess ? (
            <Button onClick={() => void process()} disabled={processingId !== null}>
              <RefreshCw className={cn("size-4", processingId === "all" && "animate-spin")} />
              Processar pendências
            </Button>
          ) : undefined
        }
      />
      <FinancialNav />
      <div className="grid grid-cols-2 gap-3 px-3 lg:grid-cols-4 md:px-0">
        <Stat label="Pendentes" value={counts.pending} icon={CalendarClock} />
        <Stat label="Processados" value={counts.processed} icon={CircleDollarSign} tone="success" />
        <Stat label="Com erro" value={counts.failed} icon={ShieldAlert} tone="danger" />
        <Stat label="Para revisão" value={counts.needs_review} icon={Settings2} />
      </div>

      <section className="premium-card mx-3 p-4 md:mx-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-extrabold">Prazos padrão</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem prazo definido, novos lançamentos ficam em rascunho para revisão financeira.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[150px_150px_auto]">
            <Field label="Receber em dias">
              <Input
                type="number"
                min="0"
                disabled={!canConfigure}
                value={settings.defaultReceivableDueDays ?? ""}
                placeholder="Não definido"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    defaultReceivableDueDays:
                      event.target.value === "" ? null : Number(event.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Pagar em dias">
              <Input
                type="number"
                min="0"
                disabled={!canConfigure}
                value={settings.defaultPayableDueDays ?? ""}
                placeholder="Não definido"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    defaultPayableDueDays:
                      event.target.value === "" ? null : Number(event.target.value),
                  }))
                }
              />
            </Field>
            {canConfigure && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await saveFinancialIntegrationSettings(settings);
                    toast.success("Política de vencimento atualizada.");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Falha ao salvar política.",
                    );
                  }
                }}
              >
                Salvar política
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="premium-card mx-3 overflow-hidden md:mx-0">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Carregando integrações...
          </div>
        ) : jobs.length ? (
          jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col gap-3 border-b border-border p-4 last:border-0 sm:flex-row sm:items-center"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                {job.sourceType === "freight" ? (
                  <Truck className="size-4" />
                ) : job.sourceType === "fuel_record" ? (
                  <Fuel className="size-4" />
                ) : (
                  <ReceiptText className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{integrationSourceLabel[job.sourceType]}</strong>
                  <Badge variant={job.status === "failed" ? "destructive" : "outline"}>
                    {integrationStatusLabel[job.status]}
                  </Badge>
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {job.sourceId}
                </p>
                {(job.reviewReasons.length > 0 || job.lastError) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.reviewReasons
                      .map((reason) => integrationReasonLabel[reason] ?? reason)
                      .join(" · ") || "Falha no processamento. Consulte os registros técnicos."}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="text-xs text-muted-foreground">
                  {date.format(new Date(job.detectedAt))} · tentativa {job.attempts}/
                  {job.maxAttempts}
                </span>
                {canProcess && job.status !== "processed" && job.attempts < job.maxAttempts && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processingId !== null}
                    onClick={() => void process(job.id)}
                  >
                    <RefreshCw
                      className={cn("size-3.5", processingId === job.id && "animate-spin")}
                    />
                    Tentar novamente
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nenhum fato operacional aguardando integração.
          </p>
        )}
      </section>
    </div>
  );
}
