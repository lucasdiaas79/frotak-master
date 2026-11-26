import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupportAccessClient } from "@/lib/auth";

/** Deixa claro para a equipe FrotaK que esta aba está agindo como o dono do cliente. */
export function SupportAccessBanner({
  userId,
  onExit,
}: {
  /** A sessão de suporte só existe depois que a credencial é trocada, então relê ao mudar o usuário. */
  userId?: string;
  onExit: () => void;
}) {
  const [clientName, setClientName] = useState<string | null>(null);

  useEffect(() => {
    setClientName(getSupportAccessClient());
  }, [userId]);

  if (!clientName) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm"
    >
      <span>
        Modo suporte: você está acessando como <strong>{clientName}</strong>. As ações ficam em nome
        deste cliente.
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onExit}>
        Encerrar acesso
      </Button>
    </div>
  );
}
