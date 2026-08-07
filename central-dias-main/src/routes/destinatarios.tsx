import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/destinatarios")({
  head: () => ({
    meta: [
      { title: "Destinatários — Central Transportes" },
      { name: "description", content: "Cadastro e gestão de empresas destinatárias das cargas." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
  component: () => null,
});
