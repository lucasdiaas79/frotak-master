import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFleet } from "@/lib/store";
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
import type { Trailer } from "@/lib/types";
import { TRAILER_TYPES } from "@/lib/types";
import { Container, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/carretas")({
  head: () => ({
    meta: [
      { title: "Carretas - Central Transportes" },
      { name: "description", content: "Gestão de carretas e implementos." },
    ],
  }),
  component: CarretasPage,
});

const blank: Trailer = {
  id: "",
  identifier: "",
  type: "IMPLEMENTO",
  fleetKind: "IMPLEMENTO",
  brand: "",
  model: "",
  renavam: "",
  implementType: "",
  implementModel: "",
};

function CarretasPage() {
  const { trailers, vehicles, upsertTrailer } = useFleet();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Trailer | null>(null);

  const filtered = useMemo(() => {
    return trailers
      .filter((t) => {
        if (filter === "linked" && !t.vehicleId) return false;
        if (filter === "free" && t.vehicleId) return false;
        if (search) {
          const haystack = [
            t.type,
            t.fleetKind,
            t.brand,
            t.model,
            t.manufactureYear,
            t.identifier,
            t.renavam,
            t.implementType,
            t.implementModel,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aSeq = a.fleetSeq ?? Number.MAX_SAFE_INTEGER;
        const bSeq = b.fleetSeq ?? Number.MAX_SAFE_INTEGER;
        if (aSeq !== bSeq) return aSeq - bSeq;
        return a.identifier.localeCompare(b.identifier);
      });
  }, [trailers, filter, search]);

  const vehiclePlate = (id?: string) => vehicles.find((v) => v.id === id)?.plate ?? "-";

  const onSave = () => {
    if (!editing) return;
    if (!editing.identifier.trim()) return toast.error("Informe a placa");
    if (!editing.type.trim()) return toast.error("Informe o tipo");
    const normalized: Trailer = {
      ...editing,
      id: editing.id || `t${Date.now()}`,
      identifier: editing.identifier
        .trim()
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase(),
      type: editing.type.trim().toUpperCase(),
      fleetKind: (editing.fleetKind || editing.type).trim().toUpperCase(),
      brand: editing.brand?.trim().toUpperCase(),
      model: editing.model?.trim().toUpperCase(),
      renavam: editing.renavam?.trim().replace(/\D/g, ""),
      implementType: editing.implementType?.trim().toUpperCase(),
      implementModel: editing.implementModel?.trim().toUpperCase(),
    };
    upsertTrailer(normalized);
    toast.success("Carreta salva");
    setEditing(null);
  };

  return (
    <>
      <PageHeader
        title="Carretas"
        subtitle={`${filtered.length} de ${trailers.length} carretas cadastradas`}
        actions={
          <Button size="sm" className="h-9 text-[12px]" onClick={() => setEditing({ ...blank })}>
            <Plus className="size-3.5" /> Nova carreta
          </Button>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-tiny">Filtros de equipamento</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">Consultar carretas</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar placa, marca, modelo, Renavam ou modelo do implemento"
              className="h-10 pl-9 text-[12.5px] font-sans"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="linked">Acopladas</SelectItem>
              <SelectItem value="free">Livres</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Cadastro administrativo</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Carretas da operação
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <Container className="size-3.5" />
            {filtered.length} registros
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1160px]">
            <thead>
              <tr>
                <th>Nº Seq.</th>
                <th>Tipo implemento</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Ano</th>
                <th>Placa</th>
                <th>Renavam</th>
                <th>Modelo implemento</th>
                <th>Veículo vinculado</th>
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="font-sans text-[12.5px]">{t.fleetSeq || "-"}</td>
                  <td>
                    <span className="font-sans text-[12.5px] font-bold text-foreground">
                      {t.implementType || t.fleetKind || t.type || "-"}
                    </span>
                  </td>
                  <td className="font-sans text-[12.5px]">{t.brand || "-"}</td>
                  <td className="text-muted-foreground">{t.model || "-"}</td>
                  <td className="font-sans text-[12.5px]">{t.manufactureYear || "-"}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <Container className="size-4" />
                      </span>
                      <span className="font-sans text-[13px] font-extrabold text-foreground">
                        {t.identifier}
                      </span>
                    </div>
                  </td>
                  <td className="font-sans text-[12.5px]">{t.renavam || "-"}</td>
                  <td className="font-sans text-[12.5px]">{t.implementModel || "-"}</td>
                  <td className="font-sans text-[12.5px]">{vehiclePlate(t.vehicleId)}</td>
                  <td>
                    <StatusPill linked={!!t.vehicleId} />
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setEditing(t)}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
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
                        Nenhuma carreta encontrada
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
        title={editing?.id ? "Editar carreta" : "Nova carreta"}
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
            <div>
              <Label className="label-tiny mb-1.5 block">Nº Seq.</Label>
              <Input
                value={editing.fleetSeq ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    fleetSeq: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-9 font-sans"
                inputMode="numeric"
                placeholder="1"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Tipo</Label>
              <Select
                value={editing.fleetKind || editing.type}
                onValueChange={(v) => setEditing({ ...editing, type: v, fleetKind: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAILER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Marca</Label>
              <Input
                value={editing.brand ?? ""}
                onChange={(e) => setEditing({ ...editing, brand: e.target.value })}
                className="h-9 font-sans"
                placeholder="NOMA"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Modelo</Label>
              <Input
                value={editing.model ?? ""}
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                className="h-9 font-sans"
                placeholder="SR/SR3E27 BCM"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Ano</Label>
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
                placeholder="2013"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Placa</Label>
              <Input
                value={editing.identifier}
                onChange={(e) =>
                  setEditing({ ...editing, identifier: e.target.value.toUpperCase() })
                }
                className="h-9 font-sans"
                placeholder="AWV9G47"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Renavam</Label>
              <Input
                value={editing.renavam ?? ""}
                onChange={(e) => setEditing({ ...editing, renavam: e.target.value })}
                className="h-9 font-sans"
                inputMode="numeric"
                placeholder="00535093012"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Tipo implemento</Label>
              <Input
                value={editing.implementType ?? ""}
                onChange={(e) => setEditing({ ...editing, implementType: e.target.value })}
                className="h-9 font-sans"
                placeholder="BASCULANTE"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Modelo implemento</Label>
              <Input
                value={editing.implementModel ?? ""}
                onChange={(e) => setEditing({ ...editing, implementModel: e.target.value })}
                className="h-9 font-sans"
                placeholder="VANDERLEIA"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function StatusPill({ linked }: { linked: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${
        linked
          ? "border-success/25 bg-success/10 text-success"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${linked ? "bg-success ring-4 ring-success/15" : "bg-muted-foreground"}`}
      />
      {linked ? "Acoplada" : "Livre"}
    </span>
  );
}
