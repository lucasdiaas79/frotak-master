import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, MapPin, Pencil, Plus, Search } from "lucide-react";
import {
  GoogleLocationPicker,
  type GoogleLocationSelection,
} from "@/components/GoogleLocationPicker";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { searchPlaceSuggestions, type PlaceSuggestion } from "@/lib/geocoding";
import { useFleet } from "@/lib/store";
import { UFS } from "@/lib/types";
import type { Recipient, Sender } from "@/lib/types";
import { cn } from "@/lib/utils";

type CustomerRole = "sender" | "recipient" | "both";
type LocationSource = "geocoded" | "manual";

interface CustomerRow {
  key: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  address?: string;
  locationLabel?: string;
  locationSource?: LocationSource;
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  active: boolean;
  senderId?: string;
  recipientId?: string;
  senderActive?: boolean;
  recipientActive?: boolean;
}

interface FormState {
  key?: string;
  senderId?: string;
  recipientId?: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  address: string;
  postalCode: string;
  locationLabel: string;
  locationSource?: LocationSource;
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  active: boolean;
  asSender: boolean;
  asRecipient: boolean;
}

const EMPTY: FormState = {
  name: "",
  cnpj: "",
  city: "",
  state: "SE",
  address: "",
  postalCode: "",
  locationLabel: "",
  active: true,
  asSender: true,
  asRecipient: false,
};

function normalizeDoc(value: string) {
  return value.replace(/\D/g, "");
}

function customerKey(input: { cnpj?: string; name?: string; city?: string; state?: string }) {
  const cnpj = normalizeDoc(input.cnpj ?? "");
  if (cnpj) return `cnpj:${cnpj}`;
  return `name:${(input.name ?? "").trim().toLowerCase()}|city:${(input.city ?? "").trim().toLowerCase()}|state:${(input.state ?? "").trim().toLowerCase()}`;
}

function roleOf(row: CustomerRow): CustomerRole {
  if (row.senderId && row.recipientId) return "both";
  if (row.senderId) return "sender";
  return "recipient";
}

function hasCoords(input: { lat?: number; lng?: number }) {
  return Number.isFinite(input.lat) && Number.isFinite(input.lng);
}

function locationLabel(input: CustomerRow) {
  return (
    input.locationLabel || input.address || [input.city, input.state].filter(Boolean).join("/")
  );
}

function formatCoords(lat?: number, lng?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "-";
  return `${lat!.toFixed(5)}, ${lng!.toFixed(5)}`;
}

function locationFromParty(p: Sender | Recipient) {
  return {
    address: p.address,
    locationLabel: p.locationLabel,
    locationSource: p.locationSource,
    lat: p.lat,
    lng: p.lng,
    geocodedAt: p.geocodedAt,
  };
}

function mergeLocation(current: CustomerRow | undefined, party: Sender | Recipient) {
  const partyLocation = locationFromParty(party);
  if (!current || !hasCoords(current)) return partyLocation;
  return {};
}

export function CustomersPage() {
  const store = useFleet();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [roleF, setRoleF] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  const rows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();

    for (const sender of store.senders) {
      const key = customerKey(sender);
      const current = map.get(key);
      map.set(key, {
        key,
        name: current?.name || sender.name,
        cnpj: current?.cnpj || sender.cnpj,
        city: current?.city || sender.city,
        state: current?.state || sender.state,
        ...locationFromParty(sender),
        active: current?.active ?? sender.active,
        senderId: sender.id,
        senderActive: sender.active,
        recipientId: current?.recipientId,
        recipientActive: current?.recipientActive,
      });
    }

    for (const recipient of store.recipients) {
      const key = customerKey(recipient);
      const current = map.get(key);
      map.set(key, {
        key,
        name: current?.name || recipient.name,
        cnpj: current?.cnpj || recipient.cnpj,
        city: current?.city || recipient.city,
        state: current?.state || recipient.state,
        ...mergeLocation(current, recipient),
        active: current?.active ?? recipient.active,
        senderId: current?.senderId,
        senderActive: current?.senderActive,
        recipientId: recipient.id,
        recipientActive: recipient.active,
      });
    }

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        active:
          row.senderId && row.recipientId
            ? !!row.senderActive || !!row.recipientActive
            : row.senderId
              ? !!row.senderActive
              : !!row.recipientActive,
      }))
      .filter((row) => {
        const haystack =
          `${row.name} ${row.cnpj} ${row.city} ${row.state} ${row.address ?? ""} ${row.locationLabel ?? ""}`.toLowerCase();
        if (search && !haystack.includes(search.toLowerCase())) return false;
        if (statusF === "active" && !row.active) return false;
        if (statusF === "inactive" && row.active) return false;
        if (roleF !== "all" && roleOf(row) !== roleF) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roleF, search, statusF, store.recipients, store.senders]);

  const openNew = () => {
    setForm(EMPTY);
    setSuggestions([]);
    setOpen(true);
  };

  const openEdit = (row: CustomerRow) => {
    setForm({
      key: row.key,
      senderId: row.senderId,
      recipientId: row.recipientId,
      name: row.name,
      cnpj: row.cnpj,
      city: row.city,
      state: row.state,
      address: row.address ?? "",
      postalCode: "",
      locationLabel: row.locationLabel ?? "",
      locationSource: row.locationSource,
      lat: row.lat,
      lng: row.lng,
      geocodedAt: row.geocodedAt,
      active: row.active,
      asSender: !!row.senderId,
      asRecipient: !!row.recipientId,
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
      if (found.length === 0)
        toast("Nenhuma sugestao encontrada. Ajuste os dados e busque novamente.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao buscar localizacao.");
    } finally {
      setSearchingLocation(false);
    }
  };

  const applySuggestion = (suggestion: PlaceSuggestion) => {
    setForm((current) => ({
      ...current,
      address: current.address || suggestion.address || current.address,
      locationLabel: suggestion.label,
      lat: suggestion.lat,
      lng: suggestion.lng,
      locationSource: "geocoded",
      geocodedAt: new Date().toISOString(),
    }));
  };

  const applyGoogleLocation = (selection: GoogleLocationSelection) => {
    setForm((current) => ({
      ...current,
      address: selection.address || current.address,
      postalCode: selection.postalCode,
      city: selection.city || current.city,
      state: selection.state || current.state,
      locationLabel: selection.label,
      lat: selection.lat,
      lng: selection.lng,
      locationSource: selection.source,
      geocodedAt: new Date().toISOString(),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (!form.asSender && !form.asRecipient) return;
    setSaving(true);

    const payload = {
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
      if (form.asSender) {
        if (form.senderId) await store.updateSender({ id: form.senderId, ...payload });
        else await store.addSender(payload);
      } else if (form.senderId) {
        await store.deleteSender(form.senderId);
      }

      if (form.asRecipient) {
        if (form.recipientId) await store.updateRecipient({ id: form.recipientId, ...payload });
        else await store.addRecipient(payload);
      } else if (form.recipientId) {
        await store.deleteRecipient(form.recipientId);
      }

      setOpen(false);
      setForm(EMPTY);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Cadastro de Clientes"
        subtitle={`${rows.length} clientes com papel de remetente, destinatario ou ambos`}
        actions={
          <Button onClick={openNew} size="sm" className="h-9 gap-1.5 text-[12.5px]">
            <Plus className="size-3.5" />
            Novo cliente
          </Button>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-tiny">Filtros de cadastro</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Consultar clientes da operacao
            </h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou CNPJ..."
              className="h-10 pl-9 text-[12.5px]"
            />
          </div>
          <Select value={roleF} onValueChange={setRoleF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os papeis</SelectItem>
              <SelectItem value="sender">Somente remetente</SelectItem>
              <SelectItem value="recipient">Somente destinatario</SelectItem>
              <SelectItem value="both">Remetente e destinatario</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
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
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Clientes da operacao
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <Building2 className="size-3.5" />
            {rows.length} registros
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Localizacao</th>
                <th>Papel</th>
                <th>Status</th>
                <th className="text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <Building2 className="size-4" />
                      </span>
                      <span className="font-semibold text-foreground">{row.name}</span>
                    </div>
                  </td>
                  <td className="font-sans text-[12px] text-muted-foreground">{row.cnpj || "-"}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {[row.city, row.state].filter(Boolean).join("/") || "-"}
                    </span>
                  </td>
                  <td>
                    <div className="max-w-[280px]">
                      <span className="block truncate text-[12.5px] font-semibold text-foreground">
                        {locationLabel(row) || "-"}
                      </span>
                      <span className="font-sans text-[11px] text-muted-foreground">
                        {hasCoords(row) ? "Confirmado" : "Pendente"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <RoleBadge role={roleOf(row)} />
                  </td>
                  <td>
                    <StatusPill active={row.active} />
                  </td>
                  <td className="text-right">
                    <button
                      title="Editar"
                      onClick={() => openEdit(row)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <Search className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum cliente encontrado
                      </span>
                      <span className="text-[12px]">Revise a busca ou os filtros aplicados.</span>
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
        title={form.key ? "Editar cliente" : "Novo cliente"}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-9" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="h-9 min-w-24" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 text-[12.5px] xl:grid-cols-[minmax(360px,0.9fr)_minmax(460px,1.1fr)]">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <div className="label-tiny mb-1.5">Nome</div>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <div className="label-tiny mb-1.5">CNPJ</div>
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="h-9 font-sans"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-surface/60 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="label-tiny">Local exato</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    Busque pelo nome, endereco, terminal, fazenda, porto ou pedreira.
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

              {suggestions.length > 0 ? (
                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="flex w-full items-start gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primary/10"
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[11.5px] font-semibold">
                          {suggestion.label}
                        </span>
                        <span className="mt-1 inline-flex rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                          {suggestion.provider === "google" ? "Google Maps" : "Mapa aberto"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[11.5px] font-semibold text-muted-foreground">
                  Preencha nome, cidade ou endereco e clique em buscar.
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(150px,0.6fr)_90px]">
              <div>
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
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
                <div>
                  <div className="label-tiny">Remetente</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    Pode originar cargas
                  </div>
                </div>
                <Switch
                  checked={form.asSender}
                  onCheckedChange={(checked) => setForm({ ...form, asSender: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
                <div>
                  <div className="label-tiny">Destinatario</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    Pode receber cargas
                  </div>
                </div>
                <Switch
                  checked={form.asRecipient}
                  onCheckedChange={(checked) => setForm({ ...form, asRecipient: checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
                <div>
                  <div className="label-tiny">Status</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">Cliente disponivel</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">
                    {form.active ? "Ativo" : "Inativo"}
                  </span>
                  <Switch
                    checked={form.active}
                    onCheckedChange={(checked) => setForm({ ...form, active: checked })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <GoogleLocationPicker
              lat={form.lat}
              lng={form.lng}
              postalCode={form.postalCode}
              onChange={applyGoogleLocation}
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
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em]",
        active
          ? "border-success/20 bg-success/10 text-success"
          : "border-border bg-muted/55 text-muted-foreground",
      )}
    >
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function RoleBadge({ role }: { role: CustomerRole }) {
  const copy =
    role === "both" ? "Remetente e destinatario" : role === "sender" ? "Remetente" : "Destinatario";
  const tone =
    role === "both"
      ? "border-primary/20 bg-primary/10 text-primary"
      : role === "sender"
        ? "border-success/20 bg-success/10 text-success"
        : "border-maintenance/20 bg-maintenance/10 text-maintenance";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em]",
        tone,
      )}
    >
      {copy}
    </span>
  );
}
