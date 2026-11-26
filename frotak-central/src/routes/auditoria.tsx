import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/kit/ModulePage";
import { auditTrail } from "@/lib/mock";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria · FrotaK Master" },
      {
        name: "description",
        content: "Trilha de auditoria com autor, ação, módulo, IP, dispositivo e data/hora.",
      },
      { property: "og:title", content: "Auditoria · FrotaK Master" },
      { property: "og:description", content: "Trilha completa de auditoria da plataforma." },
    ],
  }),
  component: () => (
    <ModulePage
      eyebrow="Retenção de 24 meses · imutável"
      title="Auditoria"
      description="Registro completo de ações administrativas com rastreabilidade de origem e dispositivo."
      crumb="Auditoria"
      kpis={[
        { label: "Eventos hoje", value: "1.482", delta: "+9,4%", trend: "up" },
        { label: "Ações críticas", value: "12", delta: "revisadas", trend: "flat" },
        { label: "Usuários distintos", value: "23", delta: "+3", trend: "up" },
        { label: "Exportações", value: "4", delta: "LGPD", trend: "flat" },
      ]}
      columns={["Autor", "Ação", "Módulo", "Cliente", "IP", "Dispositivo", "Data/Hora"]}
      rows={auditTrail.map((a) => [a.who, a.action, a.module, a.client, a.ip, a.device, a.when])}
    />
  ),
});
