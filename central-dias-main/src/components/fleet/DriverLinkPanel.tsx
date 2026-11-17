import { useCallback, useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  carrierCreateDriverLink,
  carrierListDriverLinks,
  carrierRevokeDriverLink,
} from "@/lib/driverLink/api";
import type { DriverLinkSummary } from "@/lib/driverLink/types";
import { carrierCredentials } from "@/lib/shipper/carrierSession";
import type { DriverRelation } from "@/lib/shipper/types";

// Link do motorista: sem app e sem login. O motorista atualiza a viagem, lanca abastecimento e
// despesa, ve o proprio acerto e mantem os documentos. O valor combinado so aparece para ele.

function formatDateTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseMoney(value: string) {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export function DriverLinkPanel({
  vehicleId,
  freightId,
  freightCode,
}: {
  vehicleId: string;
  freightId?: string;
  freightCode: string;
}) {
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState<DriverRelation>("terceiro");
  const [pay, setPay] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ url: string; driverName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<DriverLinkSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!freightId) return;
    const credentials = await carrierCredentials();
    if (!credentials) return;
    const result = await carrierListDriverLinks({ data: { ...credentials, vehicleId } });
    if (result.ok) setLinks(result.links);
  }, [vehicleId, freightId]);

  useEffect(() => {
    setCreated(null);
    void refresh();
  }, [refresh]);

  if (!freightId) return null;

  async function handleCreate() {
    if (phone.replace(/\D/g, "").length < 10) {
      toast.error("Informe o celular do motorista com DDD.");
      return;
    }
    setCreating(true);
    try {
      const credentials = await carrierCredentials();
      if (!credentials) throw new Error("Entre de novo na Frotak para gerar o link.");
      const result = await carrierCreateDriverLink({
        data: {
          ...credentials,
          vehicleId,
          phone,
          relation,
          payAmount: parseMoney(pay),
          origin: window.location.origin,
        },
      });
      if (!result.ok) throw new Error(result.error);
      setCreated({ url: result.url, driverName: result.driverName });
      setCopied(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link agora.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  async function handleRevoke(linkId: string) {
    const credentials = await carrierCredentials();
    if (!credentials) return;
    const result = await carrierRevokeDriverLink({ data: { ...credentials, linkId } });
    if (result.ok) {
      toast.success("Link do motorista desativado.");
      await refresh();
    } else toast.error(result.error);
  }

  const whatsapp = created
    ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^(?!55)/, "55")}?text=${encodeURIComponent(
        `Olá ${created.driverName.split(" ")[0]}! Este é o link da viagem ${freightCode}. Por ele você atualiza a viagem, lança abastecimento e despesas e vê o seu acerto: ${created.url}`,
      )}`
    : "";

  const active = links.filter(
    (link) => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now(),
  );

  return (
    <div className="rounded-2xl border border-border bg-surface/35 p-3">
      <p className="label-tiny">Link do motorista</p>
      <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
        O motorista atualiza a viagem, lança abastecimento e despesa e vê o próprio acerto, sem app.
        O valor combinado só aparece para ele.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_140px_auto]">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Celular com DDD"
          inputMode="tel"
          className="h-9 rounded-full border border-border bg-card px-4 text-[13px]"
          aria-label="Celular do motorista"
        />
        <select
          value={relation}
          onChange={(event) => setRelation(event.target.value as DriverRelation)}
          className="h-9 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold"
          aria-label="Vínculo"
        >
          <option value="terceiro">Terceiro</option>
          <option value="agregado">Agregado</option>
          <option value="frota">Frota própria</option>
        </select>
        <input
          value={pay}
          onChange={(event) => setPay(event.target.value)}
          placeholder="Valor combinado"
          inputMode="decimal"
          className="h-9 rounded-full border border-border bg-card px-4 text-[13px]"
          aria-label="Valor combinado com o motorista"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleCreate}
          disabled={creating}
          className="h-9"
        >
          <Smartphone className="size-4" />
          {creating ? "Gerando..." : "Gerar link"}
        </Button>
      </div>

      {created && (
        <div className="mt-3 space-y-2">
          <input
            readOnly
            value={created.url}
            onFocus={(event) => event.currentTarget.select()}
            className="h-10 w-full rounded-full border border-border bg-card px-4 text-[12px] font-medium"
            aria-label="Link do motorista"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={handleCopy} className="h-9">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-success/30 bg-success/12 px-4 text-[13px] font-bold text-success transition hover:bg-success/18"
            >
              <MessageCircle className="size-4" />
              Enviar ao motorista
            </a>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Por segurança este link não aparece de novo. Se perder, gere outro.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border/80 pt-3">
          {active.map((link) => (
            <li key={link.id} className="text-[12px] text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground">
                  Celular final {link.phoneEnd}
                  {link.lastSeenAt
                    ? ` · visto ${formatDateTime(link.lastSeenAt)}`
                    : " · ainda não aberto"}
                </span>
                <button
                  type="button"
                  onClick={() => handleRevoke(link.id)}
                  className="font-bold text-destructive hover:underline"
                >
                  Desativar
                </button>
              </div>
              {link.events.slice(0, 4).map((event, index) => (
                <p key={`${event.at}-${index}`} className="pl-2">
                  {formatDateTime(event.at)} · {event.label}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
