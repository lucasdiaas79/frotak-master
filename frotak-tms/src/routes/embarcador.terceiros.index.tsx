import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, Clock, IdCard, Lock, Search, ShieldAlert, ShieldCheck, Trophy } from "lucide-react";
import { DecisionPill, DocStatePill, DriverAvatar, ScoreStar } from "@/components/shipper/DriverUi";
import { Card, EmptyState, FilterChips, Kpi, PageTitle } from "@/components/shipper/ShipperUi";
import { useShipperPortal } from "@/lib/shipper/client";
import { DRIVER_RELATION_LABELS, type ShipperDriver } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/terceiros/")({
  component: ThirdPartiesPage,
});

type Filter = "todos" | "aprovado" | "sem_analise" | "bloqueado";

function ThirdPartiesPage() {
  const { thirdParties, data } = useShipperPortal();
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [onlyDocsOk, setOnlyDocsOk] = useState(false);
  const [includeFleet, setIncludeFleet] = useState(false);

  const drivers = thirdParties?.drivers ?? [];
  const base = includeFleet ? drivers : drivers.filter((driver) => driver.relation !== "frota");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((driver) => {
      if (filter === "aprovado" && driver.decision !== "aprovado") return false;
      if (filter === "bloqueado" && driver.decision !== "bloqueado") return false;
      if (filter === "sem_analise" && driver.decision) return false;
      if (onlyDocsOk && driver.docState !== "ok") return false;
      if (!q) return true;
      return [driver.name, driver.plate, driver.vehicleKind, ...driver.carrierNames]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [base, filter, query, onlyDocsOk]);

  const freightById = new Map((data?.freights ?? []).map((freight) => [freight.id, freight]));
  const alerts = base
    .filter((driver) => driver.activeFreightIds.length && driver.docState !== "ok")
    .map((driver) => ({ driver, freight: freightById.get(driver.activeFreightIds[0]) }));
  const ranking = [...base]
    .filter((driver) => driver.onTimeRate !== undefined)
    .sort((a, b) => (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0))
    .slice(0, 6);

  const count = (fn: (driver: ShipperDriver) => boolean) => base.filter(fn).length;

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Parceiros"
        title="Terceiros nas suas cargas"
        subtitle="Motoristas que já levaram carga sua pelas transportadoras conectadas. A nota vem das viagens reais."
      />

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Motoristas"
          value={base.length}
          hint={`vindos de ${new Set(base.flatMap((d) => d.carrierNames)).size} transportadora(s)`}
          icon={IdCard}
        />
        <Kpi
          label="Documento vencendo"
          value={count((d) => d.docState === "vencendo")}
          hint="nos próximos 30 dias"
          icon={Clock}
          tone="warning"
        />
        <Kpi
          label="Vencido ou faltando"
          value={count((d) => d.docState === "vencido" || d.docState === "faltando")}
          hint={`${alerts.length} com carga sua agora`}
          icon={ShieldAlert}
          tone="danger"
        />
        <Kpi
          label="Bloqueados"
          value={count((d) => d.decision === "bloqueado")}
          hint="não devem levar suas cargas"
          icon={Ban}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 p-4">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <FilterChips<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { id: "todos", label: "Todos", count: base.length },
                {
                  id: "aprovado",
                  label: "Aprovados",
                  count: count((d) => d.decision === "aprovado"),
                },
                { id: "sem_analise", label: "Sem análise", count: count((d) => !d.decision) },
                {
                  id: "bloqueado",
                  label: "Bloqueados",
                  count: count((d) => d.decision === "bloqueado"),
                },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground">
                <Search className="size-3.5 shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nome, placa ou transportadora"
                  className="w-44 min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              <Toggle active={onlyDocsOk} onClick={() => setOnlyDocsOk((v) => !v)}>
                <ShieldCheck className="size-3.5" /> Só docs em dia
              </Toggle>
              <Toggle active={includeFleet} onClick={() => setIncludeFleet((v) => !v)}>
                Incluir frota própria
              </Toggle>
            </div>
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon={IdCard}
              title={drivers.length ? "Nenhum motorista neste filtro" : "Ainda não há motoristas"}
              text={
                drivers.length
                  ? "Mude o filtro ou a busca."
                  : "Os motoristas aparecem quando a transportadora manda o link do motorista nas suas cargas."
              }
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="px-3 pb-2.5">Motorista</th>
                    <th className="px-3 pb-2.5">Veículo</th>
                    <th className="px-3 pb-2.5">Nota</th>
                    <th className="px-3 pb-2.5">Viagens</th>
                    <th className="px-3 pb-2.5">Documentos</th>
                    <th className="px-3 pb-2.5">Costuma vir por</th>
                    <th className="px-3 pb-2.5">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((driver) => (
                    <tr
                      key={driver.profileId}
                      className="border-b border-border/60 last:border-0 hover:bg-primary/5"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          to="/embarcador/terceiros/$profileId"
                          params={{ profileId: driver.profileId }}
                          className="flex items-center gap-2.5"
                        >
                          <DriverAvatar initials={driver.initials} />
                          <span className="min-w-0">
                            <span className="block truncate font-bold hover:text-primary">
                              {driver.name}
                            </span>
                            <span className="block text-[11.5px] text-muted-foreground">
                              {DRIVER_RELATION_LABELS[driver.relation]}
                              {driver.baseCity ? ` · ${driver.baseCity}` : ""}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-extrabold tracking-[0.02em]">{driver.plate ?? "-"}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {driver.vehicleKind ?? ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <ScoreStar score={driver.score} />
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold">{driver.tripsWithMe}</td>
                      <td className="px-3 py-2.5">
                        <DocStatePill state={driver.docState} />
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {driver.carrierNames.join(" · ")}
                      </td>
                      <td className="px-3 py-2.5">
                        <DecisionPill decision={driver.decision} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <p className="label-tiny">Alertas</p>
            <div className="mt-3 space-y-2">
              {alerts.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">
                  Nenhuma carga sua em andamento com motorista de documento irregular.
                </p>
              )}
              {alerts.map(({ driver, freight }) => (
                <Link
                  key={driver.profileId}
                  to="/embarcador/terceiros/$profileId"
                  params={{ profileId: driver.profileId }}
                  className={cn(
                    "flex gap-2.5 rounded-[18px] border p-3",
                    driver.docState === "vencendo"
                      ? "border-warning/35 bg-warning/8"
                      : "border-destructive/30 bg-destructive/6",
                  )}
                >
                  {driver.docState === "vencendo" ? (
                    <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold">
                      {freight?.plate ?? "Carga"} com documento{" "}
                      {driver.docState === "vencendo"
                        ? "vencendo"
                        : driver.docState === "faltando"
                          ? "faltando"
                          : "vencido"}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {driver.name} ·{" "}
                      {driver.documents
                        .filter((doc) => doc.state !== "ok")
                        .map((doc) => doc.label)
                        .join(", ")}{" "}
                      · {freight?.carrierName}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="label-tiny">Ranking · pontualidade</p>
              <Trophy className="size-4 text-primary" />
            </div>
            <div className="mt-3 space-y-3">
              {ranking.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">
                  A pontualidade aparece depois das primeiras avaliações de entrega.
                </p>
              )}
              {ranking.map((driver, index) => (
                <div key={driver.profileId} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "w-6 font-mono text-[12px] font-black",
                      index < 3 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {index + 1}º
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-[12.5px] font-semibold">
                      <span className="truncate">{driver.name}</span>
                      <span className="font-mono">{driver.onTimeRate}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          (driver.onTimeRate ?? 0) < 75
                            ? "bg-destructive"
                            : (driver.onTimeRate ?? 0) < 90
                              ? "bg-warning"
                              : "bg-[#44AD60]",
                        )}
                        style={{ width: `${driver.onTimeRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <p className="flex items-center gap-2 rounded-full border border-dashed border-border bg-surface/60 px-4 py-2 text-[11.5px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0 text-primary" />
            Você nunca vê quanto a transportadora paga ao motorista.
          </p>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold transition",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
