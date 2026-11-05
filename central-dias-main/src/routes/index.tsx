import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/modules/fleet-core/ui/pages/DashboardPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Operacional - FrotaK" },
      { name: "description", content: "Painel operacional da frota em tempo real." },
    ],
  }),
  ssr: false,
  component: Dashboard,
});
