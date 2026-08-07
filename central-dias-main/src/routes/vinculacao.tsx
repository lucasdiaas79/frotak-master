import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";

export const Route = createFileRoute("/vinculacao")({
  head: () => ({
    meta: [
      { title: "Despacho Operacional - Central Transportes" },
      { name: "description", content: "Compatibilidade da rota antiga de despacho." },
    ],
  }),
  component: DespachoCompatPage,
});

function DespachoCompatPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/gestao-frota" });
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-3">
      <div className="premium-card max-w-md p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <Truck className="size-5" />
        </div>
        <h1 className="mt-4 text-[20px] font-extrabold text-foreground">
          Despacho centralizado na Gestão de Frota
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          A rota antiga permanece compatível, mas o novo fluxo de frete fica dentro da Central de
          Fretes.
        </p>
        <Button className="mt-5 w-full" onClick={() => navigate({ to: "/gestao-frota" })}>
          Ir para Central de Fretes
        </Button>
      </div>
    </div>
  );
}
