import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { EyeOff, Handshake, PauseCircle, PlayCircle, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Pill, formatCnpj, formatDateTime } from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { carrierAcceptInvite, carrierListShippers, carrierRespondShipper } from "@/lib/shipper/api";
import { carrierCredentials, takePendingInvite } from "@/lib/shipper/carrierSession";
import { CARRIER_STATUS_LABELS, type CarrierStatus } from "@/lib/shipper/types";

// Frotak da transportadora: embarcadores que pediram para acompanhar as cargas.

export const Route = createFileRoute("/embarcadores")({
  component: CarrierShippersPage,
});

type Link = {
  id: string;
  shipperName: string;
  shipperCnpj: string;
  status: CarrierStatus;
  invitedAt: string;
  respondedAt?: string;
};

const TONE: Record<CarrierStatus, "good" | "warning" | "danger" | "muted"> = {
  ativa: "good",
  convidada: "warning",
  recusada: "danger",
  pausada: "muted",
};

function CarrierShippersPage() {
  const [links, setLinks] = useState<Link[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const creds = await carrierCredentials();
    if (!creds) {
      setLoading(false);
      return;
    }
    const pending = takePendingInvite();
    if (pending) {
      const accepted = await carrierAcceptInvite({ data: { ...creds, token: pending } });
      if (accepted.ok) toast.success(`Conectado à ${accepted.shipperName}.`);
      else toast.error(accepted.error);
    }
    const result = await carrierListShippers({ data: creds });
    if (result.ok) {
      setLinks(result.links);
      setIsOwner(result.isOwner);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(link: Link, action: "aceitar" | "recusar" | "pausar") {
    setBusyId(link.id);
    try {
      const creds = await carrierCredentials();
      if (!creds) throw new Error("Sessão expirada. Entre novamente.");
      const result = await carrierRespondShipper({ data: { ...creds, linkId: link.id, action } });
      if (!result.ok) throw new Error(result.error);
      toast.success(
        action === "aceitar"
          ? `Compartilhando com ${link.shipperName}.`
          : action === "pausar"
            ? "Compartilhamento pausado."
            : "Convite recusado.",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = links.filter((link) => link.status === "convidada");
  const others = links.filter((link) => link.status !== "convidada");

  return (
    <div className="space-y-5 px-4 md:px-0">
      <PageHeader
        title="Embarcadores"
        subtitle="Clientes que acompanham as próprias cargas pela Frotak. Você decide quem vê."
      />

      <div className="premium-card grid gap-3 p-5 text-[13px] md:grid-cols-3">
        <p className="flex gap-2">
          <Handshake className="mt-0.5 size-4 shrink-0 text-primary" />O embarcador vê só os fretes
          em que o CNPJ dele é remetente ou destinatário.
        </p>
        <p className="flex gap-2">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-primary" />
          Nunca aparecem valor do frete, custos, margem, salários ou outros clientes.
        </p>
        <p className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Você pode pausar o compartilhamento a qualquer momento.
        </p>
      </div>

      {loading ? (
        <div className="premium-card h-40 animate-pulse" />
      ) : (
        <>
          {pending.length > 0 && (
            <section className="premium-card p-5">
              <h2 className="text-[15px] font-extrabold">Convites aguardando você</h2>
              <ul className="mt-3 divide-y divide-border/70">
                {pending.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-[14px] font-bold">{link.shipperName}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {formatCnpj(link.shipperCnpj)} · convite de {formatDateTime(link.invitedAt)}
                      </p>
                    </div>
                    {isOwner ? (
                      <div className="flex gap-2">
                        <Button
                          className="h-9"
                          disabled={busyId === link.id}
                          onClick={() => respond(link, "aceitar")}
                        >
                          Aceitar e compartilhar
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9"
                          disabled={busyId === link.id}
                          onClick={() => respond(link, "recusar")}
                        >
                          <XCircle className="size-4" /> Recusar
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">
                        Só o responsável pela conta pode aceitar.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="premium-card p-5">
            <h2 className="text-[15px] font-extrabold">Embarcadores conectados</h2>
            {others.length ? (
              <ul className="mt-3 divide-y divide-border/70">
                {others.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-[14px] font-bold">{link.shipperName}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {formatCnpj(link.shipperCnpj)}
                        {link.respondedAt ? ` · desde ${formatDateTime(link.respondedAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={TONE[link.status]}>{CARRIER_STATUS_LABELS[link.status]}</Pill>
                      {isOwner && link.status === "ativa" && (
                        <Button
                          variant="outline"
                          className="h-9"
                          disabled={busyId === link.id}
                          onClick={() => respond(link, "pausar")}
                        >
                          <PauseCircle className="size-4" /> Pausar
                        </Button>
                      )}
                      {isOwner && (link.status === "pausada" || link.status === "recusada") && (
                        <Button
                          variant="outline"
                          className="h-9"
                          disabled={busyId === link.id}
                          onClick={() => respond(link, "aceitar")}
                        >
                          <PlayCircle className="size-4" /> Voltar a compartilhar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Nenhum embarcador conectado. Quando um cliente convidar sua transportadora pelo
                portal Frotak Embarcador, o convite aparece aqui.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
