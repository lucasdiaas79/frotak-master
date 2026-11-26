import { createFileRoute } from "@tanstack/react-router";
import { HistoricosPage } from "@/modules/fleet-core/ui/pages/HistoricosPage";

export const Route = createFileRoute("/historicos")({
  component: HistoricosPage,
});
