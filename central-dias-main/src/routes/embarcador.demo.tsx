import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { setDemoMode } from "@/lib/shipper/client";

// Abre o portal com dados ficticios, sem conta. Bom para apresentar a Frotak a embarcadores.

export const Route = createFileRoute("/embarcador/demo")({
  component: DemoEntry,
});

function DemoEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    setDemoMode(true);
    void navigate({ to: "/embarcador", replace: true });
  }, [navigate]);
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background text-[13px] text-muted-foreground">
      Abrindo a demonstração...
    </div>
  );
}
