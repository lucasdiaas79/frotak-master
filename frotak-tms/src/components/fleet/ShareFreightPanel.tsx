import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Eye, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createFreightShareLink,
  listFreightShareLinks,
  revokeFreightShareLink,
  type FreightShareLinkSummary,
} from "@/lib/services/freight-share-links";

// Gera o link de acompanhamento do frete para o cliente (embarcador), sem login.
// O cliente ve status, posicao durante a viagem e documentos de entrega; nunca valores.

function formatDateTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function whatsappShareUrl(url: string, code: string) {
  const text = `Acompanhe o frete ${code} em tempo real: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function ShareFreightPanel({
  vehicleId,
  freightId,
  freightCode,
}: {
  vehicleId: string;
  freightId?: string;
  freightCode: string;
}) {
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<FreightShareLinkSummary[]>([]);

  const refreshLinks = useCallback(async () => {
    if (!freightId) return;
    try {
      setLinks(await listFreightShareLinks({ vehicleId, freightId }));
    } catch (error) {
      console.error("[freight-share] list failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [vehicleId, freightId]);

  useEffect(() => {
    setCreatedUrl(null);
    void refreshLinks();
  }, [refreshLinks]);

  if (!freightId) return null;

  async function handleCreate() {
    setCreating(true);
    try {
      const link = await createFreightShareLink({ vehicleId });
      setCreatedUrl(link.url);
      setCopied(false);
      await refreshLinks();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível gerar o link agora.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeFreightShareLink(id);
      toast.success("Link desativado.");
      await refreshLinks();
    } catch {
      toast.error("Não foi possível desativar o link.");
    }
  }

  const activeLinks = links.filter(
    (link) => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now(),
  );

  return (
    <div className="rounded-2xl border border-border bg-surface/35 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label-tiny">Acompanhamento do cliente</p>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            Mande um link para o cliente acompanhar status, posição e comprovante de entrega, sem
            login. Valores do frete não aparecem.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleCreate}
          disabled={creating}
          className="h-9 shrink-0"
        >
          <Link2 className="size-4" />
          {creating ? "Gerando..." : "Compartilhar com o cliente"}
        </Button>
      </div>

      {createdUrl && (
        <div className="mt-3 space-y-2">
          <input
            readOnly
            value={createdUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="h-10 w-full rounded-full border border-border bg-card px-4 text-[12px] font-medium text-foreground"
            aria-label="Link de acompanhamento"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={handleCopy} className="h-9">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <a
              href={whatsappShareUrl(createdUrl, freightCode)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-success/30 bg-success/12 px-4 text-[13px] font-bold text-success transition hover:bg-success/18"
            >
              <MessageCircle className="size-4" />
              Enviar por WhatsApp
            </a>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Guarde ou envie agora: por segurança, este link não pode ser exibido de novo. Se perder,
            gere outro.
          </p>
        </div>
      )}

      {activeLinks.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border/80 pt-3">
          {activeLinks.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Eye className="size-3.5" />
                {link.viewCount > 0
                  ? `Aberto ${link.viewCount}x · último ${formatDateTime(link.lastViewedAt)}`
                  : `Ainda não aberto · criado ${formatDateTime(link.createdAt)}`}
              </span>
              <button
                type="button"
                onClick={() => handleRevoke(link.id)}
                className="font-bold text-destructive hover:underline"
              >
                Desativar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
