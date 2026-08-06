import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2,
  Eye,
  Grid2x2,
  KeyRound,
  LayoutList,
  LogIn,
  Pencil,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Avatar,
  KpiCard,
  PageHeader,
  Panel,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Tr,
  toneFor,
} from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClientAccess, createClientImpersonationUrl } from "@/lib/auth";
import { clients as mockClients, permissionModules, type Client } from "@/lib/mock";
import { provisionTenant } from "@/lib/tenantProvisioning";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes - FrotaK Master" },
      {
        name: "description",
        content: "Cadastro e gestao dos clientes FrotaK.",
      },
    ],
  }),
  component: Clientes,
});

type MasterClient = Client & {
  tenantId: string;
  subscriptionPeriod: string;
  loginEmail: string;
  loginPassword: string;
  truckLimit: number;
};

type ClientFormState = {
  companyName: string;
  cnpj: string;
  subscriptionPeriod: string;
  loginEmail: string;
  loginPassword: string;
  truckLimit: string;
};

const emptyForm: ClientFormState = {
  companyName: "",
  cnpj: "",
  subscriptionPeriod: "Mensal",
  loginEmail: "",
  loginPassword: "123456",
  truckLimit: "10",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toMasterClient(client: Client): MasterClient {
  const slug = slugify(client.name).replace(/^transportadora-/, "");

  return {
    ...client,
    tenantId: slug === "central-transportes" ? "00000000-0000-0000-0000-000000000001" : client.id,
    subscriptionPeriod: "Mensal",
    loginEmail: `admin@${slug}.com.br`,
    loginPassword: "123456",
    truckLimit: client.vehicles,
  };
}

function clientToForm(client: MasterClient): ClientFormState {
  return {
    companyName: client.name,
    cnpj: client.cnpj,
    subscriptionPeriod: client.subscriptionPeriod,
    loginEmail: client.loginEmail,
    loginPassword: client.loginPassword,
    truckLimit: String(client.truckLimit),
  };
}

function formToClient(form: ClientFormState, existing?: MasterClient): MasterClient {
  const name = form.companyName.trim();
  const slug = slugify(name) || "cliente";
  const truckLimit = Math.max(0, Number(form.truckLimit) || 0);
  const id = existing?.id || crypto.randomUUID();

  return {
    id,
    tenantId: existing?.tenantId || id,
    name,
    cnpj: form.cnpj.trim(),
    plan: existing?.plan || "Business",
    status: existing?.status || "Ativo",
    uf: existing?.uf || "BR",
    city: existing?.city || "Nao informado",
    mrr: existing?.mrr || "R$ 0,0k",
    users: existing?.users || 1,
    drivers: existing?.drivers || 0,
    vehicles: truckLimit,
    freights: existing?.freights || 0,
    storage: existing?.storage || 0,
    api: existing?.api || 0,
    since: existing?.since || new Date().getFullYear().toString(),
    owner: existing?.owner || "FrotaK Master",
    domain: existing?.domain || `${slug}.frotak.app`,
    subscriptionPeriod: form.subscriptionPeriod,
    loginEmail: form.loginEmail.trim(),
    loginPassword: form.loginPassword,
    truckLimit,
  };
}

function Clientes() {
  const [view, setView] = useState<"tabela" | "cards">("tabela");
  const [clients, setClients] = useState<MasterClient[]>(() => mockClients.map(toMasterClient));
  const [createOpen, setCreateOpen] = useState(false);
  const [details, setDetails] = useState<MasterClient | null>(null);
  const [editing, setEditing] = useState<MasterClient | null>(null);
  const [createForm, setCreateForm] = useState<ClientFormState>(emptyForm);
  const [editForm, setEditForm] = useState<ClientFormState>(emptyForm);

  const totals = useMemo(() => {
    const active = clients.filter((client) => client.status === "Ativo").length;
    const trucks = clients.reduce((sum, client) => sum + client.truckLimit, 0);

    return { active, trucks };
  }, [clients]);

  function updateCreateForm(field: keyof ClientFormState, value: string) {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "companyName" && !current.loginEmail
        ? { loginEmail: `admin@${slugify(value)}.com.br` }
        : {}),
    }));
  }

  function updateEditForm(field: keyof ClientFormState, value: string) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = formToClient(createForm);

    await provisionTenant({
      data: {
        tenantId: client.tenantId,
        companyName: client.name,
        cnpj: client.cnpj,
        subscriptionPeriod: client.subscriptionPeriod,
        truckLimit: client.truckLimit,
        email: client.loginEmail,
        password: client.loginPassword,
      },
    });

    setClients((current) => [client, ...current]);
    createClientAccess({
      clientId: client.id,
      tenantId: client.tenantId,
      clientName: client.name,
      email: client.loginEmail,
      password: client.loginPassword,
    });
    setCreateForm(emptyForm);
    setCreateOpen(false);
  }

  function openEdit(client: MasterClient) {
    setEditing(client);
    setEditForm(clientToForm(client));
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const updated = formToClient(editForm, editing);
    await provisionTenant({
      data: {
        tenantId: updated.tenantId,
        companyName: updated.name,
        cnpj: updated.cnpj,
        subscriptionPeriod: updated.subscriptionPeriod,
        truckLimit: updated.truckLimit,
        email: updated.loginEmail,
        password: updated.loginPassword,
      },
    });

    setClients((current) => current.map((client) => (client.id === editing.id ? updated : client)));
    createClientAccess({
      clientId: updated.id,
      tenantId: updated.tenantId,
      clientName: updated.name,
      email: updated.loginEmail,
      password: updated.loginPassword,
    });
    setDetails((current) => (current?.id === editing.id ? updated : current));
    setEditing(null);
  }

  function accessClient(client: MasterClient) {
    window.open(createClientImpersonationUrl(client), "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${clients.length} clientes cadastrados`}
        title="Clientes"
        description="Cadastro central dos clientes, acessos, permissoes e limite de caminhoes no sistema master."
        crumbs={[{ label: "Clientes" }]}
        actions={
          <>
            <div className="flex rounded-xl border border-border p-0.5">
              <button
                onClick={() => setView("tabela")}
                className={`grid size-8 place-items-center rounded-lg transition ${view === "tabela" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Visualizar em tabela"
              >
                <LayoutList className="size-4" />
              </button>
              <button
                onClick={() => setView("cards")}
                className={`grid size-8 place-items-center rounded-lg transition ${view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Visualizar em cards"
              >
                <Grid2x2 className="size-4" />
              </button>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 rounded-xl font-bold">
                  <Plus className="size-4" />
                  Novo cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
                <ClientForm
                  title="Novo cliente"
                  description="Crie o cliente e defina acesso, permissao e limite de caminhoes."
                  form={createForm}
                  onChange={updateCreateForm}
                  onCancel={() => setCreateOpen(false)}
                  onSubmit={createClient}
                  submitLabel="Criar workspace"
                />
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Clientes ativos"
          value={String(totals.active)}
          delta="master"
          trend="up"
          icon={Building2}
        />
        <KpiCard
          label="Caminhoes contratados"
          value={String(totals.trucks)}
          delta="limite total"
          trend="flat"
          icon={Truck}
        />
        <KpiCard
          label="Novos acessos"
          value={String(clients.length)}
          delta="login criado"
          trend="flat"
          icon={KeyRound}
        />
        <KpiCard label="Permissoes" value="Ativas" delta="por cliente" trend="flat" />
      </div>

      <Panel className="mt-3" eyebrow="Base de clientes" title="Clientes do master">
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar cliente" className="rounded-xl pl-9" />
          </div>
        </div>

        {view === "tabela" ? (
          <TableWrap>
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>CNPJ</Th>
                  <Th>Assinatura</Th>
                  <Th>Login</Th>
                  <Th>Caminhoes</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Acoes</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <Tr key={client.id}>
                    <Td>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={client.name} />
                        <div className="min-w-0">
                          <p className="truncate font-bold">{client.name}</p>
                          <p className="text-[11px] text-muted-foreground">{client.domain}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>{client.cnpj}</Td>
                    <Td>{client.subscriptionPeriod}</Td>
                    <Td>{client.loginEmail}</Td>
                    <Td className="font-semibold">{client.truckLimit}</Td>
                    <Td>
                      <StatusPill tone={toneFor(client.status)}>{client.status}</StatusPill>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetails(client)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-primary"
                          aria-label="Visualizar"
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          onClick={() => accessClient(client)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-info"
                          aria-label="Login como cliente"
                        >
                          <LogIn className="size-4" />
                        </button>
                        <button
                          onClick={() => openEdit(client)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil className="size-4" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => (
              <article key={client.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={client.name} className="size-11 rounded-xl text-sm" />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{client.name}</p>
                      <p className="text-xs text-muted-foreground">{client.loginEmail}</p>
                    </div>
                  </div>
                  <StatusPill tone={toneFor(client.status)}>{client.status}</StatusPill>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-border bg-elevated/50 p-3">
                    <p className="eyebrow">Assinatura</p>
                    <p className="mt-1 font-bold">{client.subscriptionPeriod}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-elevated/50 p-3">
                    <p className="eyebrow">Caminhoes</p>
                    <p className="mt-1 font-bold">{client.truckLimit}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => openEdit(client)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 rounded-xl font-bold"
                    onClick={() => accessClient(client)}
                  >
                    Acessar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Sheet open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-xl">
          {details ? (
            <>
              <SheetHeader>
                <SheetTitle>{details.name}</SheetTitle>
                <SheetDescription>{details.cnpj}</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 px-4 pb-8 sm:grid-cols-2">
                <DataItem label="Assinatura" value={details.subscriptionPeriod} />
                <DataItem label="Caminhoes" value={String(details.truckLimit)} />
                <DataItem label="Tenant" value={details.tenantId} />
                <DataItem label="Login" value={details.loginEmail} />
                <DataItem label="Senha" value={details.loginPassword} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-3xl">
          {editing ? (
            <div className="px-4 pb-8">
              <ClientForm
                title="Editar cliente"
                description="Atualize o cadastro, acesso, permissao e limite de caminhoes."
                form={editForm}
                onChange={updateEditForm}
                onCancel={() => setEditing(null)}
                onSubmit={saveEdit}
                submitLabel="Salvar alteracoes"
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function ClientForm({
  title,
  description,
  form,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  title: string;
  description: string;
  form: ClientFormState;
  onChange: (field: keyof ClientFormState, value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Nome da empresa</Label>
          <Input
            required
            value={form.companyName}
            onChange={(event) => onChange("companyName", event.target.value)}
            placeholder="Transportadora Vale Verde LTDA"
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">CNPJ</Label>
          <Input
            required
            value={form.cnpj}
            onChange={(event) => onChange("cnpj", event.target.value)}
            placeholder="00.000.000/0001-00"
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">Periodo de Assinatura</Label>
          <Select
            value={form.subscriptionPeriod}
            onValueChange={(value) => onChange("subscriptionPeriod", value)}
          >
            <SelectTrigger className="mt-1.5 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Mensal">Mensal</SelectItem>
              <SelectItem value="Trimestral">Trimestral</SelectItem>
              <SelectItem value="Semestral">Semestral</SelectItem>
              <SelectItem value="Anual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Login dele</Label>
          <Input
            required
            type="email"
            value={form.loginEmail}
            onChange={(event) => onChange("loginEmail", event.target.value)}
            placeholder="admin@cliente.com.br"
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs">Senha dele</Label>
          <Input
            required
            value={form.loginPassword}
            onChange={(event) => onChange("loginPassword", event.target.value)}
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Quantos caminhoes ele vai registrar</Label>
          <Input
            required
            min={0}
            type="number"
            value={form.truckLimit}
            onChange={(event) => onChange("truckLimit", event.target.value)}
            className="mt-1.5 rounded-xl"
          />
        </div>
        <div className="sm:col-span-2">
          <ClientPermissions />
        </div>
      </div>

      <DialogFooter className="mt-5">
        <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="rounded-xl font-bold">
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ClientPermissions() {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <p className="text-sm font-bold">Permissoes</p>
      </div>
      <div className="mt-3 space-y-3">
        {permissionModules.slice(0, 4).map((module) => (
          <div key={module.module}>
            <p className="text-xs font-bold text-muted-foreground">{module.module}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {module.actions.slice(0, 4).map((action, index) => (
                <label
                  key={`${module.module}-${action}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/45 px-3 py-2 text-xs font-semibold"
                >
                  <Checkbox defaultChecked={index < 3} />
                  {action}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-elevated/50 p-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 break-words text-sm font-bold">{value}</p>
    </div>
  );
}
