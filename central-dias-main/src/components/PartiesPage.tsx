import { useMemo, useState } from "react";
import { useFleet } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
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
import { UFS } from "@/lib/types";
import type { Recipient, Sender } from "@/lib/types";
import { Building2, MapPin, Pencil, Plus, Search } from "lucide-react";

type Kind = "sender" | "recipient";

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
    tableTitle: "Origem das operações",
    filterTitle: "Consultar remetentes",
  },
  recipient: {
    title: "Destinatários",
    subtitle: "Empresas de destino das cargas",
    btn: "Adicionar destinatário",
    modalNew: "Novo destinatário",
    modalEdit: "Editar destinatário",
    tableTitle: "Destino das operações",
    filterTitle: "Consultar destinatários",
  },
} as const;

interface FormState {
  id?: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
  active: boolean;
}

const EMPTY: FormState = { name: "", cnpj: "", city: "", state: "SP", active: true };

export function PartiesPage({ kind }: Props) {
  const copy = COPY[kind];
  const store = useFleet();
  const list = kind === "sender" ? store.senders : store.recipients;

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

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
    setOpen(true);
  };

  const openEdit = (p: Sender | Recipient) => {
    setForm({
      id: p.id,
      name: p.name,
      cnpj: p.cnpj,
      city: p.city,
      state: p.state,
      active: p.active,
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (kind === "sender") {
      if (form.id)
        store.updateSender({
          id: form.id,
          name: form.name,
          cnpj: form.cnpj,
          city: form.city,
          state: form.state,
          active: form.active,
        });
      else
        store.addSender({
          name: form.name,
          cnpj: form.cnpj,
          city: form.city,
          state: form.state,
          active: form.active,
        });
    } else {
      if (form.id)
        store.updateRecipient({
          id: form.id,
          name: form.name,
          cnpj: form.cnpj,
          city: form.city,
          state: form.state,
          active: form.active,
        });
      else
        store.addRecipient({
          name: form.name,
          cnpj: form.cnpj,
          city: form.city,
          state: form.state,
          active: form.active,
        });
    }
    setOpen(false);
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
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
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
                  <td className="font-sans text-[12px] text-muted-foreground">{p.cnpj}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {p.city}/{p.state}
                    </span>
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
                  <td colSpan={5} className="py-12 text-center">
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
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-9" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="h-9" onClick={save}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-[12.5px] sm:grid-cols-2">
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
                Cadastro disponível para vínculo em despachos
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

