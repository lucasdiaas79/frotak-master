import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Package, Search } from "lucide-react";
import { FreightDetailSheet } from "@/components/shipper/FreightDetailSheet";
import {
  Card,
  EmptyState,
  FilterChips,
  PageTitle,
  Pill,
  StatusPill,
  formatDateTime,
  timeAgo,
} from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { formatDuration, hasProof, isActive, isDelivered } from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import type { ShipperFreight } from "@/lib/shipper/types";

type Filter = "todas" | "andamento" | "doca" | "ocorrencia" | "entregues" | "sem_canhoto";

export const Route = createFileRoute("/embarcador/cargas")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: ShipperFreightsPage,
});

const FILTERS: Array<{ id: Filter; label: string; test: (f: ShipperFreight) => boolean }> = [
  { id: "todas", label: "Todas", test: () => true },
  { id: "andamento", label: "Em andamento", test: isActive },
  {
    id: "doca",
    label: "Em doca",
    test: (f) => isActive(f) && f.statusLabel.startsWith("No local"),
  },
  { id: "ocorrencia", label: "Ocorrência", test: (f) => isActive(f) && !!f.occurrence },
  { id: "entregues", label: "Entregues", test: isDelivered },
  { id: "sem_canhoto", label: "Sem canhoto", test: (f) => isDelivered(f) && !hasProof(f) },
];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function exportCsv(freights: ShipperFreight[]) {
  const header = [
    "Codigo",
    "Transportadora",
    "Placa",
    "Motorista",
    "Produto",
    "Origem",
    "Destino",
    "Status",
    "Inicio",
    "Entrega",
    "Espera carregamento (min)",
    "Espera descarga (min)",
    "Canhoto",
    "CO2 (kg)",
  ];
  const rows = freights.map((f) => [
    f.code,
    f.carrierName,
    f.plate,
    f.driverFirstName ?? "",
    f.product ?? "",
    [f.originName, f.origin].filter(Boolean).join(" - "),
    [f.destinationName, f.destination].filter(Boolean).join(" - "),
    f.occurrence ? "Ocorrencia" : f.statusLabel,
    f.startedAt ?? "",
    f.deliveredAt ?? "",
    f.loadingDwellMin ?? "",
    f.unloadingDwellMin ?? "",
    hasProof(f) ? "sim" : "nao",
    f.co2Kg ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cargas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function ShipperFreightsPage() {
  const { data } = useShipperPortal();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<Filter>("todas");
  const [carrierId, setCarrierId] = useState("todas");
  const [text, setText] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const test = FILTERS.find((item) => item.id === filter)!.test;
    const q = normalize(text.trim());
    return data.freights.filter(
      (freight) =>
        test(freight) &&
        (carrierId === "todas" || freight.carrierId === carrierId) &&
        (!q ||
          normalize(
            [
              freight.code,
              freight.plate,
              freight.carrierName,
              freight.destinationName,
              freight.destination,
              freight.originName,
              freight.product,
              freight.driverFirstName,
            ]
              .filter(Boolean)
              .join(" "),
          ).includes(q)),
    );
  }, [data, filter, carrierId, text]);

  if (!data) return null;
  const selected = data.freights.find((freight) => freight.id === search.id) ?? null;
  const select = (id?: string) => void navigate({ search: { id }, replace: true });
  const carriers = data.carriers.filter((carrier) =>
    data.freights.some((f) => f.carrierId === carrier.id),
  );

  return (
    <div className="space-y-5">
      <PageTitle
        eyebrow="Cargas"
        title="Todas as suas cargas"
        subtitle="Fretes em que sua empresa é remetente ou destinatária, nas transportadoras conectadas. Histórico de 90 dias."
        actions={
          <Button variant="outline" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
            <Download className="size-4" /> Exportar planilha
          </Button>
        }
      />

      <Card className="space-y-3 p-4">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((item) => ({
            id: item.id,
            label: item.label,
            count: data.freights.filter(item.test).length,
          }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Buscar por placa, destino, produto ou código"
              className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-[13px] outline-none focus:border-primary/50"
            />
          </label>
          <select
            value={carrierId}
            onChange={(event) => setCarrierId(event.target.value)}
            className="h-10 rounded-full border border-border bg-card px-4 text-[13px] font-semibold outline-none"
          >
            <option value="todas">Todas as transportadoras</option>
            {carriers.map((carrier) => (
              <option key={carrier.id} value={carrier.id}>
                {carrier.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="p-0">
        {filtered.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    {[
                      "Carga",
                      "Transportadora",
                      "Destino",
                      "Status",
                      "Atualização",
                      "Doca",
                      "Docs",
                    ].map((head) => (
                      <th key={head} className="label-tiny px-4 py-3 font-bold">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((freight) => (
                    <tr
                      key={freight.id}
                      onClick={() => select(freight.id)}
                      className="cursor-pointer border-b border-border/60 transition last:border-0 hover:bg-primary/5"
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold">{freight.plate}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {freight.product ?? freight.code}
                        </p>
                      </td>
                      <td className="px-4 py-3">{freight.carrierName}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{freight.destinationName ?? "-"}</p>
                        <p className="text-[12px] text-muted-foreground">{freight.destination}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill freight={freight} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {freight.deliveredAt
                          ? formatDateTime(freight.deliveredAt)
                          : timeAgo(freight.lastEventAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDuration(freight.unloadingDwellMin ?? freight.loadingDwellMin)}
                      </td>
                      <td className="px-4 py-3">
                        {isDelivered(freight) ? (
                          hasProof(freight) ? (
                            <Pill tone="good">Canhoto ok</Pill>
                          ) : (
                            <Pill tone="warning">Sem canhoto</Pill>
                          )
                        ) : (
                          <span className="text-muted-foreground">{freight.documents.length}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border/70 md:hidden">
              {filtered.map((freight) => (
                <li key={freight.id}>
                  <button
                    type="button"
                    onClick={() => select(freight.id)}
                    className="w-full space-y-1.5 px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold">
                        {freight.plate} · {freight.carrierName}
                      </span>
                      <StatusPill freight={freight} />
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {freight.destinationName ?? freight.destination} ·{" "}
                      {timeAgo(freight.lastEventAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={Package}
            title="Nenhuma carga neste filtro"
            text="Mude o filtro ou a busca para ver outras cargas."
          />
        )}
      </Card>

      <FreightDetailSheet freight={selected} onClose={() => select(undefined)} />
    </div>
  );
}
