import { createFileRoute } from "@tanstack/react-router";
import { UsuariosErrorFallback, UsuariosPage } from "@/modules/fleet-core/ui/pages/UsuariosPage";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários - Central Transportes" },
      {
        name: "description",
        content: "Gestão de usuários do workspace cliente.",
      },
    ],
  }),
  component: UsuariosPage,
  errorComponent: UsuariosErrorFallback,
});
