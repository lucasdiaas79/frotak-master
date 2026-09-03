import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro - Frotak" }] }),
  component: Outlet,
});
