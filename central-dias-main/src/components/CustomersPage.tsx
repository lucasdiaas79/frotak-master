import { useMemo, useState } from "react";
import { Building2, MapPin, Pencil, Plus, Search } from "lucide-react";
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
import { useFleet } from "@/lib/store";
import { UFS } from "@/lib/types";
import { cn } from "@/lib/utils";

type CustomerRole = "sender" | "recipient" | "both";

interface CustomerRow {
  key: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
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
  active: boolean;
  asSender: boolean;
  asRecipient: boolean;
}

const EMPTY: FormState = {
  name: "",
  cnpj: "",
  city: "",
  state: "SP",
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

export function CustomersPage() {
  const store = useFleet();
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [roleF, setRoleF] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

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
        const haystack = `${row.name} ${row.cnpj} ${row.city} ${row.state}`.toLowerCase();
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
      active: row.active,
      asSender: !!row.senderId,
      asRecipient: !!row.recipientId,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (!form.asSender && !form.asRecipient) return;

    const payload = {
      name: form.name.trim(),
      cnpj: form.cnpj.trim(),
      city: form.city.trim(),
      state: form.state,
      active: form.active,
    };

    if (form.asSender) {
      if (form.senderId) {
        await store.updateSender({ id: form.senderId, ...payload });
      } else {
        await store.addSender(payload);
      }
    } else if (form.senderId) {
      await store.deleteSender(form.senderId);
    }

    if (form.asRecipient) {
      if (form.recipientId) {
        await store.updateRecipient({ id: form.recipientId, ...payload });
      } else {
        await store.addRecipient(payload);
      }
    } else if (form.recipientId) {
      await store.deleteRecipient(form.recipientId);
    }

    setOpen(false);
    setForm(EMPTY);
  };

  return (
    <>
      <PageHeader
        title="Cadastro de Clientes"
        subtitle={`${rows.length} clientes com papel de remetente, destinatário ou ambos`}
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
              Consultar clientes da operação
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
              <SelectItem value="all">Todos os papéis</SelectItem>
              <SelectItem value="sender">Somente remetente</SelectItem>
              <SelectItem value="recipient">Somente destinatário</SelectItem>
              <SelectItem value="both">Remetente e destinatário</SelectItem>
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
              Clientes da operação
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <Building2 className="size-3.5" />
            {rows.length} registros
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Papel</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
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
                      {row.city}/{row.state}
                    </span>
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
                  <td colSpan={6} className="py-12 text-center">
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
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-9" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="h-9" onClick={() => void save()}>
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

          <div className="sm:col-span-2 grid gap-3 md:grid-cols-2">
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
                <div className="label-tiny">Destinatário</div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                  Pode receber cargas
                </div>
              </div>
              <Switch
                checked={form.asRecipient}
                onCheckedChange={(checked) => setForm({ ...form, asRecipient: checked })}
              />
            </div>
          </div>

          <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
            <div>
              <div className="label-tiny">Status</div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Cliente disponível para vínculo operacional
              </div>
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
    role === "both"
      ? "Remetente e destinatário"
      : role === "sender"
        ? "Remetente"
        : "Destinatário";
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

