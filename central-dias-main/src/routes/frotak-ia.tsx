import { createFileRoute } from "@tanstack/react-router";
import { FrotakIaPage } from "@/modules/frotak-ai/ui/FrotakIaPage";

export const Route = createFileRoute("/frotak-ia")({
  head: () => ({
    meta: [
      { title: "Frotak IA - FrotaK" },
      {
        name: "description",
        content: "Assistente inteligente operacional da Frotak.",
      },
    ],
  }),
  component: FrotakIaPage,
});
