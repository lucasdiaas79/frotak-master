import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useFleet } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { LocationPickerMap } from "@/components/LocationPickerMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { searchPlaceSuggestions, type PlaceSuggestion } from "@/lib/geocoding";
import { UFS } from "@/lib/types";
import type { Recipient, Sender } from "@/lib/types";
import { Building2, Loader2, MapPin, Pencil, Plus, Search } from "lucide-react";

type Kind = "sender" | "recipient";
type LocationSource = "geocoded" | "manual";

interface Props {
  kind: Kind;
}

const COPY = {
  sender: {
    title: "Remetentes",
    subtitle: "Empresas de origem das cargas",
    btn: "Adicionar remetente",
    modalNew: "Novo remetente",
    modalEdit: "Editar remetente",
    tableTitle: "Origem das operacoes",
    filterTitle: "Consultar remetentes",
    locationTitle: "Local de coleta",
    locationHint: "Confirme a sugestao ou marque no mapa.",
  },
  recipient: {
    title: "Destinatarios",
    subtitle: "Empresas de destino das cargas",
    btn: "Adicionar destinatario",
    modalNew: "Novo destinatario",
    modalEdit: "Editar destinatario",
    tableTitle: "Destino das operacoes",
    filterTitle: "Consultar destinatarios",
    locationTitle: "Local de entrega",
    locationHint: "Confirme a sugestao ou marque no mapa.",
  },
} as const;

interface FormState {
  id?: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  address: string;
  locationLabel: string;
  locationSource?: LocationSource;
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  cnpj: "",
  city: "",
  state: "SE",
  address: "",
  locationLabel: "",
  active: true,
};

function partyLocationLabel(p: Sender | Recipient) {
  return p.locationLabel || p.address || [p.city, p.state].filter(Boolean).join("/");
}

function locationStatus(p: Sender | Recipient) {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) ? "Confirmado" : "Pendente";
}

function formatCoords(lat?: number, lng?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "-";
  return `${lat!.toFixed(5)}, ${lng!.toFixed(5)}`;
}

export function PartiesPage({ kind }: Props) {
  const copy = COPY[kind];
  const store = useFleet();
  const list = kind === "sender" ? store.senders : store.recipients;

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  const rows = useMemo(() => {
    return list.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusF === "active" && !p.active) return false;
      if (statusF === "inactive" && p.active) return false;
      return true;
    });
  }, [list, search, statusF]);

  const openNew = () => {
    setForm(EMPTY);
    setSuggestions([]);
    setOpen(true);
  };

  const openEdit = (p: Sender | Recipient) => {
    setForm({
      id: p.id,
      name: p.name,
      cnpj: p.cnpj,
      city: p.city,
      state: p.state,
      address: p.address ?? "",
      locationLabel: p.locationLabel ?? "",
      locationSource: p.locationSource,
      lat: p.lat,
      lng: p.lng,
      geocodedAt: p.geocodedAt,
      active: p.active,
    });
    setSuggestions([]);
    setOpen(true);
  };

  const handleSearchLocation = async () => {
    if (![form.name, form.address, form.city].some((value) => value.trim())) {
      toast.error("Informe nome, endereco ou cidade para buscar.");
      return;
    }

    setSearchingLocation(true);
    try {
      const found = await searchPlaceSuggestions(form);
      setSuggestions(found);
      if (found.length === 0) {
        toast("Nenhuma sugestao encontrada. Marque o ponto no mapa.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao buscar localizacao.");
    } finally {
      setSearchingLocation(false);
    }
  };

  const applySuggestion = (suggestion: PlaceSuggestion) => {
    setForm((current) => ({
      ...current,
      locationLabel: suggestion.label,
      lat: suggestion.lat,
      lng: suggestion.lng,
      locationSource: "geocoded",
      geocodedAt: new Date().toISOString(),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      id: form.id,
      name: form.name.trim(),
      cnpj: form.cnpj.trim(),
      city: form.city.trim(),
      state: form.state,
      address: form.address.trim(),
      locationLabel: form.locationLabel.trim(),
      locationSource: form.locationSource,
      lat: form.lat,
      lng: form.lng,
      geocodedAt: form.geocodedAt,
      active: form.active,
    };

    try {
      if (kind === "sender") {
        if (form.id) await store.updateSender(payload as Sender);
        else await store.addSender(payload as Omit<Sender, "id"> & { id?: string });
      } else {
        if (form.id) await store.updateRecipient(payload as Recipient);
        else await store.addRecipient(payload as Omit<Recipient, "id"> & { id?: string });
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={copy.title}
        subtitle={`${rows.length} de ${list.length} cadastros - ${copy.subtitle}`}
        actions={
          <Button onClick={openNew} size="sm" className="h-9 gap-1.5 text-[12.5px]">
            <Plus className="size-3.5" />
            {copy.btn}
          </Button>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-tiny">Filtros de cadastro</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">{copy.filterTitle}</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="h-10 pl-9 text-[12.5px]"
            />
          </div>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Cadastro administrativo</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">{copy.tableTitle}</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <Building2 className="size-3.5" />
            {rows.length} registros
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[920px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Localizacao</th>
                <th>Status</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <Building2 className="size-4" />
                      </span>
                      <span className="font-semibold text-foreground">{p.name}</span>
                    </div>
                  </td>
                  <td className="font-sans text-[12px] text-muted-foreground">{p.cnpj || "-"}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {[p.city, p.state].filter(Boolean).join("/") || "-"}
                    </span>
                  </td>
                  <td>
                    <div className="max-w-[280px]">
                      <span className="block truncate text-[12.5px] font-semibold text-foreground">
                        {partyLocationLabel(p) || "-"}
                      </span>
                      <span className="font-sans text-[11px] text-muted-foreground">
                        {locationStatus(p)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusPill active={p.active} />
                  </td>
                  <td className="text-right">
                    <button
                      title="Editar"
                      onClick={() => openEdit(p)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <Search className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum cadastro encontrado
                      </span>
                      <span className="text-[12px]">Revise a busca ou o filtro de status.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={form.id ? copy.modalEdit : copy.modalNew}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-9" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="h-9 min-w-24" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 text-[12.5px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="label-tiny mb-1.5">Nome</div>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="label-tiny mb-1.5">CNPJ</div>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                className="h-9 font-sans"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="label-tiny mb-1.5">Endereco / referencia</div>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Rua, bairro, patio, terminal..."
                className="h-9"
              />
            </div>
            <div>
              <div className="label-tiny mb-1.5">Cidade</div>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <div className="label-tiny mb-1.5">UF</div>
              <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
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
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
              <div>
                <div className="label-tiny">Status</div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                  Cadastro disponivel para vinculo em despachos
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">
                  {form.active ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-surface/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="label-tiny">{copy.locationTitle}</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    {copy.locationHint}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5 text-[11.5px]"
                  onClick={handleSearchLocation}
                  disabled={searchingLocation}
                >
                  {searchingLocation ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Search className="size-3.5" />
                  )}
                  Buscar
                </Button>
              </div>

              {suggestions.length > 0 && (
                <div className="mt-3 max-h-36 space-y-2 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="flex w-full items-start gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/10"
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="line-clamp-2 text-[11.5px] font-semibold">
                        {suggestion.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <LocationPickerMap
              lat={form.lat}
              lng={form.lng}
              onChange={({ lat, lng }) =>
                setForm((current) => ({
                  ...current,
                  lat,
                  lng,
                  locationSource: "manual",
                  locationLabel:
                    current.locationLabel ||
                    current.address ||
                    [current.name, current.city, current.state].filter(Boolean).join(", "),
                  geocodedAt: new Date().toISOString(),
                }))
              }
              className="h-56 overflow-hidden rounded-2xl border border-border bg-surface-2"
            />

            <div className="rounded-2xl border border-border/70 bg-surface/60 px-3 py-2.5">
              <div className="label-tiny">Ponto confirmado</div>
              <div className="mt-1 truncate text-[12px] font-semibold text-foreground">
                {form.locationLabel || form.address || "-"}
              </div>
              <div className="mt-1 font-sans text-[11px] text-muted-foreground">
                {formatCoords(form.lat, form.lng)}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${
        active
          ? "border-success/25 bg-success/10 text-success"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-success ring-4 ring-success/15" : "bg-muted-foreground"}`}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
