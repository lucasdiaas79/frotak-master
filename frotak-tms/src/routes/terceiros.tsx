import { createFileRoute } from "@tanstack/react-router";
import { TerceirosPage } from "@/modules/fleet-core/ui/pages/TerceirosPage";

export const Route = createFileRoute("/terceiros")({
  head: () => ({
    meta: [
      { title: "Terceiros - FrotaK" },
      { name: "description", content: "Motoristas, cavalos e carretas de terceiros." },
    ],
  }),
  component: TerceirosPage,
});
