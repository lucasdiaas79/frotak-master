import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  KpiCard,
  PageHeader,
  Panel,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Tr,
} from "@/components/kit/ui-kit";
import { getModuleBySlug, type WorkspaceConfig } from "@/lib/workspaces";

type WorkspaceVisualPageProps = {
  workspace: WorkspaceConfig;
  moduleSlug?: string;
};

export function WorkspaceVisualPage({ workspace, moduleSlug }: WorkspaceVisualPageProps) {
  const activeModule = getModuleBySlug(workspace, moduleSlug);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${workspace.badge} · ${workspace.status}`}
        title={activeModule ? `${workspace.name} · ${activeModule.label}` : workspace.name}
        description={activeModule?.description ?? workspace.description}
        crumbs={[
          { label: workspace.shortName, to: workspace.basePath },
          ...(activeModule ? [{ label: activeModule.label }] : []),
        ]}
        actions={
          <>
            <StatusPill tone={workspace.tone}>{workspace.status}</StatusPill>
            <StatusPill tone="neutral" dot={false}>
              {workspace.lastAccess}
            </StatusPill>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {workspace.metrics.map((metric, index) => (
          <KpiCard key={metric.label} {...metric} index={index} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Panel
          eyebrow="Módulos"
          title="Navegação do workspace"
          description="Acesso rápido aos módulos visuais do ambiente."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {workspace.modules.map((module, index) => {
              const href =
                index === 0 ? workspace.basePath : `${workspace.basePath}/${module.slug}`;
              const active = activeModule?.slug === module.slug;

              return (
                <Link
                  key={module.slug}
                  to={href}
                  className={`rounded-2xl border p-4 transition ${active ? "border-primary/40 bg-primary/10" : "border-border bg-elevated/30 hover:border-primary/20 hover:bg-elevated/60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <module.icon className="size-5 text-primary" />
                    {module.badge ? (
                      <StatusPill tone="neutral" dot={false}>
                        {module.badge}
                      </StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold">{module.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel eyebrow={activeModule?.eyebrow ?? workspace.badge} title="Resumo do ambiente">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-elevated/40 p-4">
              <p className="text-sm font-semibold">{workspace.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Base: {workspace.basePath} · Favorito: {workspace.favorite ? "sim" : "não"} · Fixo:{" "}
                {workspace.pinned ? "sim" : "não"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border bg-elevated/30 p-4">
                <p className="eyebrow">Workspace</p>
                <p className="mt-2 text-lg font-semibold">{workspace.shortName}</p>
              </div>
              <div className="rounded-2xl border border-border bg-elevated/30 p-4">
                <p className="eyebrow">Módulo atual</p>
                <p className="mt-2 text-lg font-semibold">{activeModule?.label ?? "Dashboard"}</p>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="mt-3" eyebrow="Dados" title={workspace.table.title}>
        <TableWrap>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                {workspace.table.columns.map((column) => (
                  <Th key={column}>{column}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workspace.table.rows.map((row, rowIndex) => (
                <Tr key={`${workspace.key}-${rowIndex}`}>
                  {row.map((value, cellIndex) => (
                    <Td key={`${rowIndex}-${cellIndex}`}>{value}</Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </AppShell>
  );
}
