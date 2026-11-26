import { createFileRoute } from "@tanstack/react-router";
import { OperacaoPage } from "@/modules/driver-ops/ui/OperacaoPage";

export const Route = createFileRoute("/operacao")({
  head: () => ({
    meta: [
      { title: "Operação do dia - FrotaK" },
      {
        name: "description",
        content: "Rotas, jornada, ocorrências e combustível do app do motorista.",
      },
    ],
  }),
  ssr: false,
  component: OperacaoPage,
});
