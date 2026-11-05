import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, ExternalLink, LogIn, Truck, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, PageHeader } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildClientSupportUrl } from "@/lib/auth";
import { canOperatePanel } from "@/modules/control-panel/ui/access";
import {
  ErrorBlock,
  LevelBadge,
  LevelIcon,
  LoadingBlock,
  StatTile,
} from "@/modules/control-panel/ui/shared";
import { TenantEntitlementsPanel } from "@/modules/entitlements/ui/TenantEntitlementsPanel";
import { getClientEnvironmentFn } from "@/modules/tenants/admin-server";
import { resourceChecklist, type ClientResources } from "@/modules/tenants/domain/client-admin";
import { isTenantOperational, type Tenant } from "@/modules/tenants/domain/tenant";
import { listTenantsFn, startClientAccessFn } from "@/modules/tenants/server";
import { ClientAddressTab } from "@/modules/tenants/ui/ClientAddressTab";
import { ClientEnvironmentTab } from "@/modules/tenants/ui/ClientEnvironmentTab";
import { ClientLoginsTab } from "@/modules/tenants/ui/ClientLoginsTab";
import { ClientProfileTab } from "@/modules/tenants/ui/ClientProfileTab";
import { CopyButton, Field, formatCnpj, Section } from "@/modules/tenants/ui/client-ui";

export type ClientDetailTab =
  "resumo" | "ambiente" | "endereco" | "logins" | "modulos" | "cadastro";

export const clientDetailTabs: ClientDetailTab[] = [
  "resumo",
  "ambiente",
  "endereco",
  "logins",
  "modulos",
  "cadastro",
];

const tabLabels: Record<ClientDetailTab, string> = {
  resumo: "Resumo",
  ambiente: "Ambiente criado",
  endereco: "Endereço e domínios",
  logins: "Logins",
  modulos: "Produtos e módulos",
  cadastro: "Cadastro",
};

/** Abas que dependem do agente: com banco único, não existem. */
const environmentTabs: ClientDetailTab[] = ["ambiente", "endereco", "logins"];

async function openAsClient(tenant: Tenant) {
  // A aba abre agora: depois da resposta do servidor, o navegador a bloquearia como pop-up.
  const tab = window.open("", "_blank");
  if (!tab) {
    toast.error("O navegador bloqueou a nova aba. Permita pop-ups do Master e tente de novo.");
    return;
  }
  try {
    const access = await startClientAccessFn({ data: { tenantId: tenant.id } });
    tab.opener = null;
    tab.location.href = buildClientSupportUrl({
      tokenHash: access.tokenHash,
      tenantId: tenant.id,
      clientName: access.clientName,
      clientUrl: access.clientUrl,
    });
  } catch (error) {
    tab.close();
    toast.error(error instanceof Error ? error.message : "Não foi possível acessar este cliente.");
  }
}

function Summary({
  tenant,
  resources,
  onNavigate,
}: {
  tenant: Tenant;
  resources: ClientResources | null;
  onNavigate: (tab: ClientDetailTab) => void;
}) {
  const checks = resources ? resourceChecklist(resources) : [];
  const pending = checks.filter((check) => !check.ok).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Truck}
          label="Veículos"
          value={`${tenant.usage.vehicles} de ${tenant.vehicleLimit}`}
          hint="cadastrados / limite"
        />
        <StatTile
          icon={Users}
          label="Usuários ativos"
          value={String(tenant.usage.users)}
          hint="na empresa"
        />
        <StatTile
          icon={Users}
          label="Motoristas"
          value={String(tenant.usage.drivers)}
          hint="cadastrados"
        />
        <StatTile
          icon={Boxes}
          label="Módulos ligados"
          value={String(tenant.entitlements.modules.length)}
          hint={tenant.entitlements.products.join(", ").toUpperCase() || "nenhum produto"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section
          title={
            resources
              ? pending
                ? `O que foi criado: ${pending} item(ns) pedem atenção`
                : "O que foi criado: tudo de pé"
              : "O que foi criado"
          }
          description="Cada item é conferido agora, no servidor."
          actions={
            resources ? (
              <Button size="sm" variant="outline" onClick={() => onNavigate("ambiente")}>
                Ver detalhes
                <ArrowRight className="size-4" />
              </Button>
            ) : null
          }
        >
          {resources ? (
            <ul className="divide-y divide-border/60">
              {checks.map((check) => (
                <li key={check.key} className="flex items-start gap-3 py-2">
                  <LevelIcon level={check.ok ? "ok" : "warning"} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{check.label}</p>
                    <p className="text-xs break-words text-muted-foreground">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Com banco único, o cliente vive no banco compartilhado e não há ambiente próprio a
              mostrar.
            </p>
          )}
        </Section>

        <Section title="Cadastro">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Razão social">{tenant.legalName}</Field>
            <Field label="Nome fantasia">{tenant.tradeName || "—"}</Field>
            <Field label="CNPJ">{formatCnpj(tenant.cnpj)}</Field>
            <Field label="Assinatura">{tenant.subscriptionPeriod}</Field>
            <Field label="Administrador">{tenant.ownerEmail ?? "—"}</Field>
            <Field label="Situação">
              <LevelBadge level={isTenantOperational(tenant.status) ? "ok" : "critical"}>
                {tenant.status}
              </LevelBadge>
            </Field>
            {resources ? (
              <div className="col-span-2">
                <Field label="Endereço">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <a
                      href={resources.addresses.clientUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all underline-offset-2 hover:underline"
                    >
                      {resources.addresses.clientUrl}
                    </a>
                    <CopyButton value={resources.addresses.clientUrl} />
                  </span>
                </Field>
              </div>
            ) : null}
          </dl>
        </Section>
      </div>
    </div>
  );
}

export function ClientDetailPage({
  slug,
  tab,
  onTabChange,
}: {
  slug: string;
  tab: ClientDetailTab;
  onTabChange: (tab: ClientDetailTab) => void;
}) {
  const queryClient = useQueryClient();
  const canOperate = canOperatePanel();
  const tenants = useQuery({ queryKey: ["clients", "list"], queryFn: () => listTenantsFn() });
  const environment = useQuery({
    queryKey: ["clients", "environment", slug],
    queryFn: () => getClientEnvironmentFn({ data: { slug } }),
    refetchInterval: 30_000,
  });
  const tenant = tenants.data?.find((item) => item.slug === slug) ?? null;
  const resources = environment.data ?? null;
  const multi = environment.isSuccess && resources !== null;
  const visibleTabs = clientDetailTabs.filter((key) => multi || !environmentTabs.includes(key));
  const current = visibleTabs.includes(tab) ? tab : "resumo";

  if (tenants.isLoading || environment.isLoading) {
    return (
      <AppShell>
        <LoadingBlock label="Carregando o cliente..." />
      </AppShell>
    );
  }
  if (tenants.isError) {
    return (
      <AppShell>
        <ErrorBlock error={tenants.error} onRetry={() => void tenants.refetch()} />
      </AppShell>
    );
  }
  if (!tenant) {
    return (
      <AppShell>
        <EmptyState
          title="Cliente não encontrado"
          description="Ele pode ter mudado de identificador ou não existir mais."
          action={
            <Button asChild variant="outline">
              <Link to="/clientes">Voltar para Clientes</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Cliente · ${tenant.slug}`}
        title={tenant.name}
        description={`${tenant.legalName} · CNPJ ${formatCnpj(tenant.cnpj)}`}
        crumbs={[{ label: "Clientes", to: "/clientes" }, { label: tenant.name }]}
        actions={
          <>
            <LevelBadge level={isTenantOperational(tenant.status) ? "ok" : "critical"}>
              {tenant.status}
            </LevelBadge>
            {resources ? (
              <Button asChild size="sm" variant="outline">
                <a href={resources.addresses.clientUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Abrir TMS
                </a>
              </Button>
            ) : null}
            {canOperate ? (
              <Button size="sm" onClick={() => void openAsClient(tenant)}>
                <LogIn className="size-4" />
                Login como cliente
              </Button>
            ) : null}
          </>
        }
      />

      {environment.isError ? (
        <div className="mb-4">
          <ErrorBlock error={environment.error} onRetry={() => void environment.refetch()} />
        </div>
      ) : null}

      <Tabs value={current} onValueChange={(next) => onTabChange(next as ClientDetailTab)}>
        <div className="mb-4 overflow-x-auto">
          <TabsList className="w-max">
            {visibleTabs.map((key) => (
              <TabsTrigger key={key} value={key}>
                {tabLabels[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="resumo">
          <Summary tenant={tenant} resources={resources} onNavigate={onTabChange} />
        </TabsContent>
        {resources ? (
          <>
            <TabsContent value="ambiente">
              <ClientEnvironmentTab resources={resources} />
            </TabsContent>
            <TabsContent value="endereco">
              <ClientAddressTab slug={slug} addresses={resources.addresses} />
            </TabsContent>
            <TabsContent value="logins">
              <ClientLoginsTab slug={slug} logins={resources.logins} />
            </TabsContent>
          </>
        ) : null}
        <TabsContent value="modulos">
          <TenantEntitlementsPanel
            tenantId={tenant.id}
            tenantStatus={tenant.status}
            entitlements={tenant.entitlements}
            canOperate={canOperate}
            onChange={() => void queryClient.invalidateQueries({ queryKey: ["clients", "list"] })}
          />
        </TabsContent>
        <TabsContent value="cadastro">
          <ClientProfileTab
            key={`${tenant.legalName}|${tenant.tradeName}|${tenant.cnpj}`}
            tenant={tenant}
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
