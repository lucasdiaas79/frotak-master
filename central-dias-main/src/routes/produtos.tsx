import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "@/components/ProductsPage";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos - Central Transportes" },
      {
        name: "description",
        content: "Cadastro dos produtos transportados pela frota.",
      },
    ],
  }),
  component: ProductsPage,
});
