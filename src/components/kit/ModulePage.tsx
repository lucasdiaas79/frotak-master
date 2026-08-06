import { AppShell } from "@/components/layout/AppShell";
import { KpiCard, PageHeader, Panel, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";

type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  crumb: string;
  kpis: { label: string; value: string; delta: string; trend: "up" | "down" | "flat" }[];
  columns: string[];
  rows: string[][];
};

export function ModulePage({
  eyebrow,
  title,
  description,
  crumb,
  kpis,
  columns,
  rows,
}: ModulePageProps) {
  return (
    <AppShell>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        crumbs={[{ label: crumb }]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <Panel
        className="mt-3"
        eyebrow={crumb.toUpperCase()}
        title={`Visão de ${title.toLowerCase()}`}
      >
        <TableWrap>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                {columns.map((column) => (
                  <Th key={column}>{column}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <Tr key={`${title}-${rowIndex}`}>
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
