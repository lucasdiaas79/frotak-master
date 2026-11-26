import { useMemo, useState } from "react";
import { AlertTriangle, Check, Fuel, Gauge, Plus, X } from "lucide-react";
import { FrotakEmptyState, FrotakMetric, FrotakSection } from "@/components/frotak/FrotakPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  fuelEfficiency,
  listFuelDocs,
  listFuelProfiles,
  listStations,
  listVehicles,
  reviewFuel,
  saveFuelProfile,
  saveStation,
  type StationRow,
} from "@/modules/driver-ops/infrastructure/opsRepository";
import {
  FUEL_CHECK_LABEL,
  LoadError,
  StatusBadge,
  act,
  dateTime,
  money,
  num,
  useLoad,
} from "./shared";

export function FuelTab({ tenantId }: { tenantId: string }) {
  const [onlyPending, setOnlyPending] = useState(true);
  const docs = useLoad(() => listFuelDocs(onlyPending), [onlyPending], 60_000);
  const pending = (docs.data ?? []).filter((d) => d.review_status === "pendente");
  const flagged = (docs.data ?? []).filter((d) => d.checks?.length);
  const liters = (docs.data ?? []).reduce((s, d) => s + Number(d.diesel_liters), 0);
  const amount = (docs.data ?? []).reduce((s, d) => s + Number(d.diesel_amount), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FrotakMetric
          label="Aguardando conferência"
          value={pending.length}
          tone={pending.length ? "warning" : "positive"}
          icon={<AlertTriangle className="size-4" />}
        />
        <FrotakMetric
          label="Com alerta"
          value={flagged.length}
          detail="Odômetro, preço, rastreador, tanque"
          icon={<Gauge className="size-4" />}
        />
        <FrotakMetric
          label="Diesel na lista"
          value={`${num(liters)} L`}
          detail={money(amount)}
          tone="positive"
          icon={<Fuel className="size-4" />}
        />
        <FrotakMetric
          label="Preço médio"
          value={liters ? money(amount / liters) : "--"}
          detail="por litro"
          tone="positive"
          icon={<Fuel className="size-4" />}
        />
      </div>

      <FrotakSection
        title="Abastecimentos"
        description="Conferidos na hora do registro. Alerta não impede o motorista: ele explica e a central aprova ou recusa."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Switch checked={onlyPending} onCheckedChange={setOnlyPending} id="fuel-pending" />
            <Label htmlFor="fuel-pending">Só pendentes</Label>
          </div>
        }
        contentClassName="p-0"
      >
        <LoadError error={docs.error} />
        {!docs.data?.length && !docs.loading ? (
          <FrotakEmptyState
            title="Nada para conferir"
            description="Abastecimentos com alerta aparecem aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(docs.data ?? []).map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 px-5 py-3 text-xs lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {d.vehicle_plate} · {d.driver_name ?? "--"} · {d.station}
                  </p>
                  <p className="text-muted-foreground">
                    {dateTime(d.recorded_at)} · {num(Number(d.odometer))} km ·{" "}
                    {num(Number(d.diesel_liters), 1)} L · {money(Number(d.diesel_amount))}
                    {Number(d.diesel_liters)
                      ? ` (${money(Number(d.diesel_amount) / Number(d.diesel_liters))}/L)`
                      : ""}
                    {d.tank_full === false ? " · parcial" : " · tanque cheio"}
                  </p>
                  {d.checks?.length ? (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {d.checks.map((c) => (
                        <li key={c.code}>
                          <StatusBadge tone="warn">
                            {FUEL_CHECK_LABEL[c.code] ?? c.code}: {c.detail}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {d.driver_justification ? (
                    <p className="mt-1 italic">Motorista: “{d.driver_justification}”</p>
                  ) : null}
                </div>
                {d.review_status === "pendente" ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const note = window.prompt("Motivo da recusa (vai para o histórico)") ?? "";
                        void act(
                          "Abastecimento recusado",
                          () => reviewFuel(d.id, false, note),
                          () => void docs.reload(),
                        );
                      }}
                    >
                      <X className="size-4" /> Recusar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        void act(
                          "Abastecimento aprovado",
                          () => reviewFuel(d.id, true),
                          () => void docs.reload(),
                        )
                      }
                    >
                      <Check className="size-4" /> Aprovar
                    </Button>
                  </div>
                ) : (
                  <StatusBadge tone={d.review_status === "recusado" ? "danger" : "ok"}>
                    {d.review_status === "ok"
                      ? "Sem alerta"
                      : d.review_status === "aprovado"
                        ? "Aprovado"
                        : "Recusado"}
                  </StatusBadge>
                )}
              </li>
            ))}
          </ul>
        )}
      </FrotakSection>

      <div className="grid gap-4 xl:grid-cols-2">
        <EfficiencyPanel tenantId={tenantId} />
        <StationsPanel tenantId={tenantId} />
      </div>
    </div>
  );
}

function EfficiencyPanel({ tenantId }: { tenantId: string }) {
  const vehicles = useLoad(listVehicles, []);
  const profiles = useLoad(listFuelProfiles, []);
  const from = useMemo(() => new Date(Date.now() - 60 * 86_400_000).toISOString(), []);
  const eff = useLoad(async () => {
    const list = (vehicles.data ?? []).slice(0, 40);
    const results = await Promise.all(
      list.map((v) => fuelEfficiency(v.id, from).catch(() => null)),
    );
    return Object.fromEntries(list.map((v, i) => [v.id, results[i]]));
  }, [vehicles.data, from]);
  const profileOf = (id: string) => profiles.data?.find((p) => p.vehicle_id === id);
  return (
    <FrotakSection
      title="km/l por veículo (60 dias)"
      description="Tanque cheio a tanque cheio. Parciais entram no total de litros do trecho."
      contentClassName="p-0"
    >
      <ul className="flex max-h-[420px] flex-col divide-y divide-border overflow-y-auto">
        {(vehicles.data ?? []).map((v) => {
          const e = eff.data?.[v.id];
          const p = profileOf(v.id);
          const target = p?.km_per_liter_target ?? null;
          const below = e?.average != null && target != null && e.average < target;
          return (
            <li key={v.id} className="flex items-center gap-3 px-5 py-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{v.plate}</p>
                <p className="text-muted-foreground">
                  {e?.km
                    ? `${num(e.km)} km · ${num(e.liters, 1)} L`
                    : "Precisa de 2 tanques cheios"}
                </p>
              </div>
              <span
                className={cn(
                  "w-16 text-right text-sm tabular-nums",
                  below ? "text-warning" : "text-primary",
                )}
              >
                {e?.average != null ? num(e.average, 2) : "--"}
              </span>
              <Input
                className="w-20"
                defaultValue={target ?? ""}
                placeholder="meta"
                inputMode="decimal"
                onBlur={(ev) => {
                  const value = Number(ev.target.value.replace(",", "."));
                  if (!value || value === target) return;
                  void act(
                    "Meta salva",
                    () =>
                      saveFuelProfile(tenantId, {
                        vehicle_id: v.id,
                        tank_capacity_liters: p?.tank_capacity_liters ?? 300,
                        km_per_liter_target: value,
                      }),
                    () => void profiles.reload(),
                  );
                }}
              />
              <Input
                className="w-20"
                defaultValue={p?.tank_capacity_liters ?? ""}
                placeholder="tanque"
                inputMode="numeric"
                title="Capacidade do tanque em litros"
                onBlur={(ev) => {
                  const value = Number(ev.target.value);
                  if (!value || value === p?.tank_capacity_liters) return;
                  void act(
                    "Tanque salvo",
                    () =>
                      saveFuelProfile(tenantId, {
                        vehicle_id: v.id,
                        tank_capacity_liters: value,
                        km_per_liter_target: target,
                      }),
                    () => void profiles.reload(),
                  );
                }}
              />
            </li>
          );
        })}
      </ul>
    </FrotakSection>
  );
}

function StationsPanel({ tenantId }: { tenantId: string }) {
  const stations = useLoad(listStations, []);
  const [editing, setEditing] = useState<Partial<StationRow> | null>(null);
  return (
    <FrotakSection
      title="Postos da rede"
      description="Preço combinado de diesel e Arla. O app ordena pelo mais perto e confere o preço pago."
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing({ name: "", payment_methods: ["cartao_frota"], active: true })}
        >
          <Plus className="size-4" /> Posto
        </Button>
      }
      contentClassName="p-0"
    >
      <LoadError error={stations.error} />
      {editing ? (
        <div className="grid gap-2 border-b border-border p-5 sm:grid-cols-2">
          <Input
            value={editing.name ?? ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Nome do posto"
          />
          <Input
            value={editing.city ?? ""}
            onChange={(e) => setEditing({ ...editing, city: e.target.value })}
            placeholder="Cidade"
          />
          <Input
            value={editing.diesel_price ?? ""}
            onChange={(e) =>
              setEditing({
                ...editing,
                diesel_price: Number(e.target.value.replace(",", ".")) || null,
              })
            }
            placeholder="Diesel S10 R$/L"
            inputMode="decimal"
          />
          <Input
            value={editing.arla_price ?? ""}
            onChange={(e) =>
              setEditing({
                ...editing,
                arla_price: Number(e.target.value.replace(",", ".")) || null,
              })
            }
            placeholder="Arla R$/L"
            inputMode="decimal"
          />
          <Input
            value={editing.lat ?? ""}
            onChange={(e) => setEditing({ ...editing, lat: Number(e.target.value) || null })}
            placeholder="Latitude (ex.: -10.95)"
          />
          <Input
            value={editing.lng ?? ""}
            onChange={(e) => setEditing({ ...editing, lng: Number(e.target.value) || null })}
            placeholder="Longitude (ex.: -37.07)"
          />
          <div className="flex gap-2 sm:col-span-2 sm:justify-end">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!editing.name?.trim()}
              onClick={() =>
                void act(
                  "Posto salvo",
                  () => saveStation(tenantId, editing as StationRow),
                  () => {
                    setEditing(null);
                    void stations.reload();
                  },
                )
              }
            >
              Salvar
            </Button>
          </div>
        </div>
      ) : null}
      <ul className="flex max-h-[360px] flex-col divide-y divide-border overflow-y-auto">
        {(stations.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-muted-foreground">
                {s.city ?? ""} · diesel {s.diesel_price ? money(Number(s.diesel_price)) : "--"} ·
                Arla {s.arla_price ? money(Number(s.arla_price)) : "--"}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
              Editar
            </Button>
          </li>
        ))}
      </ul>
    </FrotakSection>
  );
}
