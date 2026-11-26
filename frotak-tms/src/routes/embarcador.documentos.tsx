import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, FileWarning, MessageCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { FreightDetailSheet } from "@/components/shipper/FreightDetailSheet";
import {
  Card,
  EmptyState,
  FilterChips,
  PageTitle,
  Pill,
  formatDateTime,
} from "@/components/shipper/ShipperUi";
import { formatDuration, hasProof, isDelivered, proofDelayHours } from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import type { ShipperDocument, ShipperFreight } from "@/lib/shipper/types";

type Kind = "todos" | "comprovantes" | "nf" | "cte" | "balanca";

export const Route = createFileRoute("/embarcador/documentos")({
  component: ShipperDocumentsPage,
});

const KIND_TEST: Record<Kind, (doc: ShipperDocument) => boolean> = {
  todos: () => true,
  comprovantes: (doc) => doc.isProof,
  nf: (doc) => doc.kind === "nota_fiscal",
  cte: (doc) => doc.kind === "cte" || doc.kind === "cte_mdfe",
  balanca: (doc) => doc.kind === "balanca",
};

function ShipperDocumentsPage() {
  const { data, documentUrl, demo } = useShipperPortal();
  const [kind, setKind] = useState<Kind>("todos");
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [] as Array<{ doc: ShipperDocument; freight: ShipperFreight }>;
    return data.freights
      .flatMap((freight) => freight.documents.map((doc) => ({ doc, freight })))
      .sort((a, b) => new Date(b.doc.sentAt).getTime() - new Date(a.doc.sentAt).getTime());
  }, [data]);

  if (!data) return null;
  const q = text.trim().toLowerCase();
  const filtered = rows.filter(
    ({ doc, freight }) =>
      KIND_TEST[kind](doc) &&
      (!q ||
        [freight.plate, freight.carrierName, freight.destinationName, freight.code]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
  const pending = data.freights.filter((freight) => isDelivered(freight) && !hasProof(freight));
  const pendingByCarrier = data.carriers
    .map((carrier) => ({
      carrier,
      freights: pending.filter((freight) => freight.carrierId === carrier.id),
    }))
    .filter((group) => group.freights.length);
  const selected = data.freights.find((freight) => freight.id === selectedId) ?? null;

  async function open(doc: ShipperDocument) {
    if (demo) {
      toast.info("Na demonstração os arquivos não abrem. Na conta real, o documento abre aqui.");
      return;
    }
    try {
      const url = await documentUrl(doc.id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir.");
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Documentos"
        title="Central de documentos"
        subtitle="NF, CT-e, MDF-e, ticket de balança e comprovantes de entrega de todas as cargas."
      />

      {pendingByCarrier.length > 0 && (
        <Card className="border-warning/35">
          <div className="flex items-center gap-2">
            <FileWarning className="size-4 text-warning" />
            <h2 className="text-[15px] font-extrabold">Canhotos pendentes</h2>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {pendingByCarrier.map(({ carrier, freights }) => {
              const plates = freights.map((freight) => freight.plate).join(", ");
              const message = `Olá! Estamos sem o canhoto/comprovante de entrega das cargas: ${plates}. Pode enviar pelo app Frotak?`;
              return (
                <div key={carrier.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-bold">{carrier.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {freights.length} carga(s) sem comprovante
                      </p>
                    </div>
                    {carrier.contactPhone && (
                      <a
                        href={`https://wa.me/55${carrier.contactPhone.replace(/\D/g, "").replace(/^55/, "")}?text=${encodeURIComponent(message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-success/30 bg-success/12 px-3 text-[12px] font-bold text-success"
                      >
                        <MessageCircle className="size-3.5" /> Cobrar
                      </a>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {freights.map((freight) => (
                      <li key={freight.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(freight.id)}
                          className="flex w-full justify-between text-left text-[12px] hover:text-primary"
                        >
                          <span className="font-semibold">
                            {freight.plate} · {freight.destinationName}
                          </span>
                          <span className="text-muted-foreground">
                            entregue há {formatDuration((proofDelayHours(freight) ?? 0) * 60)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <FilterChips
          value={kind}
          onChange={setKind}
          options={(
            [
              ["todos", "Todos"],
              ["comprovantes", "Comprovantes"],
              ["nf", "Notas fiscais"],
              ["cte", "CT-e / MDF-e"],
              ["balanca", "Balança"],
            ] as Array<[Kind, string]>
          ).map(([id, label]) => ({
            id,
            label,
            count: rows.filter(({ doc }) => KIND_TEST[id](doc)).length,
          }))}
        />
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar por placa, transportadora ou destino"
            className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-[13px] outline-none focus:border-primary/50"
          />
        </label>
      </Card>

      <Card className="p-0">
        {filtered.length ? (
          <ul className="divide-y divide-border/70">
            {filtered.map(({ doc, freight }) => (
              <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </span>
                <button
                  type="button"
                  onClick={() => open(doc)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold">
                    {doc.label}
                    {doc.isProof && <Pill tone="good">Comprovante</Pill>}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {freight.plate} · {freight.carrierName} ·{" "}
                    {freight.destinationName ?? freight.destination}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedId(freight.id)}
                  className="hidden text-[12px] font-bold text-primary hover:underline sm:block"
                >
                  Ver carga
                </button>
                <span className="w-24 shrink-0 text-right text-[12px] text-muted-foreground">
                  {formatDateTime(doc.sentAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="Nenhum documento aqui"
            text="Os documentos aparecem assim que o motorista ou a transportadora enviam."
          />
        )}
      </Card>

      <FreightDetailSheet freight={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
