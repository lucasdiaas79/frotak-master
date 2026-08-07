import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFleet } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { stageFromLegacyStatus } from "@/lib/freight-workflow";
import { vehicleTrailerLabel } from "@/lib/vehicle-trailers";
import {
  ALL_SITUATIONS,
  ALL_STATUSES,
  UFS,
  VEHICLE_SITUATION_LABEL,
  VEHICLE_STATUS_LABEL,
  VEHICLE_TYPES,
  isAvailableVehicleSituation,
} from "@/lib/types";
import type { Vehicle } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { Download, Eye, MapPin, Pencil, Plus, Search, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/veiculos")({
  head: () => ({
    meta: [
      { title: "Veículos - Central Transportes" },
      { name: "description", content: "Gestão de veículos da frota." },
    ],
  }),
  component: VeiculosPage,
});

const blank: Vehicle = {
  id: "",
  workflowVersion: 0,
  workflowFlags: {},
  plate: "",
  type: "CAVALO TRATOR",
  fleetKind: "CAVALO TRATOR",
  brand: "",
  model: "",
  renavam: "",
  status: "disponivel-patio",
  situation: "disponivel-patio",
  city: "",
  state: "SP",
  lat: -23.55,
  lng: -46.63,
  updatedAt: new Date().toISOString(),
};

function VeiculosPage() {
  const { vehicles, drivers, trailers, upsertVehicle, deleteVehicle, link } = useFleet();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [ufF, setUfF] = useState<string>("all");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [viewing, setViewing] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (search) {
        const haystack = [
          v.type,
          v.fleetKind,
          v.brand,
          v.model,
          v.manufactureYear,
          v.plate,
          v.renavam,
          v.city,
          v.state,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (statusF !== "all" && v.status !== statusF) return false;
      if (ufF !== "all" && v.state !== ufF) return false;
      return true;
    });
  }, [vehicles, search, statusF, ufF]);

  const driverName = (id?: string) => drivers.find((d) => d.id === id)?.name ?? "-";
  const trailerName = (vehicle: Vehicle) => vehicleTrailerLabel(vehicle, trailers);
  const exportCsv = () => {
    const header =
      "Tipo;Marca;Modelo;Ano;Placa;Renavam;Situação;Status;Motorista;Caçamba;Cidade;UF\n";
    const rows = filtered
      .map(
        (v) =>
          `${v.fleetKind || v.type};${v.brand ?? ""};${v.model ?? ""};${v.manufactureYear ?? ""};${v.plate};${v.renavam ?? ""};${VEHICLE_SITUATION_LABEL[v.situation]};${VEHICLE_STATUS_LABEL[v.status]};${driverName(v.driverId)};${trailerName(v)};${v.city};${v.state}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "veiculos.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  };

  const onSave = async () => {
    if (!editing) return;
    if (!editing.plate.trim()) return toast.error("Informe a placa");
    if (!editing.type.trim()) return toast.error("Informe o tipo");
    const original = vehicles.find((vehicle) => vehicle.id === editing.id);
    const normalized: Vehicle = {
      ...editing,
      id: editing.id || `v${Date.now()}`,
      plate: editing.plate
        .trim()
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase(),
      type: editing.type.trim().toUpperCase(),
      fleetKind: (editing.fleetKind || editing.type).trim().toUpperCase(),
      brand: editing.brand?.trim().toUpperCase(),
      model: editing.model?.trim().toUpperCase(),
      renavam: editing.renavam?.trim().replace(/\D/g, ""),
      status:
        editing.situation === "disponivel-patio"
          ? "disponivel-patio"
          : editing.situation === "disponivel-oficina"
            ? "disponivel-oficina"
            : editing.status,
      freightStage: isAvailableVehicleSituation(editing.situation)
        ? "DISPONIVEL"
        : stageFromLegacyStatus(editing.status),
    };
    const desiredDriverId = normalized.driverId;
    const saved = await upsertVehicle({
      ...normalized,
      driverId: original?.driverId,
    });
    if ((original?.driverId ?? "") !== (normalized.driverId ?? "")) {
      await link(saved.id, desiredDriverId, saved.trailerId, {
        trailerIds: saved.trailerIds,
        senderId: saved.senderId,
        recipientId: saved.recipientId,
        freightValue: saved.freightValue,
      });
    }
    toast.success("Ve?culo salvo");
    setEditing(null);
  };

  const onDelete = () => {
    if (!deleting) return;
    deleteVehicle(deleting.id);
    toast.success("Ve?culo removido");
    setDeleting(null);
  };

  return (
    <>
      <PageHeader
        title="Veículos"
        subtitle={`${filtered.length} de ${vehicles.length} veículos cadastrados`}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 text-[12px]" onClick={exportCsv}>
              <Download className="size-3.5" /> Exportar
            </Button>
            <Button
              size="sm"
              className="h-9 text-[12px]"
              onClick={() => setEditing({ ...blank, id: "" })}
            >
              <Plus className="size-3.5" /> Novo veículo
            </Button>
          </>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-tiny">Filtros da frota</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">Localizar veículo</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-start text-[12px]"
            onClick={() => {
              setSearch("");
              setStatusF("all");
              setUfF("all");
            }}
          >
            <X className="size-3.5" /> Limpar filtros
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_240px_140px]">
          <div>
            <Label className="label-tiny mb-1.5 block">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar placa, marca, modelo ou Renavam"
                className="h-10 pl-9 text-[12.5px]"
              />
            </div>
          </div>
          <div>
            <Label className="label-tiny mb-1.5 block">Status</Label>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="h-10 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {VEHICLE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="label-tiny mb-1.5 block">UF</Label>
            <Select value={ufF} onValueChange={setUfF}>
              <SelectTrigger className="h-10 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Cadastro operacional</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">Veículos da base</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <Truck className="size-3.5" />
            {filtered.length} registros
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1220px]">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Ano</th>
                <th>Placa</th>
                <th>Renavam</th>
                <th>Situação</th>
                <th>Status</th>
                <th>Motorista</th>
                <th>Caçamba</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <span className="font-sans text-[12.5px] font-bold text-foreground">
                      {v.fleetKind || v.type}
                    </span>
                  </td>
                  <td className="font-sans text-[12.5px]">{v.brand || "-"}</td>
                  <td className="text-muted-foreground">{v.model || "-"}</td>
                  <td className="font-sans text-[12.5px]">{v.manufactureYear || "-"}</td>
                  <td>
                    <div className="flex min-w-[150px] items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <Truck className="size-4" />
                      </span>
                      <div>
                        <div className="font-sans text-[13px] font-extrabold text-foreground">
                          {v.plate}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="size-3" />
                          {v.city}/{v.state}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="font-sans text-[12.5px]">{v.renavam || "-"}</td>
                  <td>{VEHICLE_SITUATION_LABEL[v.situation]}</td>
                  <td>
                    <StatusBadge status={v.status} full />
                  </td>
                  <td className="font-medium">{driverName(v.driverId)}</td>
                  <td className="font-sans text-[12px] text-muted-foreground">
                    {trailerName(v)}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewing(v)}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        title="Visualizar"
                      >
                        <Eye className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(v)}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(v)}
                        className="inline-flex size-8 items-center justify-center rounded-full text-destructive transition hover:bg-destructive/10"
                        title="Excluir"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <Search className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum veículo encontrado
                      </span>
                      <span className="text-[12px]">
                        Ajuste os filtros para ampliar a consulta.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? `Editar veículo ${editing.plate}` : "Novo veículo"}
        footer={
          <>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-9" onClick={onSave}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                value={editing.fleetKind || editing.type}
                onValueChange={(v) => setEditing({ ...editing, type: v, fleetKind: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Marca">
              <Input
                value={editing.brand ?? ""}
                onChange={(e) => setEditing({ ...editing, brand: e.target.value })}
                className="h-9"
                placeholder="SCANIA"
              />
            </Field>
            <Field label="Modelo">
              <Input
                value={editing.model ?? ""}
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                className="h-9"
                placeholder="P - 340 A 6X2"
              />
            </Field>
            <Field label="Ano">
              <Input
                value={editing.manufactureYear ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    manufactureYear: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-9 font-sans"
                inputMode="numeric"
                placeholder="2011"
              />
            </Field>
            <Field label="Placa">
              <Input
                value={editing.plate}
                onChange={(e) => setEditing({ ...editing, plate: e.target.value.toUpperCase() })}
                className="h-9 font-sans"
                placeholder="NVJ1627"
              />
            </Field>
            <Field label="Renavam">
              <Input
                value={editing.renavam ?? ""}
                onChange={(e) => setEditing({ ...editing, renavam: e.target.value })}
                className="h-9 font-sans"
                inputMode="numeric"
                placeholder="00349186146"
              />
            </Field>
            <Field label="Motorista" full>
              <Select
                value={editing.driverId ?? "none"}
                onValueChange={(value) =>
                  setEditing({ ...editing, driverId: value === "none" ? undefined : value })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem motorista vinculado</SelectItem>
                  {drivers
                    .filter((driver) => driver.active)
                    .map((driver) => {
                      const linkedVehicle = vehicles.find(
                        (vehicle) => vehicle.driverId === driver.id,
                      );
                      const linkedLabel =
                        linkedVehicle && linkedVehicle.id !== editing.id
                          ? ` · vinculado em ${linkedVehicle.plate}`
                          : "";

                      return (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.name}
                          {linkedLabel}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Situação operacional" full>
              <Select
                value={editing.situation}
                onValueChange={(value) =>
                  setEditing({ ...editing, situation: value as Vehicle["situation"] })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SITUATIONS.map((situation) => (
                    <SelectItem key={situation} value={situation}>
                      {VEHICLE_SITUATION_LABEL[situation]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status operacional" full>
              <Select
                value={editing.status}
                onValueChange={(value) =>
                  setEditing({ ...editing, status: value as Vehicle["status"] })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {VEHICLE_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cidade">
              <Input
                value={editing.city}
                onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                className="h-9"
              />
            </Field>
            <Field label="UF">
              <Select
                value={editing.state}
                onValueChange={(v) => setEditing({ ...editing, state: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Latitude">
              <Input
                type="number"
                step="0.0001"
                value={editing.lat}
                onChange={(e) => setEditing({ ...editing, lat: parseFloat(e.target.value) })}
                className="h-9 font-sans"
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="0.0001"
                value={editing.lng}
                onChange={(e) => setEditing({ ...editing, lng: parseFloat(e.target.value) })}
                className="h-9 font-sans"
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={`Ve?culo ${viewing?.plate ?? ""}`}
      >
        {viewing && (
          <dl className="grid gap-3 text-[12.5px] sm:grid-cols-2">
            <Info
              label="Placa"
              value={<span className="font-sans font-semibold">{viewing.plate}</span>}
            />
            <Info label="Tipo" value={viewing.fleetKind || viewing.type} />
            <Info label="Marca" value={viewing.brand || "-"} />
            <Info label="Modelo" value={viewing.model || "-"} />
            <Info label="Ano" value={viewing.manufactureYear || "-"} />
            <Info
              label="Renavam"
              value={<span className="font-sans">{viewing.renavam || "-"}</span>}
            />
            <Info label="Status" value={<StatusBadge status={viewing.status} full />} />
            <Info label="Situação" value={VEHICLE_SITUATION_LABEL[viewing.situation]} />
            <Info label="Atualizado" value={formatRelative(viewing.updatedAt)} />
            <Info label="Motorista" value={driverName(viewing.driverId)} />
            <Info
              label="Caçamba"
              value={<span className="font-sans">{trailerName(viewing)}</span>}
            />
            <Info label="Cidade" value={`${viewing.city}/${viewing.state}`} />
            <Info
              label="Coordenadas"
              value={
                <span className="font-sans">
                  {viewing.lat.toFixed(4)}, {viewing.lng.toFixed(4)}
                </span>
              }
            />
          </dl>
        )}
      </Modal>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo {deleting?.plate}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o cadastro selecionado da frota. Confirme apenas se o veículo não
              deve permanecer disponível na operação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="label-tiny mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/55 px-3 py-2.5">
      <dt className="label-tiny">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
