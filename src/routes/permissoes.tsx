import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatusPill } from "@/components/kit/ui-kit";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { permissionModules } from "@/lib/mock";

export const Route = createFileRoute("/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões · FrotaK Master" },
      {
        name: "description",
        content: "Matriz de permissões por módulo e ação, no estilo de workspace colaborativo.",
      },
      { property: "og:title", content: "Permissões · FrotaK Master" },
      { property: "og:description", content: "Matriz granular de permissões por módulo." },
    ],
  }),
  component: () => (
    <AppShell>
      <PageHeader
        eyebrow="Matriz granular · 96 permissões"
        title="Permissões"
        description="Controle fino de acesso por módulo e ação, aplicado às funções da equipe interna."
        crumbs={[{ label: "Permissões" }]}
        actions={<StatusPill tone="success">Sincronizado</StatusPill>}
      />
      <Panel eyebrow="Busca" title="Módulos e ações">
        <Input placeholder="Buscar módulo ou ação…" className="max-w-sm rounded-xl" />
        <div className="mt-4 space-y-3">
          {permissionModules.map((m) => (
            <div key={m.module} className="rounded-xl border border-border bg-elevated/40 p-4">
              <p className="text-sm font-bold">{m.module}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {m.actions.map((a, i) => (
                  <label
                    key={a}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs font-semibold transition hover:border-primary/30"
                  >
                    <Checkbox defaultChecked={i < 3} />
                    {a}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </AppShell>
  ),
});
