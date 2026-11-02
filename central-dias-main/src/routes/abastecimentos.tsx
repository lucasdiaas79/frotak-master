import { createFileRoute } from "@tanstack/react-router";
import { AbastecimentosPage } from "@/modules/fleet-core/ui/pages/AbastecimentosPage";

export const Route = createFileRoute("/abastecimentos")({
  component: AbastecimentosPage,
});
