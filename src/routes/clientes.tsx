import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { createClientAccess, createClientImpersonationUrl } from "@/lib/auth";
import {
  listManagedTenants,
  tenantFeatureCatalog,
  type ManagedTenant,
  type TenantFeatureKey,
  type TenantPermissionMap,
  upsertManagedTenant,
} from "@/lib/masterControl";
import { permissionModules } from "@/lib/mock";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes - FrotaK Master" },
      {
        name: "description",
        content: "Cadastro e gestão dos clientes FrotaK.",
      },
    ],
  }),
  component: Clientes,
});

type ClientFormState = {
  companyName: string;
  cnpj: string;
  subscriptionPeriod: string;
  loginEmail: string;
  loginPassword: string;
  truckLimit: string;
  permissions: TenantPermissionMap;
  features: TenantFeatureKey[];
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function defaultPermissions() {
  return Object.fromEntries(
    permissionModules.map((module) => [module.module, module.actions.slice(0, 3)]),
  ) as TenantPermissionMap;
}

function defaultFeatures() {
  return tenantFeatureCatalog.map((item) => item.key);
}

const emptyForm = (): ClientFormState => ({
  companyName: "",
  cnpj: "",
  subscriptionPeriod: "Mensal",
  loginEmail: "",
  loginPassword: "123456",
  truckLimit: "10",
  permissions: defaultPermissions(),
  features: defaultFeatures(),
});

function tenantToForm(tenant: ManagedTenant): ClientFormState {
  return {
    companyName: tenant.name,
    cnpj: tenant.cnpj,
    subscriptionPeriod: tenant.subscriptionPeriod,
    loginEmail: tenant.loginEmail,
    loginPassword: tenant.loginPassword,
    truckLimit: String(tenant.truckLimit),
    permissions: tenant.permissions,
    features: tenant.features.length ? tenant.features : defaultFeatures(),
  };
}

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
  const [editForm, setEditForm] = useState<ClientFormState>(emptyForm);

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
      ...(field === "companyName" && !current.loginEmail
        ? { loginEmail: `admin@${slugify(value) || "cliente"}.com.br` }
        : {}),
    }));
  }

  function updateEditForm(field: keyof ClientFormState, value: string) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function togglePermission(
    scope: "create" | "edit",
    moduleName: string,
    action: string,
    checked: boolean,
  ) {
    const setter = scope === "create" ? setCreateForm : setEditForm;

    setter((current) => {
      const currentActions = new Set(current.permissions[moduleName] ?? []);
      if (checked) currentActions.add(action);
      else currentActions.delete(action);

      return {
        ...current,
        permissions: {
          ...current.permissions,
          [moduleName]: Array.from(currentActions),
        },
      };
    });
  }

  function toggleFeature(scope: "create" | "edit", feature: TenantFeatureKey, checked: boolean) {
    const setter = scope === "create" ? setCreateForm : setEditForm;

    setter((current) => {
      const featureSet = new Set(current.features);
      if (checked) featureSet.add(feature);
      else featureSet.delete(feature);

      return {
        ...current,
        features: Array.from(featureSet) as TenantFeatureKey[],
      };
    });
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await upsertManagedTenant({
        data: {
          companyName: createForm.companyName,
          cnpj: createForm.cnpj,
          subscriptionPeriod: createForm.subscriptionPeriod,
          loginEmail: createForm.loginEmail,
          loginPassword: createForm.loginPassword,
          truckLimit: Number(createForm.truckLimit || 0),
          permissions: createForm.permissions,
          features: createForm.features,
        },
      });

      await refreshClients();
      setCreateForm(emptyForm());
      setCreateOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(client: ManagedTenant) {
    setEditing(client);
    setEditForm(tenantToForm(client));
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    try {
      await upsertManagedTenant({
        data: {
          tenantId: editing.tenantId,
          companyName: editForm.companyName,
          cnpj: editForm.cnpj,
          subscriptionPeriod: editForm.subscriptionPeriod,
          loginEmail: editForm.loginEmail,
          loginPassword: editForm.loginPassword,
          truckLimit: Number(editForm.truckLimit || 0),
          permissions: editForm.permissions,
          features: editForm.features,
          status: editing.status,
        },
      });

      await refreshClients();
      setEditing(null);
    } finally {
      setSaving(false);
    }
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
        description="Cadastro central real dos tenants, acessos, permissões, features e limite de caminhões."
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
                <ClientForm
                  title="Novo cliente"
                  description="Crie o tenant, o login dele, as permissões e as features que ele poderá usar."
                  form={createForm}
                  onChange={updateCreateForm}
                  onTogglePermission={(moduleName, action, checked) =>
                    togglePermission("create", moduleName, action, checked)
                  }
                  onToggleFeature={(feature, checked) =>
                    toggleFeature("create", feature, checked)
                  }
                  onCancel={() => setCreateOpen(false)}
                  onSubmit={createClient}
                  submitLabel={saving ? "Salvando..." : "Criar cliente"}
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
          delta="tenants ativos"
          trend="up"
          icon={Building2}
        />
        <KpiCard
          label="Caminhões cadastrados"
          value={String(totals.trucks)}
          delta={`limite total ${totals.truckLimit}`}
          trend="flat"
          icon={Truck}
        />
        <KpiCard
          label="Motoristas"
          value={String(totals.drivers)}
          delta="base real"
          trend="flat"
          icon={KeyRound}
        />
        <KpiCard
          label="Features liberadas"
          value={String(
            filteredClients.reduce((sum, client) => sum + client.features.length, 0),
          )}
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
          <TableWrap>
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>CNPJ</Th>
                  <Th>Assinatura</Th>
                  <Th>Login</Th>
                  <Th>Caminhões</Th>
                  <Th>Motoristas</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
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
            {filteredClients.map((client) => (
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
                  <div className="rounded-xl border border-border bg-elevated/50 p-3">
                    <p className="eyebrow">Assinatura</p>
                    <p className="mt-1 font-bold">{client.subscriptionPeriod}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-elevated/50 p-3">
                    <p className="eyebrow">Caminhões</p>
                    <p className="mt-1 font-bold">
                      {client.vehicles} / {client.truckLimit}
                    </p>
                  </div>
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
                <SheetDescription>{details.cnpj || details.slug}</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 px-4 pb-8 sm:grid-cols-2">
                <DataItem label="Assinatura" value={details.subscriptionPeriod} />
                <DataItem label="Status" value={details.status} />
                <DataItem label="Tenant" value={details.tenantId} />
                <DataItem label="Login" value={details.loginEmail} />
                <DataItem label="Senha" value={details.loginPassword} />
                <DataItem
                  label="Caminhões"
                  value={`${details.vehicles} cadastrados / ${details.truckLimit} limite`}
                />
                <DataItem label="Motoristas" value={String(details.drivers)} />
                <DataItem label="Caçambas" value={String(details.trailers)} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-4xl">
          {editing ? (
            <div className="px-4 pb-8">
              <ClientForm
                title="Editar cliente"
                description="Atualize o tenant, o login, as permissões e as features liberadas para este cliente."
                form={editForm}
                onChange={updateEditForm}
                onTogglePermission={(moduleName, action, checked) =>
                  togglePermission("edit", moduleName, action, checked)
                }
                onToggleFeature={(feature, checked) => toggleFeature("edit", feature, checked)}
                onCancel={() => setEditing(null)}
                onSubmit={saveEdit}
                submitLabel={saving ? "Salvando..." : "Salvar alterações"}
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
  onTogglePermission,
  onToggleFeature,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  title: string;
  description: string;
  form: ClientFormState;
  onChange: (field: keyof ClientFormState, value: string) => void;
  onTogglePermission: (moduleName: string, action: string, checked: boolean) => void;
  onToggleFeature: (feature: TenantFeatureKey, checked: boolean) => void;
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
            placeholder="Central Transportes"
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
          <Label className="text-xs">Período de Assinatura</Label>
          <Input
            required
            value={form.subscriptionPeriod}
            onChange={(event) => onChange("subscriptionPeriod", event.target.value)}
            placeholder="Mensal"
            className="mt-1.5 rounded-xl"
          />
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
          <Label className="text-xs">Quantos caminhões ele vai registrar</Label>
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
          <ClientPermissions
            permissions={form.permissions}
            onTogglePermission={onTogglePermission}
          />
        </div>
        <div className="sm:col-span-2">
          <ClientFeatures features={form.features} onToggleFeature={onToggleFeature} />
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

function ClientPermissions({
  permissions,
  onTogglePermission,
}: {
  permissions: TenantPermissionMap;
  onTogglePermission: (moduleName: string, action: string, checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <p className="text-sm font-bold">Permissões</p>
      </div>
      <div className="mt-3 space-y-3">
        {permissionModules.slice(0, 4).map((module) => (
          <div key={module.module}>
            <p className="text-xs font-bold text-muted-foreground">{module.module}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {module.actions.slice(0, 5).map((action) => {
                const checked = (permissions[module.module] ?? []).includes(action);

                return (
                  <label
                    key={`${module.module}-${action}`}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/45 px-3 py-2 text-xs font-semibold"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        onTogglePermission(module.module, action, value === true)
                      }
                    />
                    {action}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientFeatures({
  features,
  onToggleFeature,
}: {
  features: TenantFeatureKey[];
  onToggleFeature: (feature: TenantFeatureKey, checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-bold">Features liberadas</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {tenantFeatureCatalog.map((feature) => {
          const checked = features.includes(feature.key);

          return (
            <label
              key={feature.key}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/45 px-3 py-2 text-xs font-semibold"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => onToggleFeature(feature.key, value === true)}
              />
              {feature.label}
            </label>
          );
        })}
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
