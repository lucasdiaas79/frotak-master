import JSZip from "jszip";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  CheckSquare,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Fuel,
  Gauge,
  MapPinned,
  Trash2,
  Search,
  Square,
  Trophy,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteFuelRecords, listFuelRecords } from "@/lib/services/fuel-records";
import { useFleet } from "@/lib/store";
import { FUEL_TYPE_LABEL, type FuelRecord, type FuelType } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/abastecimentos")({
  component: AbastecimentosPage,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateFormatter.format(date);
}

function formatDateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

type FuelRankMode = "diesel_s10" | "arla" | "diesel_arla";

type VehicleFuelSummary = {
  plate: string;
  vehicleId?: string;
  implementModel: string;
  stationCount: number;
  recordCount: number;
  dieselLiters: number;
  arlaLiters: number;
  totalAmount: number;
  kmPerLiter: number | null;
  latestAt: string;
  records: FuelRecord[];
};

function formatKmPerLiter(value: number | null) {
  if (value === null) return "Sem Km/L";
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} km/L`;
}

function matchesRankMode(record: FuelRecord, mode: FuelRankMode) {
  if (mode === "diesel_arla") return true;
  return record.fuelType === mode;
}

function calculateKmPerLiter(records: FuelRecord[]) {
  const dieselRecords = records
    .filter((record) => record.fuelType === "diesel_s10" && record.liters > 0 && record.odometer > 0)
    .sort((a, b) => a.odometer - b.odometer || new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  let distance = 0;
  let liters = 0;
  for (let index = 1; index < dieselRecords.length; index += 1) {
    const previous = dieselRecords[index - 1];
    const current = dieselRecords[index];
    const delta = current.odometer - previous.odometer;
    if (delta <= 0) continue;
    distance += delta;
    liters += current.liters;
  }

  if (distance <= 0 || liters <= 0) return null;
  return distance / liters;
}

async function fetchFileBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Falha ao baixar documento");
  return response.arrayBuffer();
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function AbastecimentosPage() {
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [plateFilter, setPlateFilter] = useState("");
  const [fuelTypeFilter, setFuelTypeFilter] = useState<"all" | FuelType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<FuelRecord | null>(null);
  const [selectedVehicleSummary, setSelectedVehicleSummary] = useState<VehicleFuelSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rankMode, setRankMode] = useState<FuelRankMode>("diesel_arla");
  const [stationFilter, setStationFilter] = useState("all");

  const vehicles = useFleet((state) => state.vehicles);
  const trailers = useFleet((state) => state.trailers);
  const loadFleet = useFleet((state) => state.loadAll);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadFleet().catch(() => undefined);
    listFuelRecords()
      .then((items) => {
        if (active) setRecords(items);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar abastecimentos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadFleet]);

  const filtered = useMemo(() => {
    const plate = plateFilter.trim().toUpperCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : undefined;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : undefined;

    return records.filter((record) => {
      const matchesPlate = !plate || record.vehiclePlate.toUpperCase().includes(plate);
      const matchesFuel = fuelTypeFilter === "all" || record.fuelType === fuelTypeFilter;

      const recordedAt = new Date(record.recordedAt);
      const validDate = !Number.isNaN(recordedAt.getTime());
      const matchesFrom = !fromDate || (validDate && recordedAt >= fromDate);
      const matchesTo = !toDate || (validDate && recordedAt <= toDate);

      return matchesPlate && matchesFuel && matchesFrom && matchesTo;
    });
  }, [records, plateFilter, fuelTypeFilter, dateFrom, dateTo]);

  const stations = useMemo(
    () =>
      Array.from(new Set(filtered.map((record) => record.station).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [filtered],
  );

  const vehicleMetaByPlate = useMemo(() => {
    const byTrailerId = new Map(trailers.map((trailer) => [trailer.id, trailer]));
    return new Map(
      vehicles.map((vehicle) => {
        const linkedTrailers = (vehicle.trailerIds?.length ? vehicle.trailerIds : vehicle.trailerId ? [vehicle.trailerId] : [])
          .map((id) => byTrailerId.get(id))
          .filter(Boolean);
        const implementModel =
          linkedTrailers
            .map((trailer) => trailer?.implementModel || trailer?.model || trailer?.type)
            .filter(Boolean)
            .join(" + ") || "Não informado";
        return [
          vehicle.plate.toUpperCase(),
          {
            vehicleId: vehicle.id,
            implementModel,
          },
        ];
      }),
    );
  }, [trailers, vehicles]);

  const rankingScope = useMemo(
    () =>
      filtered.filter((record) => {
        const matchesFuel = matchesRankMode(record, rankMode);
        const matchesStation = stationFilter === "all" || record.station === stationFilter;
        return matchesFuel && matchesStation;
      }),
    [filtered, rankMode, stationFilter],
  );

  const vehicleRanking = useMemo(() => {
    const byPlate = new Map<string, FuelRecord[]>();
    for (const record of rankingScope) {
      const plate = record.vehiclePlate.toUpperCase();
      byPlate.set(plate, [...(byPlate.get(plate) ?? []), record]);
    }

    return Array.from(byPlate.entries())
      .map(([plate, items]): VehicleFuelSummary => {
        const meta = vehicleMetaByPlate.get(plate);
        const stations = new Set(items.map((item) => item.station).filter(Boolean));
        return {
          plate,
          vehicleId: meta?.vehicleId ?? items.find((item) => item.vehicleId)?.vehicleId,
          implementModel: meta?.implementModel ?? "Não informado",
          stationCount: stations.size,
          recordCount: items.length,
          dieselLiters: items
            .filter((item) => item.fuelType === "diesel_s10")
            .reduce((total, item) => total + item.liters, 0),
          arlaLiters: items.filter((item) => item.fuelType === "arla").reduce((total, item) => total + item.liters, 0),
          totalAmount: items.reduce((total, item) => total + item.amount, 0),
          kmPerLiter: calculateKmPerLiter(items),
          latestAt: items
            .map((item) => item.recordedAt)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
          records: items.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
        };
      })
      .sort((a, b) => {
        if (a.kmPerLiter !== null && b.kmPerLiter !== null) return b.kmPerLiter - a.kmPerLiter;
        if (a.kmPerLiter !== null) return -1;
        if (b.kmPerLiter !== null) return 1;
        return b.recordCount - a.recordCount;
      });
  }, [rankingScope, vehicleMetaByPlate]);

  const topVehicleRanking = vehicleRanking.slice(0, 10);

  const selectedCount = selectedIds.length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((record) => selectedIds.includes(record.id));
  const selectedRecords = useMemo(
    () => records.filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds],
  );

  const clearFilters = () => {
    setPlateFilter("");
    setFuelTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => (checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)));
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((current) => current.filter((id) => !filtered.some((record) => record.id === id)));
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...filtered.map((record) => record.id)])));
  };

  const exportSelected = async () => {
    if (selectedRecords.length === 0) return;
    setExporting(true);

    try {
      const zip = new JSZip();

      for (const record of selectedRecords) {
        const folder = zip.folder(
          sanitizeFileName(`${record.vehiclePlate}-${record.fuelType}-${formatDateInput(record.recordedAt) || record.id}`),
        );
        if (!folder) continue;

        folder.file(
          "resumo.json",
          JSON.stringify(
            {
              id: record.id,
              vehiclePlate: record.vehiclePlate,
              driverName: record.driverName,
              station: record.station,
              fuelType: record.fuelType,
              fuelTypeLabel: FUEL_TYPE_LABEL[record.fuelType],
              liters: record.liters,
              amount: record.amount,
              odometer: record.odometer,
              notes: record.notes,
              recordedAt: record.recordedAt,
            },
            null,
            2,
          ),
        );

        if (record.invoiceUrl) {
          const fileName = sanitizeFileName(record.invoiceFileName ?? `nota-${record.id}`);
          try {
            const buffer = await fetchFileBuffer(record.invoiceUrl);
            folder.file(fileName, buffer);
          } catch {
            folder.file(`${fileName}.txt`, "Falha ao baixar documento.");
          }
        } else if (record.invoiceFileName) {
          folder.file(`${sanitizeFileName(record.invoiceFileName)}.txt`, "Documento indisponível para download.");
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `Abastecimentos ${formatDateInput(new Date().toISOString()) || "exportação"}.zip`);
    } finally {
      setExporting(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    try {
      await deleteFuelRecords(selectedIds);
      setRecords((current) => current.filter((record) => !selectedIds.includes(record.id)));
      setSelectedIds([]);
      setSelectedRecord((current) => (current && selectedIds.includes(current.id) ? null : current));
      toast.success("Abastecimentos apagados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao apagar abastecimentos.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Abastecimentos"
        subtitle="Registros de Diesel S10 e Arla enviados pelo sistema do motorista"
      />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Filtro</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={plateFilter}
                onChange={(event) => setPlateFilter(event.target.value)}
                className="h-10 pl-9"
                placeholder="Filtrar por placa"
              />
            </span>
          </label>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Filtro</span>
            <Select value={fuelTypeFilter} onValueChange={(value) => setFuelTypeFilter(value as "all" | FuelType)}>
              <SelectTrigger className="h-10">
                <span className="flex items-center gap-2">
                  <Filter className="size-4" />
                  <SelectValue placeholder="Combustível" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Diesel + Arla</SelectItem>
                <SelectItem value="diesel_s10">Só Diesel S10</SelectItem>
                <SelectItem value="arla">Só Arla</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Data inicial</span>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Data final</span>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10" />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Ação</span>
            <Button variant="outline" className="h-10 w-full" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Ação</span>
            <button
              type="button"
              onClick={() => toggleSelectAll(!allFilteredSelected)}
              className="flex h-10 w-full items-center justify-between rounded-2xl border border-border bg-surface/60 px-4 text-sm font-medium transition hover:bg-accent/45"
            >
              <span className="flex items-center gap-2">
                {allFilteredSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                Selecionar tudo
              </span>
              <span className="text-muted-foreground">{filtered.length}</span>
            </button>
          </div>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Ação</span>
            <Button className="h-10 w-full" onClick={exportSelected} disabled={selectedCount === 0 || exporting}>
              <Download className="size-4" />
              {exporting ? "Exportando..." : `Exportar (${selectedCount})`}
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Ação</span>
            <Button
              variant="destructive"
              className="h-10 w-full"
              onClick={deleteSelected}
              disabled={selectedCount === 0 || deleting}
            >
              <Trash2 className="size-4" />
              {deleting ? "Apagando..." : `Apagar (${selectedCount})`}
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Ação</span>
            <div className="flex h-10 items-center justify-between rounded-2xl border border-border bg-surface/60 px-4 text-sm">
              <span className="font-medium">Registros</span>
              <span className="text-muted-foreground">{filtered.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="fuel-ranking-panel">
        <div className="fuel-ranking-head">
          <div>
            <p>Ranking de eficiência</p>
            <h2>Top 10 caminhões por Km/L</h2>
            <span>Ordenado do melhor para o pior com base nos abastecimentos filtrados.</span>
          </div>
          <div className="fuel-ranking-controls">
            <Select value={rankMode} onValueChange={(value) => setRankMode(value as FuelRankMode)}>
              <SelectTrigger>
                <Filter className="size-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="diesel_arla">Diesel + Arla</SelectItem>
                <SelectItem value="diesel_s10">Diesel</SelectItem>
                <SelectItem value="arla">Arla</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stationFilter} onValueChange={setStationFilter}>
              <SelectTrigger>
                <MapPinned className="size-4" />
                <SelectValue placeholder="Posto de gasolina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os postos</SelectItem>
                {stations.map((station) => (
                  <SelectItem key={station} value={station}>
                    {station}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="fuel-ranking-empty">Calculando ranking de abastecimentos...</div>
        ) : topVehicleRanking.length ? (
          <div className="fuel-ranking-grid">
            {topVehicleRanking.map((item, index) => (
              <FuelRankingCard
                key={item.plate}
                item={item}
                index={index}
                onClick={() => setSelectedVehicleSummary(item)}
              />
            ))}
          </div>
        ) : (
          <div className="fuel-ranking-empty">
            Nenhum caminhão com abastecimentos para os filtros selecionados.
          </div>
        )}

        <div className="fuel-ranking-footer">
          <span>{vehicleRanking.length} caminhão(ões) analisado(s)</span>
          <a href="#lista-abastecimentos">Ver todos</a>
        </div>
      </section>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando abastecimentos...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum abastecimento encontrado para os filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <div id="lista-abastecimentos" className="overflow-hidden rounded-2xl border border-border bg-surface/70">
          {filtered.map((record) => {
            const checked = selectedIds.includes(record.id);
            return (
              <div
                key={record.id}
                className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/35"
              >
                <div className="flex items-start pt-1">
                  <Checkbox checked={checked} onCheckedChange={(value) => toggleSelected(record.id, value === true)} />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(record)}
                  className="flex min-w-0 flex-1 flex-col gap-3 text-left md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Truck className="size-3.5" />
                        {record.vehiclePlate}
                      </Badge>
                      <Badge variant={record.fuelType === "diesel_s10" ? "default" : "outline"}>
                        {FUEL_TYPE_LABEL[record.fuelType]}
                      </Badge>
                    </div>
                    <h2 className="truncate text-sm font-semibold text-foreground">{record.station}</h2>
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {record.driverName ?? "Motorista não informado"} · {formatDate(record.recordedAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-[12.5px] text-muted-foreground md:text-right">
                    <p className="font-semibold text-foreground">{formatNumber(record.liters)} L</p>
                    <p>{moneyFormatter.format(record.amount)}</p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-3xl overflow-y-auto">
          {selectedRecord ? (
            <>
              <DialogHeader>
                <DialogTitle>Abastecimento {selectedRecord.vehiclePlate}</DialogTitle>
                <DialogDescription>
                  {selectedRecord.station} · {formatDate(selectedRecord.recordedAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Truck className="size-3.5" />
                      {selectedRecord.vehiclePlate}
                    </Badge>
                    <Badge variant={selectedRecord.fuelType === "diesel_s10" ? "default" : "outline"}>
                      {FUEL_TYPE_LABEL[selectedRecord.fuelType]}
                    </Badge>
                  </div>
                  <Fuel className="size-5 text-muted-foreground" />
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <FuelDetail label="Motorista" value={selectedRecord.driverName ?? "Não informado"} />
                  <FuelDetail label="Posto" value={selectedRecord.station} />
                  <FuelDetail label="Data" value={formatDate(selectedRecord.recordedAt)} />
                  <FuelDetail label="Litragem" value={`${formatNumber(selectedRecord.liters)} L`} />
                  <FuelDetail label="Valor" value={moneyFormatter.format(selectedRecord.amount)} />
                  <FuelDetail label="Odômetro" value={formatNumber(selectedRecord.odometer)} />
                </div>

                {selectedRecord.notes ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">{selectedRecord.notes}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Gauge className="size-3.5" />
                    Registro enviado pelo motorista
                  </span>
                  {selectedRecord.invoiceUrl ? (
                    <a
                      href={selectedRecord.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 font-semibold text-foreground transition hover:bg-accent"
                    >
                      <Download className="size-3.5" />
                      Abrir nota
                    </a>
                  ) : selectedRecord.invoiceFileName ? (
                    <span className="inline-flex items-center gap-2">
                      <FileText className="size-3.5" />
                      {selectedRecord.invoiceFileName}
                    </span>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedVehicleSummary}
        onOpenChange={(open) => !open && setSelectedVehicleSummary(null)}
      >
        <DialogContent className="max-w-5xl overflow-y-auto">
          {selectedVehicleSummary ? (
            <>
              <DialogHeader>
                <DialogTitle>Abastecimentos {selectedVehicleSummary.plate}</DialogTitle>
                <DialogDescription>
                  Histórico da placa dentro dos filtros atuais do ranking.
                </DialogDescription>
              </DialogHeader>

              <div className="fuel-modal-summary">
                <FuelDetail label="Km/L" value={formatKmPerLiter(selectedVehicleSummary.kmPerLiter)} />
                <FuelDetail label="Implemento" value={selectedVehicleSummary.implementModel} />
                <FuelDetail label="Diesel" value={`${formatNumber(selectedVehicleSummary.dieselLiters)} L`} />
                <FuelDetail label="Arla" value={`${formatNumber(selectedVehicleSummary.arlaLiters)} L`} />
                <FuelDetail label="Total" value={moneyFormatter.format(selectedVehicleSummary.totalAmount)} />
              </div>

              <div className="fuel-modal-list">
                {selectedVehicleSummary.records.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedRecord(record)}
                    className="fuel-modal-row"
                  >
                    <div>
                      <strong>{record.station}</strong>
                      <span>{formatDate(record.recordedAt)}</span>
                    </div>
                    <Badge variant={record.fuelType === "diesel_s10" ? "default" : "outline"}>
                      {FUEL_TYPE_LABEL[record.fuelType]}
                    </Badge>
                    <span>{formatNumber(record.liters)} L</span>
                    <span>{moneyFormatter.format(record.amount)}</span>
                    <ChevronRight className="size-4" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FuelRankingCard({
  item,
  index,
  onClick,
}: {
  item: VehicleFuelSummary;
  index: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="fuel-ranking-card" onClick={onClick}>
      <div className="fuel-ranking-card-top">
        <span>#{String(index + 1).padStart(2, "0")}</span>
        {index < 3 ? <Trophy className="size-4" /> : <Truck className="size-4" />}
      </div>
      <strong>{item.plate}</strong>
      <div className="fuel-ranking-kpi">
        <Gauge className="size-4" />
        <span>{formatKmPerLiter(item.kmPerLiter)}</span>
      </div>
      <div className="fuel-ranking-meta">
        <span>Modelo implemento</span>
        <b>{item.implementModel}</b>
      </div>
      <div className="fuel-ranking-card-foot">
        <span>{item.recordCount} registro(s)</span>
        <span>{item.stationCount} posto(s)</span>
      </div>
    </button>
  );
}

function FuelDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface/50 p-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
