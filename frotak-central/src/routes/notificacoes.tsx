import { createFileRoute } from "@tanstack/react-router";
import { NotificationRulesPage } from "@/modules/notifications/ui/NotificationRulesPage";

export const Route = createFileRoute("/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações - FrotaK Master" },
      {
        name: "description",
        content: "Regras que geram avisos para os usuários do TMS.",
      },
    ],
  }),
  component: NotificationRulesPage,
});
