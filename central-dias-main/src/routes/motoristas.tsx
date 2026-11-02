import { createFileRoute } from "@tanstack/react-router";
import { MotoristasPage } from "@/modules/fleet-core/ui/pages/MotoristasPage";

export const Route = createFileRoute("/motoristas")({
  head: () => ({
    meta: [
      { title: "Motoristas - Central Transportes" },
      { name: "description", content: "Gestão de motoristas." },
    ],
  }),
  component: MotoristasPage,
});
