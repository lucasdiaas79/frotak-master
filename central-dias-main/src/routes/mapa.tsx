import { createFileRoute } from "@tanstack/react-router";
import { MapaPage, type MapaSearch } from "@/modules/fleet-core/ui/pages/MapaPage";

export const Route = createFileRoute("/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa da Frota - Central Transportes" },
      { name: "description", content: "Monitoramento geográfico da frota em tempo real." },
    ],
  }),
  ssr: false,
  validateSearch: (search: Record<string, unknown>): MapaSearch => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
  component: MapaPage,
});
