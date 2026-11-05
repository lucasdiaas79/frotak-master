import { createFileRoute } from "@tanstack/react-router";
import { VeiculosPage } from "@/modules/fleet-core/ui/pages/VeiculosPage";

export const Route = createFileRoute("/veiculos")({
  head: () => ({
    meta: [
      { title: "Veículos - FrotaK" },
      { name: "description", content: "Gestão de veículos da frota." },
    ],
  }),
  component: VeiculosPage,
});
