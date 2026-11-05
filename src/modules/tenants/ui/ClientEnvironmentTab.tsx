import { KeyRound, ShieldCheck } from "lucide-react";
import { StatusPill, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
  toEpoch,
} from "@/modules/control-panel/ui/format";
import { LevelBadge, LevelIcon, Mono } from "@/modules/control-panel/ui/shared";
import type { ClientResources } from "@/modules/tenants/domain/client-admin";
import { CopyButton, Field, Section } from "@/modules/tenants/ui/client-ui";

const rolePurpose: Record<string, string> = {
  auth: "Login dos usuários (GoTrue)",
  rest: "API de dados (PostgREST)",
  storage: "Arquivos (Storage)",
};

function purposeOf(name: string) {
  const suffix = name.split("_").at(-1) ?? "";
  return rolePurpose[suffix] ?? "—";
}

function healthLevel(state: string, health: string | null) {
  if (state !== "running") return "critical" as const;
  if (health === "unhealthy") return "critical" as const;
  if (health === "starting") return "warning" as const;
  return "ok" as const;
}

export function ClientEnvironmentTab({ resources }: { resources: ClientResources }) {
  const { database, containers, gateway, probes, jobs, backup, keys, storage } = resources;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section
        title="Banco de dados"
        description="Um banco só deste cliente, no Postgres da VPS de banco."
        className="xl:col-span-2"
      >
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Nome">
            <span className="inline-flex items-center gap-1">
              <Mono>{database.name}</Mono>
              <CopyButton value={database.name} />
            </span>
          </Field>
          <Field label="Tamanho">{formatBytes(database.sizeBytes)}</Field>
          <Field label="Conexões agora">{database.connections}</Field>
          <Field label="Tabelas da aplicação">{database.publicTables}</Field>
          <Field label="Versão do schema">
            {database.migrations} migrations
            <Mono className="block text-muted-foreground">{database.lastMigration ?? "—"}</Mono>
          </Field>
          <Field label="Acesso público">
            <LevelBadge level={database.publicCanConnect ? "critical" : "ok"}>
              {database.publicCanConnect ? "Liberado" : "Bloqueado"}
            </LevelBadge>
          </Field>
          <Field label="Criado em">{formatDateTime(toEpoch(resources.createdAt))}</Field>
          <Field label="Identificador interno">
            <span className="inline-flex items-center gap-1">
              <Mono>{resources.slug}</Mono>
              <CopyButton value={resources.slug} />
            </span>
          </Field>
        </dl>
      </Section>

      <Section
        title="Logins do banco"
        description="Cada serviço entra no banco com um login próprio. As senhas ficam só na VPS de banco e nunca aparecem aqui."
        className="xl:col-span-2"
      >
        <TableWrap className="rounded-xl border border-border">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <Th>Login</Th>
                <Th>Para quê</Th>
                <Th>Pode entrar</Th>
                <Th className="text-right">Sessões agora</Th>
                <Th>Onde entra</Th>
                <Th>Senha</Th>
              </tr>
            </thead>
            <tbody>
              {database.roles.map((role) => {
                const isolated = role.ownDatabase && role.otherDatabases.length === 0;
                return (
                  <Tr key={role.name}>
                    <Td className="py-2">
                      <span className="inline-flex items-center gap-1">
                        <Mono className="font-semibold">{role.name}</Mono>
                        <CopyButton value={role.name} />
                      </span>
                    </Td>
                    <Td className="py-2 text-xs">{purposeOf(role.name)}</Td>
                    <Td className="py-2 text-xs">{role.canLogin ? "Sim" : "Não"}</Td>
                    <Td className="py-2 text-right tabular-nums">{role.sessions}</Td>
                    <Td className="py-2">
                      <LevelBadge level={isolated ? "ok" : "critical"}>
                        {isolated
                          ? "Só neste banco"
                          : role.otherDatabases.length
                            ? `Também: ${role.otherDatabases.join(", ")}`
                            : "Sem acesso ao próprio banco"}
                      </LevelBadge>
                    </Td>
                    <Td className="py-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="size-3.5" />
                        Só na VPS de banco
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Section>

      <Section title="Serviços" description="Containers deste cliente na VPS de banco.">
        <ul className="space-y-2">
          {containers.map((container) => {
            const started = toEpoch(container.startedAt);
            const level = healthLevel(container.state, container.health);
            return (
              <li key={container.name} className="flex flex-wrap items-center gap-2 text-sm">
                <LevelIcon level={level} />
                <Mono className="min-w-0 flex-1 truncate">{container.name}</Mono>
                <span className="text-xs text-muted-foreground">
                  {container.state === "running" && started
                    ? `há ${formatDuration(Date.now() / 1000 - started)}`
                    : container.state === "missing"
                      ? "não existe"
                      : container.state}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Portão (Kong)"
        description="Como o navegador chega à API deste cliente, com chaves só dele."
      >
        <ul className="space-y-1.5">
          {[
            ["Login", probes.auth],
            ["API", probes.rest],
            ["Arquivos", probes.storage],
          ].map(([label, probe]) => {
            const value = probe as { status: number | null; ms: number };
            const ok = value.status !== null && value.status < 500;
            return (
              <li key={label as string} className="flex items-center gap-2 text-sm">
                <LevelIcon level={ok ? "ok" : "critical"} />
                <span className="flex-1">{label as string}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {ok ? `${value.ms} ms` : value.status ? `erro ${value.status}` : "sem resposta"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {gateway.routes.length} rotas, {gateway.consumers.length} chaves de acesso:{" "}
          {gateway.consumers.join(", ") || "nenhuma"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {gateway.routes.map((route) => (
            <StatusPill key={route} tone="neutral" dot={false}>
              <Mono>{route}</Mono>
            </StatusPill>
          ))}
        </div>
      </Section>

      <Section title="Tempo real" description="Atualizações na tela sem recarregar.">
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Registro">
            <LevelBadge level={probes.realtimeRegistered ? "ok" : "critical"}>
              {probes.realtimeRegistered ? "Registrado" : "Sem registro"}
            </LevelBadge>
          </Field>
          <Field label="Leitura do banco">
            <LevelBadge level={database.slot?.active ? "ok" : "idle"}>
              {database.slot?.active ? "Ativa" : "Em espera: ninguém conectado"}
            </LevelBadge>
          </Field>
          <Field label="Slot de replicação">
            <Mono>{database.slot?.name ?? "—"}</Mono>
          </Field>
          <Field label="Atraso">{formatBytes(database.slot?.lagBytes)}</Field>
        </dl>
      </Section>

      <Section title="Arquivos" description="Anexos e documentos, em pasta só deste cliente.">
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Pasta">
            <Mono className="break-all">{storage.path}</Mono>
          </Field>
          <Field label="Tamanho">{formatBytes(storage.bytes)}</Field>
          <Field label="Pastas lógicas">{formatNumber(database.storageBuckets)}</Field>
          <Field label="Arquivos">{formatNumber(database.storageObjects)}</Field>
        </dl>
      </Section>

      <Section title="Agendamentos" description="Rodam sozinhos no banco deste cliente.">
        <ul className="space-y-2">
          {jobs.map((job) => {
            const last = toEpoch(job.lastRunAt);
            const failed = job.lastStatus === "failed";
            return (
              <li key={job.name} className="flex flex-wrap items-center gap-2 text-sm">
                <LevelIcon level={!job.active || failed ? "critical" : "ok"} />
                <Mono className="min-w-0 flex-1 truncate">{job.name.split(":").at(-1)}</Mono>
                <Mono className="text-muted-foreground">{job.schedule}</Mono>
                <span className="w-full pl-6 text-xs text-muted-foreground sm:w-auto sm:pl-0">
                  {last
                    ? `${failed ? "falhou" : "rodou"} há ${formatDuration(Date.now() / 1000 - last)}`
                    : "ainda não rodou"}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Backup"
        description="Todo dia às 06:30 UTC, com restauração só deste cliente."
      >
        {backup ? (
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Última cópia">{formatDateTime(backup.at)}</Field>
            <Field label="Cópias guardadas">{backup.copies}</Field>
            <Field label="Banco">{formatBytes(backup.databaseBytes)}</Field>
            <Field label="Arquivos">{formatBytes(backup.filesBytes)}</Field>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ainda sem cópia. O cliente entra no próximo backup diário.
          </p>
        )}
      </Section>

      <Section
        title="Chaves"
        description="Assinatura própria: chave de um cliente não abre outro nem o Central."
      >
        <ul className="space-y-1.5 text-sm">
          {[
            ["Segredo de assinatura (JWT)", keys.ownJwtSecret, "Só na VPS de banco"],
            ["Chave pública (anon)", keys.anonKey, "Vai para o navegador, como deve"],
            ["Chave de serviço", keys.serviceRoleKey, "Só nos servidores"],
          ].map(([label, ok, where]) => (
            <li key={label as string} className="flex items-center gap-2">
              <ShieldCheck className={ok ? "size-4 text-success" : "size-4 text-destructive"} />
              <span className="flex-1">{label as string}</span>
              <span className="text-xs text-muted-foreground">{where as string}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
