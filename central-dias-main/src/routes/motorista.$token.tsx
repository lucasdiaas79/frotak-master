import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Camera,
  CircleCheck,
  CirclePause,
  FileBadge,
  Fuel,
  LocateFixed,
  Lock,
  MapPinCheck,
  Navigation,
  Network,
  PackageCheck,
  Plus,
  Route as RouteIcon,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserCheck,
  Wallet,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import logoBranca from "@/assets/frotak-logo-branca.png";
import { DocStatePill, formatDay } from "@/components/shipper/DriverUi";
import { driverLinkAct, driverLinkLoad } from "@/lib/driverLink/api";
import { demoDriverLinkView } from "@/lib/driverLink/demo";
import {
  DRIVER_EXPENSE_LABELS,
  type DriverExpenseCategory,
  type DriverLinkAction,
  type DriverLinkView,
  type DriverStatusCode,
} from "@/lib/driverLink/types";
import type { DriverDocKind } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";

// Link do motorista: aberto pelo WhatsApp, sem app e sem senha. Uma pagina por viagem.

export const Route = createFileRoute("/motorista/$token")({
  head: () => ({
    meta: [
      { title: "Sua viagem · Frotak" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: DriverLinkPage,
});

type Tab = "viagem" | "abastecer" | "acerto" | "documentos";
const POSITION_EVERY_MS = 3 * 60_000;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function DriverLinkPage() {
  const { token } = Route.useParams();
  const demo = token === "demo";
  const [view, setView] = useState<DriverLinkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("viagem");
  const opened = useRef(false);

  const load = useCallback(async () => {
    if (demo) {
      setView((current) => current ?? demoDriverLinkView());
      return;
    }
    const result = await driverLinkLoad({ data: { token, opened: !opened.current } });
    opened.current = true;
    if (result.ok) {
      setView(result.view);
      setError(null);
    } else setError(result.error);
  }, [demo, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: DriverLinkAction, local?: (current: DriverLinkView) => DriverLinkView) => {
      if (demo) {
        if (local) setView((current) => (current ? local(current) : current));
        return true;
      }
      const result = await driverLinkAct({ data: { token, action } });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      if (action.type !== "posicao") toast.success(result.message);
      await load();
      return true;
    },
    [demo, token, load],
  );

  return (
    <div className="min-h-[100dvh] bg-background">
      <Toaster position="top-center" richColors />
      <header className="flex items-center justify-between bg-[#080A09] px-5 py-3.5 text-[#E4E6E5]">
        <img src={logoBranca} alt="Frotak" className="h-5 w-auto" />
        <span className="max-w-[60%] truncate text-[12px] text-[#9BA39F]">{view?.carrierName}</span>
      </header>
      <main className="mx-auto flex w-full max-w-[520px] flex-col gap-3 px-4 pb-10 pt-4">
        {error ? (
          <div className="premium-card mt-10 p-6 text-center">
            <Lock className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-3 text-[18px] font-bold">Link indisponível</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{error}</p>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Peça um link novo para a transportadora.
            </p>
          </div>
        ) : !view ? (
          <div className="space-y-3">
            <div className="premium-card h-20 animate-pulse" />
            <div className="premium-card h-56 animate-pulse" />
          </div>
        ) : (
          <>
            <div>
              <p className="label-tiny">
                Olá, {view.driverName} · {demo ? "demonstração" : "sem instalar nada"}
              </p>
              <h1 className="mt-1 text-[22px] font-semibold">
                {tab === "viagem"
                  ? "Sua viagem"
                  : tab === "abastecer"
                    ? "Abastecimento e despesas"
                    : tab === "acerto"
                      ? "Meu acerto"
                      : "Meus documentos"}
              </h1>
            </div>
            <nav className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["viagem", RouteIcon, "Viagem"],
                  ["abastecer", Fuel, "Abastecer"],
                  ["acerto", Wallet, "Acerto"],
                  ["documentos", FileBadge, "Docs"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex h-11 items-center justify-center gap-1.5 rounded-full border text-[12px] font-bold",
                    tab === id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </nav>
            {!view.active && (
              <div className="rounded-[20px] border border-warning/35 bg-warning/10 p-3 text-[12.5px]">
                Esta viagem já foi encerrada no sistema. Você ainda pode ver o acerto.
              </div>
            )}
            {tab === "viagem" && <TripTab view={view} act={act} />}
            {tab === "abastecer" && <FuelTab view={view} act={act} />}
            {tab === "acerto" && <SettlementTab view={view} />}
            {tab === "documentos" && <DocumentsTab view={view} act={act} />}
            <p className="mt-2 flex items-center gap-2 rounded-[16px] border border-dashed border-border bg-surface/60 px-4 py-2.5 text-[11.5px] text-muted-foreground">
              <Lock className="size-3.5 shrink-0 text-primary" />
              Este link é só desta viagem e vale até {formatDay(view.expiresAt)}. Não repasse.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

type Act = (
  action: DriverLinkAction,
  local?: (current: DriverLinkView) => DriverLinkView,
) => Promise<boolean>;

function Box({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("premium-card p-4", className)}>{children}</section>;
}

// ------------------------------------------------------------ Viagem

const STATUS_BUTTONS: Array<{
  code: DriverStatusCode;
  label: string;
  icon: typeof MapPinCheck;
  main?: boolean;
}> = [
  { code: "chegou_origem", label: "Cheguei para carregar", icon: Truck },
  { code: "carregado", label: "Carregado, saindo", icon: PackageCheck },
  { code: "chegou_destino", label: "Cheguei no destino", icon: MapPinCheck, main: true },
  { code: "entregue", label: "Descarga concluída", icon: CircleCheck },
  { code: "parada", label: "Parada", icon: CirclePause },
  { code: "ocorrencia", label: "Ocorrência", icon: TriangleAlert },
];

function TripTab({ view, act }: { view: DriverLinkView; act: Act }) {
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<string | undefined>(view.lastPositionAt);
  const timer = useRef<number | null>(null);

  const send = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Este celular não libera a localização.");
      setSharing(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const ok = await act({
          type: "posicao",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        if (ok) setLastSent(new Date().toISOString());
      },
      () => {
        toast.error("Libere a localização para enviar a posição.");
        setSharing(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }, [act]);

  useEffect(() => {
    if (!sharing) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    send();
    timer.current = window.setInterval(send, POSITION_EVERY_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [sharing, send]);

  async function status(code: DriverStatusCode) {
    let note: string | undefined;
    if (code === "ocorrencia" || code === "parada") {
      note =
        window.prompt(code === "ocorrencia" ? "O que aconteceu?" : "Motivo da parada:")?.trim() ||
        undefined;
      if (code === "ocorrencia" && !note) return;
    }
    const ok = await act({ type: "status", status: code, note });
    if (ok && view.demo) toast.success("Status enviado para a transportadora.");
  }

  const destination = [view.destination.name, view.destination.place].filter(Boolean).join(", ");
  return (
    <>
      <Box>
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-extrabold tracking-[0.02em]">{view.plate}</span>
          <span className="rounded-full border border-success/30 bg-success/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-success">
            {view.statusLabel}
          </span>
        </div>
        {view.product && <p className="mt-1 text-[12px] text-muted-foreground">{view.product}</p>}
        <div className="mt-3 flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="size-2.5 rounded-full border-[2.5px] border-primary" />
            <span className="my-1 w-0.5 flex-1 bg-border" />
            <span className="size-2.5 rounded-full bg-foreground" />
          </div>
          <div className="flex flex-col gap-4 text-[13px]">
            <div>
              <b>{view.origin.name ?? "Origem"}</b>
              <p className="text-[12px] text-muted-foreground">{view.origin.place}</p>
            </div>
            <div>
              <b>{view.destination.name ?? "Destino"}</b>
              <p className="text-[12px] text-muted-foreground">{view.destination.place}</p>
            </div>
          </div>
        </div>
        {destination && (
          <a
            href={`https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[12px] font-bold text-primary"
          >
            <Navigation className="size-3.5" /> Abrir rota no Waze
          </a>
        )}
      </Box>

      <p className="label-tiny mt-1">Atualizar agora</p>
      <div className="grid grid-cols-2 gap-2">
        {STATUS_BUTTONS.map((button) => (
          <button
            key={button.code}
            type="button"
            disabled={!view.active}
            onClick={() => status(button.code)}
            className={cn(
              "flex h-[60px] flex-col items-center justify-center gap-1 rounded-[20px] border text-[12px] font-bold disabled:opacity-50",
              button.main
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground",
            )}
          >
            <button.icon className="size-[18px]" />
            {button.label}
          </button>
        ))}
      </div>

      {!view.hasTracker && view.active && (
        <Box className="flex items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-success/12 text-success">
            <LocateFixed className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold">
              {sharing ? "Enviando sua posição" : "Enviar minha posição"}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {lastSent
                ? `Última enviada ${formatDay(lastSent)} ${new Date(lastSent).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Mantenha esta página aberta durante a viagem"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sharing}
            aria-label="Enviar posição"
            onClick={() => setSharing((value) => !value)}
            className={cn(
              "relative h-6 w-10 shrink-0 rounded-full transition",
              sharing ? "bg-[#44AD60]" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] size-[18px] rounded-full bg-white transition-all",
                sharing ? "left-[19px]" : "left-[3px]",
              )}
            />
          </button>
        </Box>
      )}
    </>
  );
}

// ------------------------------------------------------------ Abastecimento e despesas

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  inputMode = "decimal",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className="mt-1 h-11 w-full rounded-full border border-border bg-card px-4 text-[14px] font-semibold outline-none focus:border-primary"
      />
    </label>
  );
}

const toNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

function FuelTab({ view, act }: { view: DriverLinkView; act: Act }) {
  const [station, setStation] = useState("");
  const [liters, setLiters] = useState("");
  const [amount, setAmount] = useState("");
  const [odometer, setOdometer] = useState("");
  const [paidByMe, setPaidByMe] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<{
    category: DriverExpenseCategory;
    amount: string;
    description: string;
  }>({
    category: "pedagio",
    amount: "",
    description: "",
  });

  const last = [...view.fuel].reverse().find((entry) => entry.kmPerLiter !== undefined);
  const lastOdometer = view.fuel[view.fuel.length - 1]?.odometer;

  async function saveFuel(event: FormEvent) {
    event.preventDefault();
    const l = toNumber(liters);
    const a = toNumber(amount);
    const o = toNumber(odometer);
    if (!(l > 0) || !(a > 0) || !(o > 0)) {
      toast.error("Preencha litros, valor e km do painel.");
      return;
    }
    setSaving(true);
    const ok = await act(
      {
        type: "abastecimento",
        station: station || "Posto",
        liters: l,
        amount: a,
        odometer: o,
        paidByDriver: paidByMe,
      },
      (current) => {
        const prev = current.fuel[current.fuel.length - 1];
        const km = prev ? o - prev.odometer : 0;
        const entry = {
          id: `f-${Date.now()}`,
          station: station || "Posto",
          liters: l,
          amount: a,
          odometer: o,
          at: new Date().toISOString(),
          kmPerLiter: prev && km > 0 ? Math.round((km / l) * 100) / 100 : undefined,
        };
        const reimbursable = paidByMe
          ? current.settlement.reimbursable + a
          : current.settlement.reimbursable;
        return {
          ...current,
          fuel: [...current.fuel, entry],
          settlement: {
            ...current.settlement,
            reimbursable,
            balance: (current.settlement.pay ?? 0) + reimbursable - current.settlement.advances,
            expenses: paidByMe
              ? [
                  {
                    id: entry.id,
                    category: "diesel_s10",
                    description: `Abastecimento em ${entry.station}`,
                    amount: a,
                    at: entry.at,
                  },
                  ...current.settlement.expenses,
                ]
              : current.settlement.expenses,
          },
        };
      },
    );
    setSaving(false);
    if (ok) {
      if (view.demo) toast.success("Abastecimento salvo.");
      setStation("");
      setLiters("");
      setAmount("");
      setOdometer("");
    }
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    const a = toNumber(expense.amount);
    if (!(a > 0)) {
      toast.error("Informe o valor.");
      return;
    }
    const description = expense.description || DRIVER_EXPENSE_LABELS[expense.category];
    const ok = await act(
      { type: "despesa", category: expense.category, amount: a, description },
      (current) => {
        const reimbursable = current.settlement.reimbursable + a;
        return {
          ...current,
          settlement: {
            ...current.settlement,
            reimbursable,
            balance: (current.settlement.pay ?? 0) + reimbursable - current.settlement.advances,
            expenses: [
              {
                id: `e-${Date.now()}`,
                category: expense.category,
                description,
                amount: a,
                at: new Date().toISOString(),
              },
              ...current.settlement.expenses,
            ],
          },
        };
      },
    );
    if (ok) {
      if (view.demo) toast.success("Despesa lançada.");
      setExpense({ category: expense.category, amount: "", description: "" });
    }
  }

  const avg = view.fleetKmPerLiter;
  const diff = last?.kmPerLiter && avg ? last.kmPerLiter - avg : undefined;

  return (
    <>
      {last?.kmPerLiter && (
        <Box className="flex items-center gap-3 border-primary/25 bg-primary/6">
          <div className="min-w-0 flex-1">
            <p className="label-tiny text-primary">Consumo do último trecho</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono text-[28px] font-black">
                {last.kmPerLiter.toLocaleString("pt-BR")}
              </span>
              <b>km/l</b>
            </p>
            {avg && (
              <p className="text-[11.5px] text-muted-foreground">
                Média do caminhão: {avg.toLocaleString("pt-BR")} km/l
                {diff !== undefined &&
                  (diff < -0.25 ? " · abaixo do normal" : " · dentro do normal")}
              </p>
            )}
          </div>
          <span
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-[14px]",
              diff !== undefined && diff < -0.25
                ? "bg-warning/15 text-warning"
                : "bg-success/12 text-success",
            )}
          >
            {diff !== undefined && diff < -0.25 ? (
              <TrendingDown className="size-5" />
            ) : (
              <TrendingUp className="size-5" />
            )}
          </span>
        </Box>
      )}

      <form onSubmit={saveFuel}>
        <Box className="space-y-2.5">
          <p className="label-tiny">Registrar abastecimento</p>
          <NumberField
            label="Posto"
            value={station}
            onChange={setStation}
            placeholder="Nome e cidade"
            inputMode="text"
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Litros" value={liters} onChange={setLiters} placeholder="412,6" />
            <NumberField
              label="Valor total (R$)"
              value={amount}
              onChange={setAmount}
              placeholder="2.495,23"
            />
          </div>
          <NumberField
            label="Km do painel"
            value={odometer}
            onChange={setOdometer}
            placeholder={
              lastOdometer ? `último: ${lastOdometer.toLocaleString("pt-BR")}` : "284.917"
            }
            inputMode="numeric"
          />
          <label className="flex items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={paidByMe}
              onChange={(event) => setPaidByMe(event.target.checked)}
            />
            Paguei do meu bolso (entra no meu acerto)
          </label>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Camera className="size-3.5" /> Foto da bomba e do painel: na próxima versão.
          </p>
          <button
            type="submit"
            disabled={saving || !view.active}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            <CircleCheck className="size-4" /> Salvar abastecimento
          </button>
        </Box>
      </form>

      <form onSubmit={saveExpense}>
        <Box className="space-y-2.5">
          <p className="label-tiny">Outra despesa</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DRIVER_EXPENSE_LABELS) as DriverExpenseCategory[]).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setExpense((current) => ({ ...current, category }))}
                className={cn(
                  "h-8 rounded-full border px-3 text-[12px] font-bold",
                  expense.category === category
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {DRIVER_EXPENSE_LABELS[category]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Valor (R$)"
              value={expense.amount}
              onChange={(amountValue) =>
                setExpense((current) => ({ ...current, amount: amountValue }))
              }
              placeholder="184,40"
            />
            <NumberField
              label="Descrição"
              value={expense.description}
              onChange={(description) => setExpense((current) => ({ ...current, description }))}
              placeholder="Opcional"
              inputMode="text"
            />
          </div>
          <button
            type="submit"
            disabled={!view.active}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-[13px] font-bold disabled:opacity-50"
          >
            <Plus className="size-4" /> Lançar despesa
          </button>
        </Box>
      </form>

      {view.fuel.length > 0 && (
        <Box>
          <p className="label-tiny">Abastecimentos desta viagem</p>
          <div className="mt-2 space-y-2">
            {[...view.fuel].reverse().map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-11 font-mono text-[11px] text-muted-foreground">
                  {formatDay(entry.at)}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{entry.station}</span>
                <span className="font-mono">{entry.liters.toLocaleString("pt-BR")} L</span>
                {entry.kmPerLiter && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                    {entry.kmPerLiter.toLocaleString("pt-BR")} km/l
                  </span>
                )}
              </div>
            ))}
          </div>
        </Box>
      )}
    </>
  );
}

// ------------------------------------------------------------ Acerto

function SettlementTab({ view }: { view: DriverLinkView }) {
  const s = view.settlement;
  return (
    <>
      <section className="rounded-[25px] bg-[#080A09] p-5 text-[#E4E6E5]">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#79CA8D]">
          Saldo a receber desta viagem
        </p>
        <p className="mt-1 font-mono text-[34px] font-black leading-none">{brl(s.balance)}</p>
        <p className="mt-2 text-[11.5px] text-[#9BA39F]">
          {s.pay === undefined
            ? "A transportadora ainda não informou o valor combinado."
            : "O pagamento sai depois do canhoto, como combinado com a transportadora."}
        </p>
      </section>
      <Box>
        <p className="label-tiny">Esta viagem · {view.plate}</p>
        <Line
          label="Valor combinado com você"
          value={s.pay === undefined ? "a informar" : brl(s.pay)}
        />
        <Line label="Adiantamento recebido" value={`− ${brl(s.advances)}`} />
        <Line label="Você pagou (reembolso)" value={`+ ${brl(s.reimbursable)}`} good />
        <div className="my-3 h-px bg-border" />
        <Line label="Saldo" value={brl(s.balance)} strong />
      </Box>
      {s.expenses.length > 0 && (
        <Box>
          <p className="label-tiny">O que você lançou</p>
          <div className="mt-2 space-y-2">
            {s.expenses.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-11 font-mono text-[11px] text-muted-foreground">
                  {formatDay(item.at)}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.description}</span>
                <b className="font-mono">{brl(item.amount)}</b>
              </div>
            ))}
          </div>
        </Box>
      )}
      {s.previous.length > 0 && (
        <Box>
          <p className="label-tiny">Viagens anteriores com {view.carrierName}</p>
          <div className="mt-2 space-y-2">
            {s.previous.map((trip) => (
              <div key={trip.freightId} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-11 font-mono text-[11px] text-muted-foreground">
                  {formatDay(trip.date)}
                </span>
                <span className="min-w-0 flex-1">{trip.pay ? brl(trip.pay) : "Viagem"}</span>
                {trip.balance <= 0 ? (
                  <span className="rounded-full border border-success/30 bg-success/12 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                    Acertado
                  </span>
                ) : (
                  <b className="font-mono">{brl(trip.balance)}</b>
                )}
              </div>
            ))}
          </div>
        </Box>
      )}
      <p className="flex items-center gap-2 px-1 text-[11.5px] text-muted-foreground">
        <UserCheck className="size-3.5 shrink-0 text-primary" />
        Seus links diferentes caem no mesmo histórico, pelo seu telefone.
      </p>
    </>
  );
}

function Line({
  label,
  value,
  good,
  strong,
}: {
  label: string;
  value: string;
  good?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="mt-2.5 flex justify-between gap-3 text-[13px]">
      <span className={strong ? "font-bold" : "text-muted-foreground"}>{label}</span>
      <b className={cn("font-mono", good && "text-success", strong && "text-[15px]")}>{value}</b>
    </div>
  );
}

// ------------------------------------------------------------ Documentos e Rede

function DocumentsTab({ view, act }: { view: DriverLinkView; act: Act }) {
  const [editing, setEditing] = useState<DriverDocKind | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [number, setNumber] = useState("");
  const [network, setNetwork] = useState(view.network);

  async function saveDoc(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const ok = await act(
      { type: "documento", kind: editing, expiresAt: expiresAt || undefined, number },
      (current) => ({
        ...current,
        documents: current.documents.map((doc) =>
          doc.kind === editing
            ? {
                ...doc,
                expiresAt: expiresAt || undefined,
                numberHint: number.slice(-4) || doc.numberHint,
                state: expiresAt ? (new Date(expiresAt) < new Date() ? "vencido" : "ok") : "ok",
              }
            : doc,
        ),
      }),
    );
    if (ok) {
      if (view.demo) toast.success("Documento atualizado.");
      setEditing(null);
      setExpiresAt("");
      setNumber("");
    }
  }

  async function saveNetwork(optIn: boolean) {
    const next = { ...network, optIn };
    const ok = await act({ type: "rede", ...next }, (current) => ({ ...current, network: next }));
    if (ok) {
      setNetwork(next);
      if (view.demo)
        toast.success(optIn ? "Você entrou na Rede Frotak." : "Você saiu da Rede Frotak.");
    }
  }

  return (
    <>
      <Box>
        <p className="label-tiny">Seus documentos</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Mantenha em dia: os embarcadores veem só se está válido, nunca o número completo.
        </p>
        <div className="mt-3 space-y-2.5">
          {view.documents.map((doc) => (
            <button
              key={doc.kind}
              type="button"
              onClick={() => {
                setEditing(doc.kind);
                setExpiresAt(doc.expiresAt ?? "");
              }}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
                <FileBadge className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{doc.label}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  {doc.expiresAt ? `até ${formatDay(doc.expiresAt)}` : "Toque para informar"}
                </span>
              </span>
              <DocStatePill state={doc.state} label={doc.state === "ok" ? "Em dia" : undefined} />
            </button>
          ))}
        </div>
        {editing && (
          <form
            onSubmit={saveDoc}
            className="mt-4 space-y-2.5 rounded-[18px] border border-border bg-surface/60 p-3"
          >
            <p className="text-[12.5px] font-bold">
              {view.documents.find((doc) => doc.kind === editing)?.label}
            </p>
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">Válido até</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-1 h-11 w-full rounded-full border border-border bg-card px-4 text-[14px]"
              />
            </label>
            <NumberField
              label="Número (guardamos só o final)"
              value={number}
              onChange={setNumber}
              inputMode="text"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-11 flex-1 rounded-full border border-border text-[13px] font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-11 flex-[1.4] rounded-full bg-primary text-[13px] font-bold text-primary-foreground"
              >
                Salvar
              </button>
            </div>
          </form>
        )}
      </Box>

      <Box className={cn(network.optIn && "border-primary/30 bg-primary/6")}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
            <Network className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">Rede Frotak</p>
            <p className="text-[11.5px] text-muted-foreground">
              Mais carga: embarcadores e transportadoras acham você pela sua nota e documentos em
              dia.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField
            label="Cidade base"
            value={network.city ?? ""}
            onChange={(city) => setNetwork((current) => ({ ...current, city }))}
            inputMode="text"
          />
          <NumberField
            label="UF"
            value={network.state ?? ""}
            onChange={(state) =>
              setNetwork((current) => ({ ...current, state: state.toUpperCase().slice(0, 2) }))
            }
            inputMode="text"
          />
        </div>
        <div className="mt-2">
          <NumberField
            label="Quando fico livre"
            value={network.availableNote ?? ""}
            onChange={(availableNote) => setNetwork((current) => ({ ...current, availableNote }))}
            placeholder="Ex.: livre a partir de sexta"
            inputMode="text"
          />
        </div>
        <button
          type="button"
          onClick={() => saveNetwork(!view.network.optIn)}
          className={cn(
            "mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-bold",
            view.network.optIn
              ? "border border-border bg-card"
              : "bg-primary text-primary-foreground",
          )}
        >
          {view.network.optIn ? "Sair da Rede Frotak" : "Quero entrar na Rede Frotak"}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Aparecem: nome, veículo, região, nota e se os documentos estão em dia. Nunca: telefone,
          CPF, quanto você recebe ou para quem rodou.
        </p>
      </Box>
    </>
  );
}
