import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Carrega dados com recarga manual e periodica. Erro vira aviso, sem derrubar a tela. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[], refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps vem de quem chama
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const id = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(id);
  }, [reload, refreshMs]);
  return { data, loading, error, reload };
}

export async function act(label: string, fn: () => Promise<unknown>, done?: () => void) {
  try {
    await fn();
    toast.success(label);
    done?.();
  } catch (err) {
    toast.error("Não foi possível concluir", {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant={tone === "danger" ? "destructive" : tone === "muted" ? "secondary" : "default"}
      className={cn(tone === "warn" && "border-warning/30 bg-warning/12 text-warning")}
    >
      {children}
    </Badge>
  );
}

export function LoadError({ error }: { error: string | null }) {
  if (!error) return null;
  const missing = /does not exist|schema cache|Could not find/i.test(error);
  return (
    <p className="rounded-[18px] border border-destructive/25 bg-destructive/8 px-4 py-3 text-xs text-destructive">
      {missing
        ? "Os dados da operação ainda não existem neste banco. Peça para a FrotaK ligar a operação com embarcador."
        : error}
    </p>
  );
}

export const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num = (v: number, d = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";

export const STOP_STATUS: Record<
  string,
  { label: string; tone: "ok" | "warn" | "danger" | "muted" }
> = {
  pendente: { label: "Pendente", tone: "muted" },
  a_caminho: { label: "A caminho", tone: "warn" },
  chegou: { label: "No local", tone: "warn" },
  descarregando: { label: "Descarregando", tone: "warn" },
  entregue: { label: "Entregue", tone: "ok" },
  parcial: { label: "Parcial", tone: "danger" },
  recusada: { label: "Recusada", tone: "danger" },
};

export const REFUSAL: Record<string, string> = {
  cliente_fechado: "Cliente fechado",
  sem_pagamento: "Sem pagamento",
  avaria: "Avaria",
  pedido_errado: "Pedido errado",
  sem_espaco: "Sem espaço",
  falta_produto: "Falta de produto",
  outro: "Outro",
};

export const OCCURRENCE_LABEL: Record<string, string> = {
  pneu: "Pneu",
  quebra: "Quebra",
  acidente: "Acidente",
  avaria_carga: "Avaria na carga",
  cliente_fechado: "Cliente fechado",
  atraso: "Atraso",
  fiscalizacao: "Fiscalização",
  roubo: "Roubo",
  emergencia: "Emergência",
  checklist: "Checklist reprovado",
  outro: "Outro",
};

export const FUEL_CHECK_LABEL: Record<string, string> = {
  odometro_impossivel: "Odômetro impossível",
  abastecimento_proximo: "Abastecimento muito próximo",
  rastreador_diverge: "Km do rastreador diverge",
  preco_acima: "Preço acima do combinado",
  arla_fora: "Arla fora da faixa",
  fora_do_posto: "Longe do posto informado",
};
