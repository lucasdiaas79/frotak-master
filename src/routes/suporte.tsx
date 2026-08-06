import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/kit/ModulePage";
import { tickets } from "@/lib/mock";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte · FrotaK Master" },
      {
        name: "description",
        content: "Central de tickets, SLA, avaliações e base de conhecimento do suporte FrotaK.",
      },
      { property: "og:title", content: "Suporte · FrotaK Master" },
      { property: "og:description", content: "Central de tickets e base de conhecimento." },
    ],
  }),
  component: () => (
    <ModulePage
      eyebrow="6 tickets · CSAT 4,8"
      title="Suporte"
      description="Central de atendimento com SLA por prioridade, avaliações e base de conhecimento."
      crumb="Suporte"
      kpis={[
        { label: "Tickets abertos", value: "4", delta: "-2", trend: "up" },
        { label: "SLA em risco", value: "1", delta: "38 min", trend: "down" },
        { label: "Tempo 1ª resposta", value: "12 min", delta: "-4 min", trend: "up" },
        { label: "CSAT", value: "4,8/5", delta: "+0,2", trend: "up" },
      ]}
      columns={["Ticket", "Assunto", "Cliente", "Prioridade", "Agente", "SLA", "Status"]}
      statusIndex={6}
      rows={tickets.map((t) => [t.id, t.subject, t.client, t.priority, t.agent, t.sla, t.status])}
    />
  ),
});
