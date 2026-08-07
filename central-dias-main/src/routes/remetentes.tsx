import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/remetentes")({
  head: () => ({
    meta: [
      { title: "Remetentes — Central Transportes" },
      { name: "description", content: "Cadastro e gestão de empresas remetentes da operação." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
  component: () => null,
});
