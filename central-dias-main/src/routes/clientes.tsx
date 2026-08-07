import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/components/CustomersPage";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Cadastro de Clientes - Central Transportes" },
      {
        name: "description",
        content: "Cadastro unificado de clientes com papel de remetente, destinatário ou ambos.",
      },
    ],
  }),
  component: CustomersPage,
});
