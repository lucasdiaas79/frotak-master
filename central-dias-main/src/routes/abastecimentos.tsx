import JSZip from "jszip";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckSquare,
  Download,
  FileText,
  Filter,
  Fuel,
  Gauge,
  Trash2,
  Search,
  Square,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
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
  }, []);

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
          folder.file(`${sanitizeFileName(record.invoiceFileName)}.txt`, "Documento indisponivel para download.");
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `Abastecimentos ${formatDateInput(new Date().toISOString()) || "exportacao"}.zip`);
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
                  <SelectValue placeholder="Combustivel" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Diesel + Arla</SelectItem>
                <SelectItem value="diesel_s10">So Diesel S10</SelectItem>
                <SelectItem value="arla">So Arla</SelectItem>
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
            <span className="invisible text-muted-foreground">Acao</span>
            <Button variant="outline" className="h-10 w-full" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Acao</span>
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
            <span className="invisible text-muted-foreground">Acao</span>
            <Button className="h-10 w-full" onClick={exportSelected} disabled={selectedCount === 0 || exporting}>
              <Download className="size-4" />
              {exporting ? "Exportando..." : `Exportar (${selectedCount})`}
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Acao</span>
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
            <span className="invisible text-muted-foreground">Acao</span>
            <div className="flex h-10 items-center justify-between rounded-2xl border border-border bg-surface/60 px-4 text-sm">
              <span className="font-medium">Registros</span>
              <span className="text-muted-foreground">{filtered.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
        <div className="overflow-hidden rounded-2xl border border-border bg-surface/70">
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
                      {record.driverName ?? "Motorista nao informado"} · {formatDate(record.recordedAt)}
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
                  <FuelDetail label="Motorista" value={selectedRecord.driverName ?? "Nao informado"} />
                  <FuelDetail label="Posto" value={selectedRecord.station} />
                  <FuelDetail label="Data" value={formatDate(selectedRecord.recordedAt)} />
                  <FuelDetail label="Litragem" value={`${formatNumber(selectedRecord.liters)} L`} />
                  <FuelDetail label="Valor" value={moneyFormatter.format(selectedRecord.amount)} />
                  <FuelDetail label="Odometro" value={formatNumber(selectedRecord.odometer)} />
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
    </div>
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
