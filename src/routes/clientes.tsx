import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Building2,
  ExternalLink,
  FileText,
  Grid2x2,
  KeyRound,
  LayoutList,
  LogIn,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Truck,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Avatar,
  EmptyState,
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
import { buildClientSupportUrl, getSession } from "@/lib/auth";
import {
  findModule,
  modulesOf,
  products,
  type ModuleCode,
  type ProductCode,
} from "@/modules/catalog/domain/catalog";
import type { TenantEntitlements } from "@/modules/entitlements/domain/entitlements";
import { TenantEntitlementsPanel } from "@/modules/entitlements/ui/TenantEntitlementsPanel";
import { subscriptionPeriods, slugify } from "@/modules/provisioning/domain/provisioning-request";
import { provisionTenantFn } from "@/modules/provisioning/server";
import { checkSubdomainFn, getAddressSettingsFn } from "@/modules/tenants/admin-server";
import { toSubdomain, type AddressSettings } from "@/modules/tenants/domain/client-admin";
import { CopyButton } from "@/modules/tenants/ui/client-ui";
import { isTenantOperational, type Tenant } from "@/modules/tenants/domain/tenant";
import { startClientAccessFn, listTenantsFn } from "@/modules/tenants/server";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes - FrotaK Master" },
      {
        name: "description",
        content: "Cadastro, produtos e módulos liberados para cada cliente FrotaK.",
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
  products: ProductCode[];
  modules: ModuleCode[];
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
  /** Vazio: segue o nome. Preenchido à mão: fica como o operador escreveu. */
  subdomain: string;
};

type CreatedClient = { name: string; slug: string; clientUrl?: string; ownerEmail: string };

const emptyForm = (): ClientFormState => ({
  legalName: "",
  tradeName: "",
  cnpj: "",
  subscriptionPeriod: "Mensal",
  maxVehicles: "10",
  products: ["tms"],
  modules: ["fleet_core", "driver_app"],
  ownerName: "",
  ownerEmail: "",
  temporaryPassword: "",
  subdomain: "",
});

function canOperateMaster() {
  const role = getSession()?.role;
  return role === "super_admin" || role === "operations";
}

function Clientes() {
  const [view, setView] = useState<"tabela" | "cards">("tabela");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<Tenant[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ClientFormState>(emptyForm);
  const [created, setCreated] = useState<CreatedClient | null>(null);
  const [addressSettings, setAddressSettings] = useState<AddressSettings | null>(null);
  const navigate = useNavigate();
  const canOperate = canOperateMaster();

  const managing = clients.find((client) => client.id === managingId) ?? null;

  async function loadClients() {
    setLoadError(null);
    try {
      setClients(await listTenantsFn());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Não foi possível carregar os clientes.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClients();
    // Com banco único não há subdomínio por cliente: o formulário não pede endereço.
    getAddressSettingsFn()
      .then(setAddressSettings)
      .catch(() => setAddressSettings(null));
  }, []);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter((client) =>
      [
        client.name,
        client.legalName,
        client.cnpj,
        client.ownerEmail ?? "",
        client.slug,
        client.domain,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [clients, search]);

  const totals = useMemo(() => {
    return filteredClients.reduce(
      (acc, client) => {
        if (isTenantOperational(client.status)) acc.active += 1;
        acc.trucks += client.usage.vehicles;
        acc.truckLimit += client.vehicleLimit;
        acc.drivers += client.usage.drivers;
        acc.modules += client.entitlements.modules.length;
        return acc;
      },
      { active: 0, trucks: 0, truckLimit: 0, drivers: 0, modules: 0 },
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

  function toggleCreateProduct(product: ProductCode, checked: boolean) {
    setCreateForm((current) => {
      const next = new Set(current.products);
      if (checked) next.add(product);
      else next.delete(product);
      return {
        ...current,
        products: [...next],
        // Modulos de um produto desmarcado saem junto; o banco guardaria sem efeito.
        modules: current.modules.filter(
          (module) => findModule(module).core || next.has(findModule(module).product),
        ),
      };
    });
  }

  function toggleCreateModule(module: ModuleCode, checked: boolean) {
    setCreateForm((current) => {
      const next = new Set(current.modules);
      if (checked) next.add(module);
      else if (!findModule(module).core) next.delete(module);
      return { ...current, modules: [...next] };
    });
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!createForm.products.length) {
      toast.error("Escolha ao menos um produto.");
      return;
    }

    setSaving(true);
    try {
      const result = await provisionTenantFn({
        data: {
          legalName: createForm.legalName,
          tradeName: createForm.tradeName,
          cnpj: createForm.cnpj,
          ownerName: createForm.ownerName,
          ownerEmail: createForm.ownerEmail,
          temporaryPassword: createForm.temporaryPassword,
          planCode: "BASIC",
          subscriptionPeriod: createForm.subscriptionPeriod,
          maxVehicles: Number(createForm.maxVehicles || 0),
          products: createForm.products,
          modules: createForm.modules,
          subdomain: addressSettings
            ? createForm.subdomain || suggestedSubdomain(createForm)
            : undefined,
        },
      });

      setCreateForm(emptyForm());
      setCreateOpen(false);
      setCreated({
        name: createForm.tradeName || createForm.legalName,
        slug: result.slug ?? "",
        clientUrl: result.clientUrl,
        ownerEmail: result.ownerEmail,
      });
      await loadClients();
      if (result.pendingProducts.length) {
        toast.warning(
          `Cliente criado, mas revise os produtos em "Gerenciar": ${result.pendingProducts.join(", ")}.`,
        );
      } else {
        toast.success("Cliente provisionado com sucesso.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  function updateEntitlements(tenantId: string, entitlements: TenantEntitlements) {
    setClients((current) =>
      current.map((client) => (client.id === tenantId ? { ...client, entitlements } : client)),
    );
  }

  async function accessClient(client: Tenant) {
    // A aba abre agora: depois da resposta do servidor, o navegador a bloquearia como pop-up.
    const tab = window.open("", "_blank");
    if (!tab) {
      toast.error("O navegador bloqueou a nova aba. Permita pop-ups do Master e tente de novo.");
      return;
    }

    try {
      const access = await startClientAccessFn({ data: { tenantId: client.id } });
      tab.opener = null;
      tab.location.href = buildClientSupportUrl({
        tokenHash: access.tokenHash,
        tenantId: client.id,
        clientName: access.clientName,
        clientUrl: access.clientUrl,
      });
    } catch (error) {
      tab.close();
      toast.error(
        error instanceof Error ? error.message : "Não foi possível acessar este cliente.",
      );
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${clients.length} clientes no catálogo`}
        title="Clientes"
        description="Cadastro dos clientes, produtos e módulos liberados para cada um."
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
                <Button size="sm" className="gap-2 rounded-xl font-bold" disabled={!canOperate}>
                  <Plus className="size-4" />
                  Novo cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
                <CreateClientForm
                  form={createForm}
                  addressSettings={addressSettings}
                  onChange={updateCreateForm}
                  onToggleProduct={toggleCreateProduct}
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
        <KpiCard
          label="Clientes ativos"
          value={String(totals.active)}
          delta="ativos ou em trial"
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
          delta="ativos na base"
          trend="flat"
          icon={KeyRound}
        />
        <KpiCard
          label="Módulos ligados"
          value={String(totals.modules)}
          delta="somados por cliente"
          trend="flat"
          icon={Sparkles}
        />
      </div>

      <Panel className="mt-3" eyebrow="Base de clientes" title="Clientes do Master">
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, CNPJ, login ou endereço"
              className="rounded-xl pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-elevated/30 px-4 py-8 text-sm text-muted-foreground">
            Carregando clientes...
          </div>
        ) : loadError ? (
          <EmptyState
            title="Não foi possível carregar os clientes"
            description={loadError}
            action={
              <Button
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={() => void loadClients()}
              >
                <RefreshCw className="size-4" />
                Tentar de novo
              </Button>
            }
          />
        ) : !filteredClients.length ? (
          <EmptyState
            title={search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            description={
              search
                ? "Ajuste a busca para ver outros clientes."
                : 'Use "Novo cliente" para provisionar o primeiro.'
            }
          />
        ) : view === "tabela" ? (
          <ClientTable
            clients={filteredClients}
            onDetails={(client) =>
              void navigate({ to: "/clientes/$slug", params: { slug: client.slug } })
            }
            onAccess={accessClient}
            onManage={(client) => setManagingId(client.id)}
          />
        ) : (
          <ClientCards
            clients={filteredClients}
            onDetails={(client) =>
              void navigate({ to: "/clientes/$slug", params: { slug: client.slug } })
            }
            onAccess={accessClient}
            onManage={(client) => setManagingId(client.id)}
          />
        )}
      </Panel>

      <CreatedClientDialog created={created} onClose={() => setCreated(null)} />

      <Sheet open={!!managing} onOpenChange={(open) => !open && setManagingId(null)}>
        <SheetContent className="w-full overflow-y-auto scroll-slim sm:max-w-2xl">
          {managing ? (
            <div className="px-4 pb-8 pt-4">
              <SheetHeader className="px-0">
                <SheetTitle>Gerenciar {managing.name}</SheetTitle>
                <SheetDescription>
                  Produtos e módulos valem em segundos no app do cliente. Desligar bloqueia o
                  acesso, sem apagar dados.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <DataItem label="Status" value={managing.status} />
                <DataItem label="CNPJ" value={managing.cnpj || "-"} />
                <DataItem label="Limite de caminhões" value={String(managing.vehicleLimit)} />
              </div>
              <div className="mt-4">
                <TenantEntitlementsPanel
                  tenantId={managing.id}
                  tenantStatus={managing.status}
                  entitlements={managing.entitlements}
                  canOperate={canOperate}
                  onChange={(next) => updateEntitlements(managing.id, next)}
                />
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setManagingId(null)}
                >
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

function productLabels(entitlements: TenantEntitlements) {
  return products.filter((product) => entitlements.products.includes(product.code));
}

function EntitlementSummary({ entitlements }: { entitlements: TenantEntitlements }) {
  const enabledProducts = productLabels(entitlements);

  return (
    <div className="rounded-xl border border-border bg-elevated/50 p-3">
      <p className="eyebrow">Liberado para o cliente</p>
      {enabledProducts.length ? (
        <div className="mt-2 grid gap-2">
          {enabledProducts.map((product) => (
            <div key={product.code}>
              <p className="text-sm font-bold">{product.name}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {modulesOf(product.code)
                  .filter((module) => entitlements.modules.includes(module.code))
                  .map((module) => (
                    <ModulePill key={module.code} label={module.name} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm font-bold">Nenhum produto liberado</p>
      )}
    </div>
  );
}

function ModulePill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

function ClientTable({
  clients,
  onDetails,
  onAccess,
  onManage,
}: {
  clients: Tenant[];
  onDetails: (client: Tenant) => void;
  onAccess: (client: Tenant) => void;
  onManage: (client: Tenant) => void;
}) {
  return (
    <TableWrap>
      <table className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr>
            <Th>Empresa</Th>
            <Th>Endereço</Th>
            <Th>CNPJ</Th>
            <Th>Assinatura</Th>
            <Th>Login</Th>
            <Th>Caminhões</Th>
            <Th>Produtos</Th>
            <Th>Status</Th>
            <Th className="text-right">Ações</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <Tr key={client.id}>
              <Td>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={client.name} />
                  <div className="min-w-0">
                    <Link
                      to="/clientes/$slug"
                      params={{ slug: client.slug }}
                      className="block truncate font-bold underline-offset-2 hover:underline"
                    >
                      {client.name}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{client.slug}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <span className="inline-flex max-w-64 items-center gap-1">
                  <a
                    href={`https://${client.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 text-xs underline-offset-2 hover:underline"
                  >
                    <span className="truncate">{client.domain}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                  <CopyButton value={`https://${client.domain}`} label="Copiar endereço" />
                </span>
              </Td>
              <Td>{client.cnpj || "-"}</Td>
              <Td>{client.subscriptionPeriod}</Td>
              <Td>{client.ownerEmail ?? "-"}</Td>
              <Td className="font-semibold">
                {client.usage.vehicles} / {client.vehicleLimit}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  {productLabels(client.entitlements).map((product) => (
                    <ModulePill key={product.code} label={product.name} />
                  ))}
                </div>
              </Td>
              <Td>
                <StatusPill tone={toneFor(client.status)}>{client.status}</StatusPill>
              </Td>
              <Td>
                <div className="flex items-center justify-end gap-1">
                  <IconButton
                    label="Abrir ficha: editar, endereço, ambiente e logins"
                    onClick={() => onDetails(client)}
                    icon={<FileText className="size-4" />}
                  />
                  <IconButton
                    label="Gerenciar produtos e módulos"
                    onClick={() => onManage(client)}
                    icon={<SlidersHorizontal className="size-4" />}
                  />
                  <IconButton
                    label="Login como cliente"
                    onClick={() => onAccess(client)}
                    icon={<LogIn className="size-4" />}
                  />
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
  onDetails,
  onAccess,
  onManage,
}: {
  clients: Tenant[];
  onDetails: (client: Tenant) => void;
  onAccess: (client: Tenant) => void;
  onManage: (client: Tenant) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => (
        <article key={client.id} className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={client.name} className="size-11 rounded-xl text-sm" />
              <div className="min-w-0">
                <p className="truncate font-bold">{client.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {client.ownerEmail ?? client.slug}
                </p>
              </div>
            </div>
            <StatusPill tone={toneFor(client.status)}>{client.status}</StatusPill>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <DataBox label="Assinatura" value={client.subscriptionPeriod} />
            <DataBox
              label="Caminhões"
              value={`${client.usage.vehicles} / ${client.vehicleLimit}`}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {client.entitlements.modules.slice(0, 4).map((module) => (
              <ModulePill key={`${client.id}-${module}`} label={findModule(module).name} />
            ))}
          </div>
          <p className="mt-3 truncate text-xs text-muted-foreground">{client.domain}</p>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-2 rounded-xl"
              onClick={() => onDetails(client)}
            >
              <FileText className="size-4" />
              Ficha
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-2 rounded-xl"
              onClick={() => onManage(client)}
            >
              <SlidersHorizontal className="size-4" />
              Gerenciar
            </Button>
            <Button
              size="sm"
              className="flex-1 rounded-xl font-bold"
              onClick={() => onAccess(client)}
            >
              Acessar
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function suggestedSubdomain(form: ClientFormState) {
  return toSubdomain(form.tradeName || form.legalName);
}

function SubdomainField({
  form,
  settings,
  onChange,
}: {
  form: ClientFormState;
  settings: AddressSettings;
  onChange: (field: keyof ClientFormState, value: string) => void;
}) {
  const value = form.subdomain || suggestedSubdomain(form);
  const [check, setCheck] = useState<{ value: string; available: boolean; reason: string } | null>(
    null,
  );

  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => {
      checkSubdomainFn({ data: { subdomain: value } })
        .then((result) =>
          setCheck(result ? { value, available: result.available, reason: result.reason } : null),
        )
        .catch(() => setCheck(null));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [value]);

  const current = check?.value === value ? check : null;
  return (
    <div className="sm:col-span-2">
      <Label className="text-xs" htmlFor="new-client-subdomain">
        Endereço de acesso (criado junto com o cliente)
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          id="new-client-subdomain"
          value={value}
          onChange={(event) => onChange("subdomain", event.target.value.toLowerCase())}
          placeholder="transportes-silva"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl"
        />
        <span className="max-w-[50%] truncate text-sm text-muted-foreground">
          .{settings.baseDomain}
        </span>
      </div>
      <p className="mt-1 min-h-4 text-xs text-muted-foreground">
        {!value
          ? "Escreva o nome da empresa ou um endereço."
          : current
            ? current.available
              ? `Livre: https://${value}.${settings.baseDomain}. Dá para mudar depois na ficha do cliente.`
              : current.reason
            : "Conferindo..."}
      </p>
    </div>
  );
}

function CreatedClientDialog({
  created,
  onClose,
}: {
  created: CreatedClient | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(created)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created?.name} está no ar</DialogTitle>
          <DialogDescription>
            Banco, logins, serviços, rotas, tempo real, arquivos e agendamentos foram criados. A
            ficha do cliente mostra cada item e o estado do endereço.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <dl className="space-y-3 text-sm">
            {created.clientUrl ? (
              <div>
                <dt className="text-xs text-muted-foreground">Endereço do TMS</dt>
                <dd className="inline-flex flex-wrap items-center gap-1 font-semibold">
                  <a
                    href={created.clientUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline-offset-2 hover:underline"
                  >
                    {created.clientUrl}
                  </a>
                  <CopyButton value={created.clientUrl} />
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">Login do administrador</dt>
              <dd className="font-semibold break-all">{created.ownerEmail}</dd>
            </div>
          </dl>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {created?.slug ? (
            <Button asChild>
              <Link to="/clientes/$slug" params={{ slug: created.slug }}>
                Abrir ficha
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateClientForm({
  form,
  addressSettings,
  onChange,
  onToggleProduct,
  onToggleModule,
  onCancel,
  onSubmit,
  saving,
}: {
  form: ClientFormState;
  addressSettings: AddressSettings | null;
  onChange: (field: keyof ClientFormState, value: string) => void;
  onToggleProduct: (product: ProductCode, checked: boolean) => void;
  onToggleModule: (module: ModuleCode, checked: boolean) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogDescription>
          Crie a empresa, escolha os produtos e módulos e defina o administrador inicial.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-5">
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-bold">Empresa</p>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Nome da empresa</Label>
            <Input
              required
              value={form.legalName}
              onChange={(event) => onChange("legalName", event.target.value)}
              placeholder="Central Transportes"
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Nome fantasia (opcional)</Label>
            <Input
              value={form.tradeName}
              onChange={(event) => onChange("tradeName", event.target.value)}
              placeholder="Central"
              className="mt-1.5 rounded-xl"
            />
          </div>
          {addressSettings ? (
            <SubdomainField form={form} settings={addressSettings} onChange={onChange} />
          ) : null}
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
            <Label className="text-xs">Período da assinatura</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {subscriptionPeriods.map((option) => (
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
            <Label className="text-xs">Quantidade máxima de veículos</Label>
            <Input
              required
              min={1}
              type="number"
              value={form.maxVehicles}
              onChange={(event) => onChange("maxVehicles", event.target.value)}
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs">Plano</Label>
            <Input required value="Plano Básico" disabled className="mt-1.5 rounded-xl" />
          </div>
        </section>

        <section>
          <ProductModulePicker
            selectedProducts={form.products}
            selectedModules={form.modules}
            onToggleProduct={onToggleProduct}
            onToggleModule={onToggleModule}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-sm font-bold">Administrador inicial</p>
          </div>
          <div>
            <Label className="text-xs">Nome completo</Label>
            <Input
              required
              value={form.ownerName}
              onChange={(event) => onChange("ownerName", event.target.value)}
              placeholder="Marina Silva"
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs">E-mail</Label>
            <Input
              required
              type="email"
              value={form.ownerEmail}
              onChange={(event) => onChange("ownerEmail", event.target.value)}
              placeholder="admin@cliente.com.br"
              className="mt-1.5 rounded-xl"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Senha temporária</Label>
            <Input
              required
              minLength={8}
              type="password"
              value={form.temporaryPassword}
              onChange={(event) => onChange("temporaryPassword", event.target.value)}
              className="mt-1.5 rounded-xl"
            />
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

function ProductModulePicker({
  selectedProducts,
  selectedModules,
  onToggleProduct,
  onToggleModule,
}: {
  selectedProducts: ProductCode[];
  selectedModules: ModuleCode[];
  onToggleProduct: (product: ProductCode, checked: boolean) => void;
  onToggleModule: (module: ModuleCode, checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4">
      <div className="flex items-center gap-2">
        <Boxes className="size-4 text-primary" />
        <p className="text-sm font-bold">Produtos e módulos</p>
      </div>
      <div className="mt-3 grid gap-3">
        {products.map((product) => {
          const productChecked = selectedProducts.includes(product.code);
          const productModules = modulesOf(product.code);

          return (
            <div key={product.code} className="rounded-xl border border-border bg-background/45">
              <label className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm">
                <Checkbox
                  checked={productChecked}
                  onCheckedChange={(value) => onToggleProduct(product.code, value === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-bold">{product.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {product.description}
                  </span>
                </span>
              </label>
              {productChecked && productModules.length ? (
                <div className="grid gap-2 border-t border-border/70 px-3 py-3 sm:grid-cols-2">
                  {productModules.map((module) => (
                    <label
                      key={module.code}
                      className="flex cursor-pointer items-start gap-3 text-sm"
                    >
                      <Checkbox
                        checked={module.core || selectedModules.includes(module.code)}
                        disabled={module.core}
                        onCheckedChange={(value) => onToggleModule(module.code, value === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-semibold">{module.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {module.core ? "Base do produto, sempre incluída." : module.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
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
      title={label}
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
