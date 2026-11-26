import { useMemo, useState } from "react";
import { Handshake, Plus, Search, Truck, Undo2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useFleet } from "@/modules/fleet-core/container";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Driver, FleetOwnership, Trailer, Vehicle } from "@/lib/types";
import { VEHICLE_STATUS_LABEL } from "@/lib/types";
import { vehicleTrailerIds } from "@/modules/fleet-core/domain/vehicleTrailers";

// Terceiros: motorista, cavalo e carreta que nao sao da frota propria.
// O que esta marcado aqui recebe o link do motorista (sem app) em vez do app oficial,
// e entra separado no faturamento (frota propria x terceiros).

interface NewThirdPartyForm {
  driverName: string;
  driverPhone: string;
  driverCnh: string;
  plate: string;
  brand: string;
  model: string;
  trailerIdentifier: string;
  trailerImplementType: string;
}

const EMPTY_FORM: NewThirdPartyForm = {
  driverName: "",
  driverPhone: "",
  driverCnh: "",
  plate: "",
  brand: "",
  model: "",
  trailerIdentifier: "",
  trailerImplementType: "",
};

function normalizePlate(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function isThirdParty(item: { ownership?: FleetOwnership }) {
  return item.ownership === "terceiro";
}

function saveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/ownership/i.test(message))
    return "O banco ainda não tem o campo de terceiros. Aplique a migration 202611260001 e tente de novo.";
  return message || "Não foi possível salvar o terceiro.";
}

export function TerceirosPage() {
  const { vehicles, drivers, trailers, upsertVehicle, upsertDriver, upsertTrailer, link } =
    useFleet();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<NewThirdPartyForm | null>(null);
  const [marking, setMarking] = useState(false);
  const [markVehicleId, setMarkVehicleId] = useState("");
  const [saving, setSaving] = useState(false);

  // Antes da migration nenhum registro traz o campo; a tela avisa em vez de falhar calada.
  const ownershipReady = vehicles.length === 0 || vehicles.some((v) => v.ownership !== undefined);

  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const trailersById = useMemo(() => new Map(trailers.map((t) => [t.id, t])), [trailers]);

  const thirdVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vehicles
      .filter(isThirdParty)
      .filter((vehicle) => {
        if (!term) return true;
        const driver = vehicle.driverId ? driversById.get(vehicle.driverId) : undefined;
        return (
          vehicle.plate.toLowerCase().includes(term) ||
          (driver?.name.toLowerCase().includes(term) ?? false)
        );
      });
  }, [vehicles, search, driversById]);

  const looseThirdDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          isThirdParty(driver) && !vehicles.some((vehicle) => vehicle.driverId === driver.id),
      ),
    [drivers, vehicles],
  );

  const ownVehicles = useMemo(() => vehicles.filter((v) => !isThirdParty(v)), [vehicles]);

  async function setOwnership(vehicle: Vehicle, ownership: FleetOwnership) {
    await upsertVehicle({ ...vehicle, ownership });
    const driver = vehicle.driverId ? driversById.get(vehicle.driverId) : undefined;
    if (driver && driver.ownership !== ownership) await upsertDriver({ ...driver, ownership });
    for (const trailerId of vehicleTrailerIds(vehicle)) {
      const trailer = trailersById.get(trailerId);
      if (trailer && trailer.ownership !== ownership) await upsertTrailer({ ...trailer, ownership });
    }
  }

  async function handleCreate() {
    if (!creating || saving) return;
    const plate = normalizePlate(creating.plate);
    if (!creating.driverName.trim()) return toast.error("Informe o nome do motorista.");
    if (creating.driverPhone.replace(/\D/g, "").length < 10)
      return toast.error("Informe o celular do motorista com DDD. É por ele que vai o link.");
    if (plate.length < 7) return toast.error("Informe a placa do cavalo.");
    if (vehicles.some((vehicle) => vehicle.plate === plate))
      return toast.error(
        `A placa ${plate} já está cadastrada. Use "Marcar existente como terceiro".`,
      );

    setSaving(true);
    try {
      const driver = await upsertDriver({
        id: "",
        name: creating.driverName.trim(),
        phone: creating.driverPhone.trim(),
        cnh: creating.driverCnh.trim(),
        active: true,
        ownership: "terceiro",
      } satisfies Driver);

      const vehicle = await upsertVehicle({
        id: "",
        workflowVersion: 0,
        workflowFlags: {},
        plate,
        type: "CAVALO TRATOR",
        fleetKind: "CAVALO TRATOR",
        brand: creating.brand.trim().toUpperCase() || undefined,
        model: creating.model.trim().toUpperCase() || undefined,
        status: "disponivel-patio",
        situation: "disponivel-patio",
        city: "",
        state: "",
        lat: 0,
        lng: 0,
        ownership: "terceiro",
        updatedAt: new Date().toISOString(),
      } satisfies Vehicle);

      let trailerId: string | undefined;
      const trailerIdentifier = normalizePlate(creating.trailerIdentifier);
      if (trailerIdentifier) {
        await upsertTrailer({
          id: "",
          identifier: trailerIdentifier,
          type: "IMPLEMENTO",
          fleetKind: creating.trailerImplementType.trim().toUpperCase() || "IMPLEMENTO",
          implementType: creating.trailerImplementType.trim().toUpperCase() || undefined,
          ownership: "terceiro",
        } satisfies Trailer);
        trailerId = useFleet
          .getState()
          .trailers.find((trailer) => trailer.identifier === trailerIdentifier)?.id;
      }

      await link(vehicle.id, driver.id, trailerId, {
        trailerIds: trailerId ? [trailerId] : undefined,
      });
      toast.success("Terceiro cadastrado", {
        description: `${plate} · ${driver.name}. Ao criar o frete, gere o link do motorista no card.`,
      });
      setCreating(null);
    } catch (error) {
      toast.error(saveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkExisting() {
    const vehicle = vehicles.find((item) => item.id === markVehicleId);
    if (!vehicle || saving) return;
    setSaving(true);
    try {
      await setOwnership(vehicle, "terceiro");
      toast.success(`${vehicle.plate} agora é terceiro`, {
        description: "Motorista e carreta vinculados também foram marcados.",
      });
      setMarking(false);
      setMarkVehicleId("");
    } catch (error) {
      toast.error(saveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleBackToOwnFleet(vehicle: Vehicle) {
    if (saving) return;
    if (
      !window.confirm(
        `Voltar ${vehicle.plate} para a frota própria? O motorista passa a usar o app oficial.`,
      )
    )
      return;
    setSaving(true);
    try {
      await setOwnership(vehicle, "propria");
      toast.success(`${vehicle.plate} voltou para a frota própria.`);
    } catch (error) {
      toast.error(saveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const trailerLabel = (vehicle: Vehicle) =>
    vehicleTrailerIds(vehicle)
      .map((id) => trailersById.get(id)?.identifier)
      .filter(Boolean)
      .join(", ") || "-";

  return (
    <>
      <PageHeader
        title="Terceiros"
        subtitle={`${thirdVehicles.length} cavalos de terceiros cadastrados`}
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-[12px]"
              onClick={() => setMarking(true)}
              disabled={!ownershipReady}
            >
              <Handshake className="size-3.5" /> Marcar existente como terceiro
            </Button>
            <Button
              size="sm"
              className="h-9 text-[12px]"
              onClick={() => setCreating({ ...EMPTY_FORM })}
              disabled={!ownershipReady}
            >
              <Plus className="size-3.5" /> Novo terceiro
            </Button>
          </div>
        }
      />

      {!ownershipReady && (
        <section className="premium-card mx-3 mt-4 border-warning/40 px-4 py-4 text-[12.5px] md:mx-0 md:px-5">
          <p className="font-bold text-foreground">Cadastro de terceiros ainda não liberado</p>
          <p className="mt-1 text-muted-foreground">
            O banco ainda não tem o campo que separa frota própria de terceiros. Depois de aplicar a
            migration 202611260001 esta tela passa a funcionar.
          </p>
        </section>
      )}

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <p className="label-tiny">Como funciona</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Frota própria recebe acesso ao app oficial do motorista. Terceiro recebe o link simples
          pelo WhatsApp, sem instalar nada: os botões do link movem o card no Kanban e a posição do
          celular aparece no card e no mapa. O faturamento mostra frota própria e terceiros
          separados.
        </p>
        <div className="relative mt-4 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por placa ou motorista..."
            className="h-10 pl-9 text-[12.5px]"
          />
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Cadastro de terceiros</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Motorista, cavalo e carreta
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[880px]">
            <thead>
              <tr>
                <th>Cavalo</th>
                <th>Motorista</th>
                <th>Celular</th>
                <th>Carreta</th>
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {thirdVehicles.map((vehicle) => {
                const driver = vehicle.driverId ? driversById.get(vehicle.driverId) : undefined;
                return (
                  <tr key={vehicle.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                          <Truck className="size-4" />
                        </span>
                        <span className="font-sans font-semibold text-foreground">
                          {vehicle.plate}
                        </span>
                      </div>
                    </td>
                    <td className="font-semibold text-foreground">{driver?.name ?? "-"}</td>
                    <td className="font-sans text-[12.5px] text-muted-foreground">
                      {driver?.phone || "-"}
                    </td>
                    <td className="font-sans text-[12.5px] text-muted-foreground">
                      {trailerLabel(vehicle)}
                    </td>
                    <td className="text-[12.5px] text-muted-foreground">
                      {vehicle.currentFreightId ? "Em frete" : VEHICLE_STATUS_LABEL[vehicle.status]}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleBackToOwnFleet(vehicle)}
                          className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                          title="Voltar para frota própria"
                        >
                          <Undo2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {thirdVehicles.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <UserPlus className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum terceiro cadastrado
                      </span>
                      <span className="text-[12px]">
                        Cadastre o motorista, o cavalo e a carreta do terceiro.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {looseThirdDrivers.length > 0 && (
          <p className="border-t border-border/70 px-5 py-3 text-[12px] text-muted-foreground">
            Motoristas terceiros sem cavalo vinculado:{" "}
            {looseThirdDrivers.map((driver) => driver.name).join(", ")}
          </p>
        )}
      </section>

      <Modal
        open={!!creating}
        onOpenChange={(open) => !open && setCreating(null)}
        title="Novo terceiro"
        description="Motorista, cavalo e carreta ficam marcados como terceiro e já vinculados."
        footer={
          <>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setCreating(null)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-9" onClick={handleCreate} disabled={saving}>
              {saving ? "Salvando..." : "Salvar terceiro"}
            </Button>
          </>
        }
      >
        {creating && (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="label-tiny sm:col-span-2">Motorista</p>
            <div className="sm:col-span-2">
              <Label className="label-tiny mb-1.5 block">Nome completo</Label>
              <Input
                value={creating.driverName}
                onChange={(event) => setCreating({ ...creating, driverName: event.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Celular com DDD</Label>
              <Input
                value={creating.driverPhone}
                onChange={(event) => setCreating({ ...creating, driverPhone: event.target.value })}
                inputMode="tel"
                className="h-9 font-sans"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">CNH</Label>
              <Input
                value={creating.driverCnh}
                onChange={(event) => setCreating({ ...creating, driverCnh: event.target.value })}
                className="h-9 font-sans"
              />
            </div>

            <p className="label-tiny mt-2 sm:col-span-2">Cavalo</p>
            <div>
              <Label className="label-tiny mb-1.5 block">Placa</Label>
              <Input
                value={creating.plate}
                onChange={(event) => setCreating({ ...creating, plate: event.target.value })}
                className="h-9 font-sans uppercase"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Marca</Label>
              <Input
                value={creating.brand}
                onChange={(event) => setCreating({ ...creating, brand: event.target.value })}
                className="h-9"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="label-tiny mb-1.5 block">Modelo</Label>
              <Input
                value={creating.model}
                onChange={(event) => setCreating({ ...creating, model: event.target.value })}
                className="h-9"
              />
            </div>

            <p className="label-tiny mt-2 sm:col-span-2">Carreta (opcional)</p>
            <div>
              <Label className="label-tiny mb-1.5 block">Placa da carreta</Label>
              <Input
                value={creating.trailerIdentifier}
                onChange={(event) =>
                  setCreating({ ...creating, trailerIdentifier: event.target.value })
                }
                className="h-9 font-sans uppercase"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Tipo do implemento</Label>
              <Input
                value={creating.trailerImplementType}
                onChange={(event) =>
                  setCreating({ ...creating, trailerImplementType: event.target.value })
                }
                placeholder="Ex.: BASCULANTE"
                className="h-9"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={marking}
        onOpenChange={(open) => !open && setMarking(false)}
        title="Marcar existente como terceiro"
        footer={
          <>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setMarking(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-9"
              disabled={!markVehicleId || saving}
              onClick={handleMarkExisting}
            >
              {saving ? "Salvando..." : "Marcar como terceiro"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-surface/60 px-4 py-3 text-[12px] text-muted-foreground">
            O cavalo, o motorista e a carreta vinculados a ele passam a ser terceiros. Se houver
            frete em andamento, ele também passa a contar como terceiro.
          </div>
          <Select value={markVehicleId} onValueChange={setMarkVehicleId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Selecione o cavalo..." />
            </SelectTrigger>
            <SelectContent>
              {ownVehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  <span className="font-sans font-semibold">{vehicle.plate}</span>
                  {vehicle.driverId && driversById.get(vehicle.driverId)
                    ? ` - ${driversById.get(vehicle.driverId)!.name}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Modal>
    </>
  );
}
