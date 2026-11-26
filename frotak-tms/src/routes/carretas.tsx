import { createFileRoute } from "@tanstack/react-router";
import { CarretasPage } from "@/modules/fleet-core/ui/pages/CarretasPage";

export const Route = createFileRoute("/carretas")({
  head: () => ({
    meta: [
      { title: "Carretas - FrotaK" },
      { name: "description", content: "Gestão de carretas e implementos." },
    ],
  }),
  component: CarretasPage,
});
