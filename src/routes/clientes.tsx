import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  Sparkles,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createClientAccess,
  createClientImpersonationUrl,
  getCurrentAccessToken,
} from "@/lib/auth";
import { listManagedTenants, tenantFeatureCatalog, type ManagedTenant } from "@/lib/masterControl";
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

type ClientFormState = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  subscriptionPeriod: string;
  maxVehicles: string;
  planCode: string;
  enabledModuleCodes: string[];
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
};

const moduleCatalog = [
  {
    code: "fleet_core",
    label: "Frotak Core",
    description: "Gestao de frota, Smart Flow e operacao atual.",
    required: true,
  },
  { code: "cte_issuance", label: "Emissao de CT-e" },
  { code: "financial", label: "Financeiro" },
  { code: "frotak_ai", label: "Frotak IA" },
  { code: "frotak_tracking", label: "Rastreadores Frotak" },
];

const subscriptionOptions = ["Mensal", "12 meses"];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "");
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

const emptyForm = (): ClientFormState => ({
  legalName: "",
  tradeName: "",
  cnpj: "",
  subscriptionPeriod: "Mensal",
  maxVehicles: "10",
  planCode: "BASIC",
  enabledModuleCodes: ["fleet_core"],
  ownerName: "",
  ownerEmail: "",
  temporaryPassword: "",
});

function Clientes() {
  const [view, setView] = useState<"tabela" | "cards">("tabela");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ManagedTenant[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [details, setDetails] = useState<ManagedTenant | null>(null);
  const [editing, setEditing] = useState<ManagedTenant | null>(null);
  const [createForm, setCreateForm] = useState<ClientFormState>(emptyForm);

  async function refreshClients() {
    const data = await listManagedTenants();
    setClients(data);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await listManagedTenants();
        if (active) setClients(data);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter((client) =>
      [client.name, client.cnpj, client.loginEmail, client.slug].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [clients, search]);

  const totals = useMemo(() => {
    return filteredClients.reduce(
      (acc, client) => {
        if (client.status === "Ativo") acc.active += 1;
        acc.trucks += client.vehicles;
        acc.truckLimit += client.truckLimit;
        acc.drivers += client.drivers;
        return acc;
      },
      { active: 0, trucks: 0, truckLimit: 0, drivers: 0 },
    );
  }, [filteredClients]);

  function updateCreateForm(field: keyof ClientFormState, value: string) {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "legalName" && !current.ownerEmail
        ? { ownerEmail: `admin@${slugify(value) || "cliente"}.com.br` }
        : {}),
      ...(field === "legalName" && !current.ownerName
        ? { ownerName: `Admin ${value}`.trim() }
        : {}),
    }));
  }

  function toggleCreateModule(moduleCode: string, checked: boolean) {
    setCreateForm((current) => {
      const modules = new Set(current.enabledModuleCodes);
      modules.add("fleet_core");
      if (checked) modules.add(moduleCode);
      else if (moduleCode !== "fleet_core") modules.delete(moduleCode);
      return { ...current, enabledModuleCodes: Array.from(modules) };
    });
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!createForm.legalName.trim()) {
      toast.error("Informe o nome da empresa.");
      return;
    }

    if (
      !createForm.ownerName.trim() ||
      !createForm.ownerEmail.trim() ||
      !createForm.temporaryPassword.trim()
    ) {
      toast.error("Informe o administrador inicial, login e senha temporaria.");
      return;
    }

    const accessToken = await getCurrentAccessToken();
    if (!accessToken) {
      toast.error("Sessao master nao encontrada. Faca login novamente.");
      return;
    }

    setSaving(true);
    try {
      const result = await provisionTenant({
        data: {
          masterAccessToken: accessToken,
          legalName: createForm.legalName,
          tradeName: createForm.tradeName,
          cnpj: onlyDigits(createForm.cnpj),
          ownerName: createForm.ownerName,
          ownerEmail: createForm.ownerEmail.trim().toLowerCase(),
          temporaryPassword: createForm.temporaryPassword,
          planCode: createForm.planCode,
          subscriptionPeriod: createForm.subscriptionPeriod,
          maxVehicles: Number(createForm.maxVehicles || 0),
          enabledModuleCodes: createForm.enabledModuleCodes.filter(
            (moduleCode) => moduleCode !== "fleet_core",
          ),
        },
      });

      if (result.status !== "ok") {
        toast.error(result.reason || "Nao foi possivel criar o cliente.");
        return;
      }

      setCreateForm(emptyForm());
      setCreateOpen(false);
      await refreshClients();
      toast.success("Cliente provisionado com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao criar o cliente.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(client: ManagedTenant) {
    setEditing(client);
  }

  function accessClient(client: ManagedTenant) {
    createClientAccess({
      clientId: client.id,
      tenantId: client.tenantId,
      clientName: client.name,
      email: client.loginEmail,
      password: client.loginPassword,
    });
    window.open(createClientImpersonationUrl(client), "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${clients.length} tenants sincronizados`}
        title="Clientes"
        description="Cadastro central real dos tenants, acessos, modulos e limite de caminhoes."
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
              <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
                <CreateClientForm
                  form={createForm}
                  onChange={updateCreateForm}
                  onToggleModule={toggleCreateModule}
                  onCancel={() => setCreateOpen(false)}
                  onSubmit={createClient}
                  saving={saving}
                />
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Clientes ativos" value={String(totals.active)} delta="tenants ativos" trend="up" icon={Building2} />
        <KpiCard label="Caminhoes cadastrados" value={String(totals.trucks)} delta={`limite total ${totals.truckLimit}`} trend="flat" icon={Truck} />
        <KpiCard label="Motoristas" value={String(totals.drivers)} delta="base real" trend="flat" icon={KeyRound} />
        <KpiCard
          label="Modulos ativos"
          value={String(filteredClients.reduce((sum, client) => sum + client.features.length, 0))}
          delta="somadas por tenant"
          trend="flat"
          icon={Sparkles}
        />
      </div>

      <Panel className="mt-3" eyebrow="Base de clientes" title="Tenants do master">
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, CNPJ, login ou slug"
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-elevated/30 px-4 py-8 text-sm text-muted-foreground">
            Carregando tenants reais...
          </div>
        ) : view === "tabela" ? (
          <ClientTable clients={filteredClients} onDetails={setDetails} onAccess={accessClient} onEdit={openEdit} />
        ) : (
          <ClientCards clients={filteredClients} onAccess={accessClient} onEdit={openEdit} />
        )}
      </Panel>

      <Sheet open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-xl">
          {details ? (
            <>
              <SheetHeader>
                <SheetTitle>{details.name}</SheetTitle>
                <SheetDescription>{details.cnpj || details.slug}</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 px-4 pb-8 sm:grid-cols-2">
                <DataItem label="Assinatura" value={details.subscriptionPeriod} />
                <DataItem label="Status" value={details.status} />
                <DataItem label="Tenant" value={details.tenantId} />
                <DataItem label="Login" value={details.loginEmail} />
                <DataItem
                  label="Caminhoes"
                  value={`${details.vehicles} cadastrados / ${details.truckLimit} limite`}
                />
                <DataItem label="Motoristas" value={String(details.drivers)} />
                <DataItem label="Cacambas" value={String(details.trailers)} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-4xl">
          {editing ? (
            <div className="px-4 pb-8 pt-4">
              <SheetHeader>
                <SheetTitle>Editar cliente</SheetTitle>
                <SheetDescription>
                  A edicao administrativa sera liberada em um fluxo separado da criacao.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 rounded-2xl border border-border bg-elevated/40 p-4 text-sm text-muted-foreground">
                O provisionamento legado esta bloqueado. Por enquanto, este painel serve apenas
                para consulta segura dos dados do tenant.
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DataItem label="Empresa" value={editing.name} />
                <DataItem label="CNPJ" value={editing.cnpj || "-"} />
                <DataItem label="Assinatura" value={editing.subscriptionPeriod} />
                <DataItem label="Limite de caminhoes" value={String(editing.truckLimit)} />
              </div>
              <div className="mt-5 flex justify-end">
                <Button variant="outline" className="rounded-xl" onClick={() => setEditing(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function ClientTable({
  clients,
  onDetails,
  onAccess,
  onEdit,
}: {
  clients: ManagedTenant[];
  onDetails: (client: ManagedTenant) => void;
  onAccess: (client: ManagedTenant) => void;
  onEdit: (client: ManagedTenant) => void;
}) {
  return (
    <TableWrap>
      <table className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr>
            <Th>Empresa</Th>
            <Th>CNPJ</Th>
            <Th>Assinatura</Th>
            <Th>Login</Th>
            <Th>Caminhoes</Th>
            <Th>Motoristas</Th>
            <Th>Status</Th>
            <Th className="text-right">Acoes</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <Tr key={client.tenantId}>
              <Td>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={client.name} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{client.name}</p>
                    <p className="text-[11px] text-muted-foreground">{client.slug}</p>
                  </div>
                </div>
              </Td>
              <Td>{client.cnpj || "-"}</Td>
              <Td>{client.subscriptionPeriod}</Td>
              <Td>{client.loginEmail}</Td>
              <Td className="font-semibold">
                {client.vehicles} / {client.truckLimit}
              </Td>
              <Td>{client.drivers}</Td>
              <Td>
                <StatusPill tone={toneFor(client.status)}>{client.status}</StatusPill>
              </Td>
              <Td>
                <div className="flex items-center justify-end gap-1">
                  <IconButton label="Visualizar" onClick={() => onDetails(client)} icon={<Eye className="size-4" />} />
                  <IconButton label="Login como cliente" onClick={() => onAccess(client)} icon={<LogIn className="size-4" />} />
                  <IconButton label="Editar" onClick={() => onEdit(client)} icon={<Pencil className="size-4" />} />
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function ClientCards({
  clients,
  onAccess,
  onEdit,
}: {
  clients: ManagedTenant[];
  onAccess: (client: ManagedTenant) => void;
  onEdit: (client: ManagedTenant) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => (
        <article key={client.tenantId} className="panel p-5">
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
            <DataBox label="Assinatura" value={client.subscriptionPeriod} />
            <DataBox label="Caminhoes" value={`${client.vehicles} / ${client.truckLimit}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {client.features.slice(0, 4).map((feature) => (
              <span
                key={`${client.tenantId}-${feature}`}
                className="rounded-full border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground"
              >
                {tenantFeatureCatalog.find((item) => item.key === feature)?.label ?? feature}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => onEdit(client)}>
              Editar
            </Button>
            <Button size="sm" className="flex-1 rounded-xl font-bold" onClick={() => onAccess(client)}>
              Acessar
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CreateClientForm({
  form,
  onChange,
  onToggleModule,
  onCancel,
  onSubmit,
  saving,
}: {
  form: ClientFormState;
  onChange: (field: keyof ClientFormState, value: string) => void;
  onToggleModule: (moduleCode: string, checked: boolean) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogDescription>
          Crie a empresa, configure sua assinatura e defina o administrador inicial.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-5">
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-bold">Empresa</p>
          </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Nome da empresa</Label>
          <Input required value={form.legalName} onChange={(event) => onChange("legalName", event.target.value)} placeholder="Central Transportes" className="mt-1.5 rounded-xl" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Nome fantasia (opcional)</Label>
          <Input value={form.tradeName} onChange={(event) => onChange("tradeName", event.target.value)} placeholder="Central" className="mt-1.5 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs">CNPJ</Label>
          <Input required value={form.cnpj} onChange={(event) => onChange("cnpj", event.target.value)} placeholder="00.000.000/0001-00" className="mt-1.5 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs">Periodo da assinatura</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {subscriptionOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChange("subscriptionPeriod", option)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  form.subscriptionPeriod === option
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background/45 text-muted-foreground hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Quantidade maxima de veiculos</Label>
          <Input required min={1} type="number" value={form.maxVehicles} onChange={(event) => onChange("maxVehicles", event.target.value)} className="mt-1.5 rounded-xl" />
        </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-bold">Plano</p>
          </div>
          <div>
            <Label className="text-xs">Plano</Label>
            <Input required value="Plano Basico" disabled className="mt-1.5 rounded-xl" />
          </div>
        </section>

        <section>
          <ClientModules modules={form.enabledModuleCodes} onToggleModule={onToggleModule} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-bold">Administrador inicial</p>
          </div>
        <div>
          <Label className="text-xs">Nome completo</Label>
          <Input required value={form.ownerName} onChange={(event) => onChange("ownerName", event.target.value)} placeholder="Marina Silva" className="mt-1.5 rounded-xl" />
        </div>
        <div>
          <Label className="text-xs">E-mail</Label>
          <Input required type="email" value={form.ownerEmail} onChange={(event) => onChange("ownerEmail", event.target.value)} placeholder="admin@cliente.com.br" className="mt-1.5 rounded-xl" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Senha temporaria</Label>
          <Input required type="password" value={form.temporaryPassword} onChange={(event) => onChange("temporaryPassword", event.target.value)} className="mt-1.5 rounded-xl" />
        </div>
        </section>
      </div>

      <DialogFooter className="mt-5">
        <Button type="button" variant="outline" className="rounded-xl" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="rounded-xl font-bold" disabled={saving}>
          {saving ? "Salvando..." : "Criar cliente"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ClientModules({
  modules,
  onToggleModule,
}: {
  modules: string[];
  onToggleModule: (moduleCode: string, checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-bold">Modulos contratados</p>
      </div>
      <div className="mt-3 grid gap-2">
        {moduleCatalog.map((module) => {
          const checked = module.required || modules.includes(module.code);
          return (
            <label
              key={module.code}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/45 px-3 py-3 text-sm"
            >
              <Checkbox
                checked={checked}
                disabled={module.required}
                onCheckedChange={(value) => onToggleModule(module.code, value === true)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-bold">{module.label}</span>
                {module.description ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {module.description} Obrigatorio e nao pode ser desmarcado.
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-primary"
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function DataBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-elevated/50 p-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
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
