import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canOperatePanel } from "@/modules/control-panel/ui/access";
import { formatDateTime } from "@/modules/control-panel/ui/format";
import { ErrorBlock, LevelIcon, LoadingBlock, Mono } from "@/modules/control-panel/ui/shared";
import {
  dnsRecordsFor,
  splitDomain,
  type AddressStatus,
  type ClientAddresses,
} from "@/modules/tenants/domain/client-admin";
import {
  addCustomDomainFn,
  changeSubdomainFn,
  checkClientAddressesFn,
  checkSubdomainFn,
  removeCustomDomainFn,
} from "@/modules/tenants/admin-server";
import { CopyButton, Section } from "@/modules/tenants/ui/client-ui";

function StatusLines({ status }: { status: AddressStatus | undefined }) {
  if (!status) {
    return <p className="text-xs text-muted-foreground">Conferindo DNS, HTTPS e o TMS...</p>;
  }
  const rows = [
    ["DNS", status.dns.ok, status.dns.detail],
    [
      "HTTPS",
      status.https.ok,
      status.https.ok && status.https.expiresAt
        ? `Válido até ${formatDateTime(status.https.expiresAt)}`
        : status.https.detail,
    ],
    ["TMS", status.app.ok, status.app.detail],
  ] as const;
  return (
    <ul className="space-y-1.5">
      {rows.map(([label, ok, detail]) => (
        <li key={label} className="flex items-start gap-2 text-sm">
          <LevelIcon level={ok ? "ok" : "warning"} className="mt-0.5" />
          <span className="w-14 shrink-0 font-semibold">{label}</span>
          <span className="min-w-0 text-xs break-words text-muted-foreground">{detail}</span>
        </li>
      ))}
    </ul>
  );
}

function SubdomainDialog({
  open,
  onClose,
  slug,
  addresses,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  addresses: ClientAddresses;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(addresses.subdomain);
  const [debounced, setDebounced] = useState(addresses.subdomain);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim().toLowerCase()), 350);
    return () => window.clearTimeout(timer);
  }, [value]);

  const unchanged = debounced === addresses.subdomain;
  const check = useQuery({
    queryKey: ["clients", "subdomain-check", debounced],
    queryFn: () => checkSubdomainFn({ data: { subdomain: debounced } }),
    enabled: open && Boolean(debounced) && !unchanged,
  });
  const available =
    !unchanged && check.data?.available === true && debounced === value.trim().toLowerCase();

  async function save() {
    setSaving(true);
    try {
      await changeSubdomainFn({ data: { slug, subdomain: debounced } });
      toast.success(`Endereço agora é ${debounced}.${addresses.baseDomain}.`);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mudar o endereço.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mudar o subdomínio</DialogTitle>
          <DialogDescription>
            O endereço antigo para de funcionar na hora. Avise os usuários do cliente antes. O
            banco, os dados e os logins não mudam.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-subdomain">Novo subdomínio</Label>
          <div className="flex items-center gap-2">
            <Input
              id="new-subdomain"
              value={value}
              onChange={(event) => setValue(event.target.value.toLowerCase())}
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            <span className="max-w-[55%] truncate text-sm text-muted-foreground">
              .{addresses.baseDomain}
            </span>
          </div>
          <p className="min-h-5 text-xs">
            {unchanged ? (
              <span className="text-muted-foreground">É o endereço atual.</span>
            ) : check.isFetching ? (
              <span className="text-muted-foreground">Conferindo...</span>
            ) : check.data ? (
              <span className="inline-flex items-center gap-1.5">
                <LevelIcon level={check.data.available ? "ok" : "critical"} className="size-3.5" />
                {check.data.available ? `Livre: https://${check.data.host}` : check.data.reason}
              </span>
            ) : null}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={!available || saving}>
            {saving ? "Mudando..." : "Mudar endereço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DnsRecords({ host, addresses }: { host: string; addresses: ClientAddresses }) {
  const { zone } = splitDomain(host);
  const records = dnsRecordsFor(host, addresses.primaryHost, addresses.serviceIp);
  return (
    <div className="mt-3 rounded-xl border border-border bg-elevated/30 p-3">
      <p className="text-xs text-muted-foreground">
        No painel de DNS de <Mono className="text-foreground">{zone}</Mono>, crie:
      </p>
      <TableWrap className="mt-2">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr>
              <Th className="py-2">Tipo</Th>
              <Th className="py-2">Nome</Th>
              <Th className="py-2">Valor</Th>
              <Th className="py-2">Quando usar</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <Tr key={record.type}>
                <Td className="py-2">
                  <Mono className="font-semibold">{record.type}</Mono>
                  {record.recommended ? (
                    <span className="ml-1.5 text-[11px] font-semibold text-success">
                      recomendado
                    </span>
                  ) : null}
                </Td>
                <Td className="py-2">
                  <span className="inline-flex items-center gap-1">
                    <Mono>{record.name}</Mono>
                    <CopyButton value={record.name} />
                  </span>
                </Td>
                <Td className="py-2">
                  <span className="inline-flex items-center gap-1">
                    <Mono className="break-all">{record.value}</Mono>
                    <CopyButton value={record.value} />
                  </span>
                </Td>
                <Td className="py-2 text-xs text-muted-foreground">{record.note}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-2 text-xs text-muted-foreground">
        TTL de 300 s ou o padrão do provedor. Se houver outro registro A, AAAA ou CNAME com esse
        nome, apague. A propagação costuma levar de minutos a algumas horas; depois, clique em
        "Verificar agora". O HTTPS sai sozinho na primeira visita.
      </p>
    </div>
  );
}

export function ClientAddressTab({
  slug,
  addresses,
}: {
  slug: string;
  addresses: ClientAddresses;
}) {
  const queryClient = useQueryClient();
  const canOperate = canOperatePanel();
  const [changing, setChanging] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["clients", "address-status", slug, addresses.primaryHost, addresses.domains.length],
    queryFn: () => checkClientAddressesFn({ data: { slug } }),
    staleTime: 30_000,
  });
  const byHost = new Map((status.data ?? []).map((item) => [item.host, item]));

  async function addDomain(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    try {
      await addCustomDomainFn({ data: { slug, host: newDomain } });
      toast.success("Domínio ligado. Agora crie o registro no DNS do cliente.");
      setNewDomain("");
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ligar o domínio.");
    } finally {
      setAdding(false);
    }
  }

  async function removeDomain(host: string) {
    setRemoving(host);
    try {
      await removeCustomDomainFn({ data: { slug, host } });
      toast.success(`${host} desligado.`);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desligar o domínio.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void status.refetch()}
          disabled={status.isFetching}
        >
          <RefreshCw className={status.isFetching ? "size-4 animate-spin" : "size-4"} />
          Verificar agora
        </Button>
      </div>
      {status.isError ? (
        <ErrorBlock error={status.error} onRetry={() => void status.refetch()} />
      ) : null}

      <Section
        title="Endereço da FrotaK"
        description="Criado junto com o cliente. Funciona sem configurar nada no DNS do cliente."
        actions={
          canOperate ? (
            <Button size="sm" variant="outline" onClick={() => setChanging(true)}>
              Mudar subdomínio
            </Button>
          ) : null
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Globe className="size-4 text-primary" />
          <a
            href={addresses.clientUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 font-semibold break-all underline-offset-2 hover:underline"
          >
            {addresses.primaryHost}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
          <CopyButton value={addresses.clientUrl} />
        </div>
        {status.isLoading ? (
          <LoadingBlock label="Conferindo DNS, HTTPS e o TMS..." />
        ) : (
          <StatusLines status={byHost.get(addresses.primaryHost)} />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Todo subdomínio de <Mono>{addresses.baseDomain}</Mono> depende de um registro curinga{" "}
          <Mono>*.{addresses.baseDomain}</Mono> apontando para <Mono>{addresses.serviceIp}</Mono>,
          no DNS da FrotaK. Com ele, cliente novo não precisa de DNS novo.
        </p>
      </Section>

      <Section
        title="Domínios próprios do cliente"
        description="Para o cliente usar um endereço dele, como tms.empresa.com.br. Até 5 por cliente."
      >
        {addresses.domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum domínio próprio ligado.</p>
        ) : (
          <ul className="space-y-4">
            {addresses.domains.map((domain) => (
              <li key={domain.host} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <a
                    href={`https://${domain.host}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 font-semibold break-all underline-offset-2 hover:underline"
                  >
                    {domain.host}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                  <span className="text-xs text-muted-foreground">
                    ligado em {formatDateTime(Date.parse(domain.addedAt) / 1000)}
                  </span>
                  {canOperate ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      aria-label={`Desligar ${domain.host}`}
                      disabled={removing === domain.host}
                      onClick={() => void removeDomain(domain.host)}
                    >
                      <Trash2 className="size-4" />
                      Desligar
                    </Button>
                  ) : null}
                </div>
                {status.isLoading ? null : <StatusLines status={byHost.get(domain.host)} />}
                {byHost.get(domain.host)?.app.ok ? null : (
                  <DnsRecords host={domain.host} addresses={addresses} />
                )}
              </li>
            ))}
          </ul>
        )}

        {canOperate ? (
          <form onSubmit={(event) => void addDomain(event)} className="mt-4 flex flex-wrap gap-2">
            <Input
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
              placeholder="tms.empresadocliente.com.br"
              aria-label="Domínio do cliente"
              className="min-w-56 flex-1"
            />
            <Button type="submit" disabled={adding || !newDomain.trim()}>
              <Plus className="size-4" />
              {adding ? "Ligando..." : "Ligar domínio"}
            </Button>
          </form>
        ) : null}
      </Section>

      <Section
        title="API deste cliente"
        description="Usada pelo navegador e pelo app. Não precisa de DNS próprio."
      >
        <span className="inline-flex items-center gap-1">
          <Mono className="break-all">{addresses.apiUrl}</Mono>
          <CopyButton value={addresses.apiUrl} />
        </span>
      </Section>

      {changing ? (
        <SubdomainDialog
          open={changing}
          onClose={() => setChanging(false)}
          slug={slug}
          addresses={addresses}
        />
      ) : null}
    </div>
  );
}
