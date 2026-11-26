import { createFileRoute } from "@tanstack/react-router";
import { NotificacoesPage } from "@/modules/notifications/ui/NotificacoesPage";

export const Route = createFileRoute("/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações - FrotaK" },
      {
        name: "description",
        content: "Histórico de avisos e escolha de quais notificações receber.",
      },
    ],
  }),
  ssr: false,
  component: NotificacoesPage,
});
