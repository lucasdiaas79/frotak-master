import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/kit/ModulePage";
import { Meter, Panel } from "@/components/kit/ui-kit";
import { logs, systemHealth } from "@/lib/mock";

export const Route = createFileRoute("/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento · FrotaK Master" },
      {
        name: "description",
        content:
          "Dashboard técnico: CPU, RAM, banco, storage, filas, cache, API e tempo de resposta.",
      },
      { property: "og:title", content: "Monitoramento · FrotaK Master" },
      { property: "og:description", content: "Saúde técnica da infraestrutura FrotaK." },
    ],
  }),
  component: () => (
    <ModulePage
      eyebrow="Infraestrutura sa-east-1 · uptime 99,6%"
      title="Monitoramento"
      description="Telemetria de infraestrutura, filas, cache e latência de API da plataforma."
      crumb="Monitoramento"
      kpis={[
        { label: "CPU média", value: "38%", delta: "-4pp", trend: "up" },
        { label: "RAM", value: "62%", delta: "+3pp", trend: "down" },
        { label: "Tempo resposta p95", value: "142 ms", delta: "-11 ms", trend: "up" },
        { label: "Erros 5xx (24h)", value: "37", delta: "-18", trend: "up" },
      ]}
      extra={
        <Panel eyebrow="Recursos" title="Consumo por serviço">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Meter label="Banco de dados" value={38} />
            <Meter label="Storage" value={74} />
            <Meter label="Filas" value={88} />
            <Meter label="Cache hit" value={96} />
            <Meter label="Realtime" value={41} />
            <Meter label="Workers" value={57} />
            <Meter label="API (req/min)" value={58} />
            <Meter label="Fila webhooks" value={82} />
          </div>
        </Panel>
      }
      columns={["Serviço", "Uptime", "Detalhe", "Status"]}
      statusIndex={3}
      rows={systemHealth.map((s) => [s.name, `${s.value}%`, s.detail, s.status])}
      aside={
        <Panel eyebrow="Observabilidade" title="Logs recentes" bodyClassName="p-4">
          <ul className="space-y-2 font-mono text-xs">
            {logs.map((l, i) => (
              <li key={i} className="rounded-lg border border-border bg-elevated/50 px-3 py-2">
                <span className="font-bold text-primary">{l.level}</span> {l.msg}
                <span className="block text-[10px] text-muted-foreground">
                  {l.at} · {l.ctx}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      }
    />
  ),
});
