import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { KpiCard, PageHeader, Panel, StatusPill, toneFor } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { integrations } from "@/lib/mock";

export const Route = createFileRoute("/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações · FrotaK Master" },
      {
        name: "description",
        content:
          "Marketplace de integrações: mapas, ERP, IA, pagamentos, infraestrutura e comunicação.",
      },
      { property: "og:title", content: "Integrações · FrotaK Master" },
      { property: "og:description", content: "Marketplace de integrações da plataforma FrotaK." },
    ],
  }),
  component: Integracoes,
});

function Integracoes() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="12 integrações · 9 conectadas"
        title="Marketplace de Integrações"
        description="Conecte ERPs, gateways, mapas e provedores de comunicação com governança centralizada."
        crumbs={[{ label: "Integrações" }]}
        actions={
          <Button size="sm" className="gap-2 rounded-xl font-bold">
            <Plus className="size-4" /> Nova integração
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Conectadas" value="9" delta="+2" trend="up" index={0} />
        <KpiCard label="Chamadas/dia" value="1,4 M" delta="+8,2%" trend="up" index={1} />
        <KpiCard label="Erros 24h" value="128" delta="-42" trend="up" index={2} />
        <KpiCard label="Tokens expirando" value="1" delta="WhatsApp" trend="down" index={3} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {integrations.map((i) => (
          <article key={i.name} className="panel p-5 transition hover:border-primary/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{i.name}</p>
                <p className="eyebrow mt-0.5">
                  {i.cat} · {i.version}
                </p>
              </div>
              <StatusPill tone={toneFor(i.status)}>{i.status}</StatusPill>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{i.desc}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 rounded-xl">
                Logs
              </Button>
              <Button size="sm" className="flex-1 rounded-xl font-bold">
                {i.status === "Conectado" ? "Configurar" : "Conectar"}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Panel className="mt-3" eyebrow="Observabilidade" title="Eventos de integração">
        <ul className="space-y-2 font-mono text-xs">
          {[
            "14:28 asaas.payment.confirmed · 200",
            "14:27 bsoft.cte.sync · 200",
            "14:26 whatsapp.template.send · 429",
            "14:25 maps.route.matrix · 200",
          ].map((l) => (
            <li key={l} className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
              {l}
            </li>
          ))}
        </ul>
      </Panel>
    </AppShell>
  );
}
