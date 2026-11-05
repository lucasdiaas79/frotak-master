import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Plug,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { EmptyState, Panel, StatusPill, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DatabaseKind, TableSummary } from "@/modules/control-panel/domain/control-panel";
import {
  getDatabaseServerFn,
  getJobsFn,
  getTableDetailFn,
  getTableRowsFn,
  getTablesFn,
} from "@/modules/control-panel/server";
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatPercent,
  toEpoch,
} from "@/modules/control-panel/ui/format";
import { isPanelAdmin } from "@/modules/control-panel/ui/access";
import {
  ErrorBlock,
  LevelBadge,
  LoadingBlock,
  Mono,
  StatTile,
} from "@/modules/control-panel/ui/shared";

const kindLabels: Record<DatabaseKind, string> = {
  central: "Central",
  client: "Cliente",
  jobs: "Agendamentos",
  template: "Modelo",
  system: "Sistema",
  other: "Outro",
};

const relationLabels: Record<string, string> = {
  r: "Tabela",
  p: "Tabela particionada",
  v: "View",
  m: "View materializada",
  f: "Tabela externa",
};

const constraintLabels: Record<string, string> = {
  p: "Chave primária",
  f: "Chave estrangeira",
  u: "Único",
  c: "Verificação",
  x: "Exclusão",
  t: "Gatilho",
};

const PAGE_SIZE = 25;

function RowsView({ database, table }: { database: string; table: TableSummary }) {
  const [offset, setOffset] = useState<number | null>(null);
  const rows = useQuery({
    queryKey: ["panel", "rows", database, table.schema, table.name, offset],
    queryFn: () =>
      getTableRowsFn({
        data: {
          database,
          schema: table.schema,
          table: table.name,
          limit: PAGE_SIZE,
          offset: offset ?? 0,
        },
      }),
    enabled: offset !== null,
    gcTime: 0,
  });

  if (offset === null) {
    return (
      <EmptyState
        title="Ver os dados desta tabela"
        description="São dados do cliente. A leitura fica registrada na auditoria com o seu nome, e colunas de senha, token e documentos aparecem mascaradas."
        action={
          <Button onClick={() => setOffset(0)}>
            <Eye className="size-4" />
            Carregar dados
          </Button>
        }
      />
    );
  }
  if (rows.isLoading) return <LoadingBlock label="Lendo em modo somente leitura..." />;
  if (rows.isError) return <ErrorBlock error={rows.error} onRetry={() => void rows.refetch()} />;

  const data = rows.data;
  if (!data) return null;
  const hasNext =
    data.total !== null ? offset + PAGE_SIZE < data.total : data.rows.length === PAGE_SIZE;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {data.rows.length === 0
            ? "Sem linhas"
            : `Linhas ${formatNumber(offset + 1)} a ${formatNumber(offset + data.rows.length)}`}
          {data.total !== null ? ` de ${formatNumber(data.total)}` : ""}. Valores longos aparecem
          cortados.
        </span>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={offset === 0}
            aria-label="Página anterior"
            onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasNext}
            aria-label="Próxima página"
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <TableWrap className="max-h-[60vh] overflow-y-auto rounded-2xl border border-border">
        <table className="w-full">
          <thead>
            <tr>
              {data.columns.map((column) => (
                <Th key={column.name} className="whitespace-nowrap">
                  {column.name}
                  {column.masked ? (
                    <ShieldAlert className="ml-1 inline size-3.5" aria-label="Coluna mascarada" />
                  ) : null}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <Tr key={index}>
                {data.columns.map((column) => (
                  <Td key={column.name} className="max-w-64 truncate py-2 font-mono text-xs">
                    {row[column.name] ?? <span className="text-muted-foreground">null</span>}
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

function StructureView({ database, table }: { database: string; table: TableSummary }) {
  const detail = useQuery({
    queryKey: ["panel", "table", database, table.schema, table.name],
    queryFn: () =>
      getTableDetailFn({ data: { database, schema: table.schema, table: table.name } }),
  });
  if (detail.isLoading) return <LoadingBlock label="Lendo a estrutura..." />;
  if (detail.isError) {
    return <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  const data = detail.data;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <LevelBadge level={data.rls ? "ok" : "warning"}>
          {data.rls ? "RLS ligado" : "Sem RLS"}
        </LevelBadge>
        <span>
          {data.exactRows !== null
            ? `${formatNumber(data.exactRows)} linhas`
            : `Cerca de ${formatNumber(table.estimatedRows)} linhas`}
        </span>
        <span>{formatBytes(data.totalBytes)}</span>
      </div>
      {data.comment ? <p className="text-sm text-muted-foreground">{data.comment}</p> : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Colunas ({data.columns.length})</h3>
        <TableWrap className="rounded-2xl border border-border">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Vazio?</Th>
                <Th>Padrão</Th>
              </tr>
            </thead>
            <tbody>
              {data.columns.map((column) => (
                <Tr key={column.name}>
                  <Td className="py-2">
                    <Mono>{column.name}</Mono>
                    {column.masked ? (
                      <ShieldAlert
                        className="ml-1 inline size-3.5 text-muted-foreground"
                        aria-label="Coluna mascarada"
                      />
                    ) : null}
                  </Td>
                  <Td className="py-2">
                    <Mono>{column.type}</Mono>
                  </Td>
                  <Td className="py-2 text-xs">{column.nullable ? "Sim" : "Não"}</Td>
                  <Td className="max-w-56 truncate py-2">
                    <Mono>{column.default ?? "—"}</Mono>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>

      <DefinitionList
        title="Restrições"
        items={data.constraints.map((item) => ({
          key: item.name,
          name: item.name,
          tag: constraintLabels[item.type] ?? item.type,
          definition: item.definition,
        }))}
      />
      <DefinitionList
        title="Índices"
        items={data.indexes.map((item) => ({
          key: item.name,
          name: item.name,
          tag: `${formatBytes(item.bytes)}, ${formatNumber(item.scans)} usos`,
          definition: item.definition,
        }))}
      />
      <DefinitionList
        title="Políticas de acesso (RLS)"
        items={data.policies.map((item) => ({
          key: item.name,
          name: item.name,
          tag: `${item.command} para ${item.roles.join(", ")}`,
          definition: [item.using && `USING ${item.using}`, item.check && `CHECK ${item.check}`]
            .filter(Boolean)
            .join("\n"),
        }))}
      />
      <DefinitionList
        title="Gatilhos"
        items={data.triggers.map((item) => ({
          key: item.name,
          name: item.name,
          definition: item.definition,
        }))}
      />
    </div>
  );
}

function DefinitionList({
  title,
  items,
}: {
  title: string;
  items: { key: string; name: string; tag?: string; definition: string }[];
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-2xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="font-semibold break-all">{item.name}</Mono>
                {item.tag ? (
                  <span className="text-xs text-muted-foreground">{item.tag}</span>
                ) : null}
              </div>
              {item.definition ? (
                <pre className="mt-2 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap break-all text-muted-foreground">
                  {item.definition}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TableSheet({
  database,
  table,
  rowSchemas,
  onClose,
}: {
  database: string;
  table: TableSummary | null;
  rowSchemas: string[];
  onClose: () => void;
}) {
  const isAdmin = isPanelAdmin();
  const readable = table ? rowSchemas.includes(table.schema) : false;

  return (
    <Sheet open={Boolean(table)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
        {table ? (
          <>
            <SheetHeader>
              <SheetTitle className="break-all">
                {table.schema}.{table.name}
              </SheetTitle>
              <SheetDescription>
                {relationLabels[table.kind] ?? "Tabela"} em {database}
              </SheetDescription>
            </SheetHeader>
            <Tabs key={`${table.schema}.${table.name}`} defaultValue="estrutura" className="px-4 pt-4 pb-8">
              <TabsList>
                <TabsTrigger value="estrutura">Estrutura</TabsTrigger>
                <TabsTrigger value="dados">Dados</TabsTrigger>
              </TabsList>
              <TabsContent value="estrutura" className="mt-4">
                <StructureView database={database} table={table} />
              </TabsContent>
              <TabsContent value="dados" className="mt-4">
                {!isAdmin ? (
                  <EmptyState
                    title="Só para administradores"
                    description="Ver os dados dos clientes exige o papel de administrador do Master."
                  />
                ) : !readable ? (
                  <EmptyState
                    title="Só a estrutura desta tabela"
                    description="Dados de login, arquivos e sistema não aparecem no painel."
                  />
                ) : (
                  <RowsView database={database} table={table} />
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TablesPanel({ database }: { database: string }) {
  const [search, setSearch] = useState("");
  const [schema, setSchema] = useState("public");
  const [selected, setSelected] = useState<TableSummary | null>(null);
  const tables = useQuery({
    queryKey: ["panel", "tables", database],
    queryFn: () => getTablesFn({ data: { database } }),
  });

  const schemas = useMemo(
    () => [...new Set((tables.data?.tables ?? []).map((item) => item.schema))].sort(),
    [tables.data],
  );
  const effectiveSchema = schemas.includes(schema) || schema === "todos" ? schema : "todos";
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (tables.data?.tables ?? [])
      .filter((item) => effectiveSchema === "todos" || item.schema === effectiveSchema)
      .filter((item) => (query ? item.name.toLowerCase().includes(query) : true));
  }, [effectiveSchema, search, tables.data]);

  return (
    <Panel
      eyebrow={database}
      title="Tabelas"
      description="Linhas são estimativas do Postgres; a contagem exata aparece ao abrir a tabela."
      bodyClassName="space-y-3 p-0"
    >
      {tables.isLoading ? (
        <LoadingBlock label="Lendo as tabelas..." />
      ) : tables.isError ? (
        <div className="p-5">
          <ErrorBlock error={tables.error} onRetry={() => void tables.refetch()} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar tabela"
                aria-label="Buscar tabela"
                className="pl-9"
              />
            </div>
            <Select value={effectiveSchema} onValueChange={setSchema}>
              <SelectTrigger className="w-48" aria-label="Filtrar por schema">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os schemas</SelectItem>
                {schemas.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} tabelas</span>
          </div>
          <TableWrap className="max-h-[70vh] overflow-y-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <Th>Tabela</Th>
                  <Th className="text-right">Linhas</Th>
                  <Th className="text-right">Tamanho</Th>
                  <Th className="text-right">Colunas</Th>
                  <Th className="text-right">Índices</Th>
                  <Th>Acesso</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((table) => (
                  <Tr key={`${table.schema}.${table.name}`}>
                    <Td className="py-2">
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => setSelected(table)}
                      >
                        <Mono className="font-semibold break-all">{table.name}</Mono>
                      </button>
                      <span className="block text-xs text-muted-foreground">
                        {table.schema}
                        {table.kind !== "r" ? ` · ${relationLabels[table.kind] ?? table.kind}` : ""}
                      </span>
                    </Td>
                    <Td className="py-2 text-right tabular-nums">
                      {formatNumber(table.estimatedRows)}
                    </Td>
                    <Td className="py-2 text-right tabular-nums">
                      {formatBytes(table.totalBytes)}
                    </Td>
                    <Td className="py-2 text-right tabular-nums">{table.columns}</Td>
                    <Td className="py-2 text-right tabular-nums">{table.indexes}</Td>
                    <Td className="py-2">
                      {table.kind === "v" || table.kind === "m" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : table.rls ? (
                        <StatusPill tone="success" dot={false}>
                          RLS, {table.policies} política(s)
                        </StatusPill>
                      ) : (
                        <StatusPill tone="neutral" dot={false}>
                          Sem RLS
                        </StatusPill>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
      <TableSheet
        database={database}
        table={selected}
        rowSchemas={tables.data?.rowSchemas ?? []}
        onClose={() => setSelected(null)}
      />
    </Panel>
  );
}

function JobsPanel() {
  const jobs = useQuery({
    queryKey: ["panel", "jobs"],
    queryFn: () => getJobsFn(),
    refetchInterval: 60_000,
  });
  return (
    <Panel
      eyebrow="pg_cron"
      title="Agendamentos dos bancos"
      description="O que roda sozinho em cada banco. Sascar e push saem do agente."
      bodyClassName="p-0"
    >
      {jobs.isLoading ? (
        <LoadingBlock />
      ) : jobs.isError ? (
        <div className="p-5">
          <ErrorBlock error={jobs.error} onRetry={() => void jobs.refetch()} />
        </div>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <Th>Agendamento</Th>
                <Th>Quando</Th>
                <Th>Última execução</Th>
                <Th className="text-right">Falhas em 24 h</Th>
              </tr>
            </thead>
            <tbody>
              {(jobs.data ?? []).map((job) => {
                const last = toEpoch(job.lastRunAt);
                const failed = job.lastStatus === "failed";
                return (
                  <Tr key={job.name}>
                    <Td className="py-2">
                      <Mono className="font-semibold">{job.name}</Mono>
                      <span className="block text-xs text-muted-foreground">{job.database}</span>
                    </Td>
                    <Td className="py-2">
                      <Mono>{job.schedule}</Mono>
                    </Td>
                    <Td className="py-2">
                      {last ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <LevelBadge level={failed ? "critical" : "ok"}>
                            {failed ? "Falhou" : "Sucesso"}
                          </LevelBadge>
                          <span className="text-xs text-muted-foreground">
                            há {formatDuration(Date.now() / 1000 - last)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ainda não rodou</span>
                      )}
                    </Td>
                    <Td className="py-2 text-right tabular-nums">{job.failures24h}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Panel>
  );
}

export function DatabasesTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const server = useQuery({
    queryKey: ["panel", "databases"],
    queryFn: () => getDatabaseServerFn(),
    refetchInterval: 30_000,
  });

  if (server.isLoading) return <LoadingBlock label="Lendo os bancos..." />;
  if (server.isError) {
    return <ErrorBlock error={server.error} onRetry={() => void server.refetch()} />;
  }
  const data = server.data;
  if (!data) return null;

  const uptime = toEpoch(data.startedAt);
  const connectionPercent = (100 * data.connections) / data.maxConnections;
  const activeSlots = data.slots.filter((slot) => slot.active).length;
  const current =
    selected ?? data.databases.find((item) => item.kind === "client")?.name ?? "frotak_central";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Database}
          label="Postgres"
          value={data.version.split(" ")[0]}
          hint={uptime ? `Ligado há ${formatDuration(Date.now() / 1000 - uptime)}` : ""}
        />
        <StatTile
          icon={Plug}
          label="Conexões"
          value={`${data.connections} de ${data.maxConnections}`}
          level={connectionPercent >= 90 ? "critical" : connectionPercent >= 75 ? "warning" : "ok"}
          hint={`${formatPercent(connectionPercent)} do limite`}
        />
        <StatTile
          icon={Activity}
          label="Tempo real"
          value={`${activeSlots} de ${data.slots.length}`}
          hint="Slots de replicação ativos"
        />
        <StatTile
          icon={Timer}
          label="Bancos"
          value={String(data.databases.length)}
          hint={`${formatBytes(data.databases.reduce((sum, item) => sum + item.sizeBytes, 0))} no total`}
        />
      </div>

      <Panel
        eyebrow="Um servidor, um banco por cliente"
        title="Bancos de dados"
        description="Selecione um banco para ver as tabelas."
        bodyClassName="p-0"
      >
        <TableWrap>
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <Th>Banco</Th>
                <Th>Tipo</Th>
                <Th className="text-right">Tamanho</Th>
                <Th className="text-right">Conexões</Th>
                <Th className="text-right">Tabelas</Th>
                <Th>Versão do schema</Th>
                <Th className="text-right">Cache</Th>
              </tr>
            </thead>
            <tbody>
              {data.databases.map((database) => {
                const active = database.name === current;
                return (
                  <Tr key={database.name} className={active ? "bg-accent/40" : undefined}>
                    <Td className="py-2">
                      {database.allowConnections ? (
                        <button
                          type="button"
                          aria-pressed={active}
                          className="text-left underline-offset-2 hover:underline"
                          onClick={() => setSelected(database.name)}
                        >
                          <Mono className="font-semibold">{database.name}</Mono>
                        </button>
                      ) : (
                        <Mono className="font-semibold">{database.name}</Mono>
                      )}
                      {database.clientSlug ? (
                        <span className="block text-xs text-muted-foreground">
                          {database.clientSlug}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="py-2">
                      <StatusPill tone="neutral" dot={false}>
                        {kindLabels[database.kind]}
                      </StatusPill>
                    </Td>
                    <Td className="py-2 text-right tabular-nums">
                      {formatBytes(database.sizeBytes)}
                    </Td>
                    <Td className="py-2 text-right tabular-nums">{database.connections}</Td>
                    <Td className="py-2 text-right tabular-nums">
                      {formatNumber(database.publicTables)}
                    </Td>
                    <Td className="py-2">
                      {database.migrations !== undefined ? (
                        <span className="text-xs">
                          {database.migrations} migrations
                          <Mono className="block text-muted-foreground">
                            {database.lastMigration}
                          </Mono>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="py-2 text-right tabular-nums">
                      {formatPercent(database.cacheHitPercent)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <TablesPanel key={current} database={current} />
      <JobsPanel />
    </div>
  );
}
