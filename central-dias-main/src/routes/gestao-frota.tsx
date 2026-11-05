import { createFileRoute } from "@tanstack/react-router";
import { GestaoFrotaPage } from "@/modules/fleet-core/ui/pages/GestaoFrotaPage";

export const Route = createFileRoute("/gestao-frota")({
  head: () => ({
    meta: [
      { title: "Central de Fretes - FrotaK" },
      {
        name: "description",
        content: "Pipeline operacional de fretes por etapa da rota.",
      },
    ],
  }),
  component: GestaoFrotaPage,
});
