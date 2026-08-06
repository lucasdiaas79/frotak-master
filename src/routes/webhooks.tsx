import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/kit/ModulePage";
import { webhookEndpoints } from "@/lib/mock";

export const Route = createFileRoute("/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks · FrotaK Master" },
      {
        name: "description",
        content: "Endpoints, eventos, entregas, payloads e histórico de webhooks da plataforma.",
      },
      { property: "og:title", content: "Webhooks · FrotaK Master" },
      { property: "og:description", content: "Endpoints, eventos e entregas de webhooks." },
    ],
  }),
  component: () => (
    <ModulePage
      eyebrow="4 endpoints · 1.284 entregas pendentes"
      title="Webhooks"
      description="Entrega de eventos para ERPs e sistemas dos clientes com retentativas automáticas."
      crumb="Webhooks"
      kpis={[
        { label: "Entregas 24h", value: "48.204", delta: "+6,1%", trend: "up" },
        { label: "Taxa de sucesso", value: "97,3%", delta: "-0,4pp", trend: "down" },
        { label: "Fila pendente", value: "1.284", delta: "+312", trend: "down" },
        { label: "Endpoints falhando", value: "1", delta: "Atlas Bulk", trend: "down" },
      ]}
      columns={["Endpoint", "Eventos", "Sucesso", "Última entrega", "Status"]}
      statusIndex={4}
      rows={webhookEndpoints.map((w) => [w.url, w.events, `${w.success}%`, w.last, w.status])}
    />
  ),
});
