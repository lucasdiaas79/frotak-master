import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Copy,
  Handshake,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Field } from "@/components/shipper/ShipperAuthFrame";
import {
  Card,
  EmptyState,
  PageTitle,
  Pill,
  formatCnpj,
  formatDateTime,
} from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeScorecards, formatDuration, type CarrierScorecard } from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import { CARRIER_STATUS_LABELS, type ShipperCarrier } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/transportadoras")({
  component: ShipperCarriersPage,
});

function inviteMessage(companyName: string, url: string) {
  return `Olá! A ${companyName} passou a acompanhar as cargas pela Frotak. Para conectar sua transportadora (é grátis para atender a gente), acesse: ${url}`;
}

function scoreTone(score?: number) {
  if (score === undefined) return "muted" as const;
  if (score >= 85) return "good" as const;
  if (score >= 65) return "warning" as const;
  return "danger" as const;
}

function ScoreRow({ card }: { card: CarrierScorecard }) {
  return (
    <div className="grid gap-3 rounded-[22px] border border-border bg-card p-4 lg:grid-cols-[1.4fr_repeat(6,1fr)] lg:items-center">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-[15px] font-black",
            card.rank === 1
              ? "bg-[#66BB1A]/20 text-primary"
              : "bg-surface-2/60 text-muted-foreground",
          )}
        >
          {card.rank ?? "-"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold">{card.carrier.name}</p>
          <p className="text-[12px] text-muted-foreground">
            {card.total} carga(s) · {card.active} em andamento
          </p>
        </div>
      </div>
      <Metric label="Nota">
        <Pill tone={scoreTone(card.score)} className="text-[13px]">
          {card.score ?? "sem dados"}
        </Pill>
      </Metric>
      <Metric label="Entregas">{card.delivered}</Metric>
      <Metric label="Ocorrências">{card.occurrences}</Metric>
      <Metric label="Canhoto (média)">
        {card.avgProofHours !== undefined ? `${card.avgProofHours.toFixed(1)} h` : "-"}
        {card.pendingProofs > 0 && (
          <span className="ml-1 text-[11px] text-warning">({card.pendingProofs} pend.)</span>
        )}
      </Metric>
      <Metric label="Rastreio">
        {card.trackedPct !== undefined ? `${card.trackedPct}%` : "-"}
      </Metric>
      <Metric label="Doca (descarga)">{formatDuration(card.avgUnloadingDwellMin)}</Metric>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 lg:block">
      <p className="label-tiny lg:mb-1">{label}</p>
      <p className="text-[14px] font-bold">{children}</p>
    </div>
  );
}

function ShipperCarriersPage() {
  const { data, inviteCarrier, renewInvite, removeCarrier } = useShipperPortal();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<ShipperCarrier | null>(null);
  const [form, setForm] = useState({ name: "", cnpj: "", contactName: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const cards = useMemo(() => (data ? computeScorecards(data) : []), [data]);
  if (!data) return null;

  const connected = cards.filter((card) => card.carrier.status === "ativa");
  const pending = data.carriers.filter((carrier) => carrier.status !== "ativa");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const carrier = await inviteCarrier(form);
      setInviteOpen(false);
      setForm({ name: "", cnpj: "", contactName: "", email: "", phone: "" });
      setLinkFor(carrier);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível convidar.");
    } finally {
      setBusy(false);
    }
  }

  async function renew(carrier: ShipperCarrier) {
    try {
      setLinkFor(await renewInvite(carrier.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link.");
    }
  }

  async function remove(carrier: ShipperCarrier) {
    try {
      await removeCarrier(carrier.id);
      toast.success(`${carrier.name} removida da lista.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  }

  const message = linkFor?.inviteUrl
    ? inviteMessage(data.profile.companyName, linkFor.inviteUrl)
    : "";

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Transportadoras"
        title="Suas transportadoras"
        subtitle="Convide quem leva suas cargas. Quando a transportadora aceita, as cargas aparecem sozinhas."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" /> Convidar transportadora
          </Button>
        }
      />

      <Card>
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" />
          <h2 className="text-[15px] font-extrabold">Ranking das conectadas</h2>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          A nota começa em 100 e cai com ocorrências, canhoto pendente ou demorado e carga sem
          rastreio. Precisa de pelo menos 2 cargas.
        </p>
        {connected.length ? (
          <div className="mt-4 space-y-2">
            {connected.map((card) => (
              <ScoreRow key={card.carrier.id} card={card} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Handshake}
            title="Nenhuma transportadora conectada ainda"
            text="Convide suas transportadoras. Elas aceitam pela Frotak e escolhem compartilhar as suas cargas."
          />
        )}
      </Card>

      {pending.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-extrabold">Convites</h2>
          <ul className="mt-3 divide-y divide-border/70">
            {pending.map((carrier) => (
              <li
                key={carrier.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[14px] font-bold">{carrier.name}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {carrier.cnpj ? `${formatCnpj(carrier.cnpj)} · ` : ""}
                    convidada em {formatDateTime(carrier.invitedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill
                    tone={
                      carrier.status === "recusada"
                        ? "danger"
                        : carrier.status === "pausada"
                          ? "muted"
                          : "warning"
                    }
                  >
                    {CARRIER_STATUS_LABELS[carrier.status]}
                  </Pill>
                  {carrier.status !== "pausada" && (
                    <Button variant="outline" className="h-9" onClick={() => renew(carrier)}>
                      <RefreshCw className="size-4" /> Reenviar convite
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="h-9 text-destructive"
                    onClick={() => remove(carrier)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        Você só vê as cargas em que o seu CNPJ é remetente ou destinatário, e nunca valores, custos
        ou outros clientes da transportadora. Ela pode pausar o compartilhamento quando quiser.
      </p>

      <Modal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Convidar transportadora"
        description="Você recebe um link para mandar por WhatsApp ou e-mail."
      >
        <form onSubmit={submit} className="space-y-4 p-6">
          <Field label="Nome da transportadora">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="CNPJ" hint="Se ela já usa a Frotak, o convite aparece direto na tela dela.">
            <Input
              inputMode="numeric"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="Opcional"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contato">
              <Input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="E-mail">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? "Criando convite..." : "Criar convite"}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!linkFor}
        onOpenChange={(open) => !open && setLinkFor(null)}
        title="Convite pronto"
        description={linkFor ? `Mande este link para a ${linkFor.name}.` : ""}
      >
        <div className="space-y-3 p-6">
          <textarea
            readOnly
            value={message}
            rows={4}
            className="w-full rounded-2xl border border-border bg-card p-3 text-[13px]"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  toast.success("Mensagem copiada.");
                } catch {
                  toast.error("Não foi possível copiar.");
                }
              }}
            >
              <Copy className="size-4" /> Copiar mensagem
            </Button>
            <a
              href={`https://wa.me/${linkFor?.contactPhone ? `55${linkFor.contactPhone.replace(/\D/g, "").replace(/^55/, "")}` : ""}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-success/30 bg-success/12 px-4 text-[13px] font-bold text-success"
            >
              <MessageCircle className="size-4" /> Enviar por WhatsApp
            </a>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Por segurança, o link não pode ser exibido de novo. Se perder, use "Reenviar convite".
          </p>
        </div>
      </Modal>
    </div>
  );
}
