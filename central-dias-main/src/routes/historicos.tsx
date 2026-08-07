import JSZip from "jszip";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckSquare,
  Download,
  Filter,
  History,
  MapPin,
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
import { deleteFreightHistory, listFreightHistory } from "@/lib/services/freight-history";
import type { FreightHistory } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/historicos")({
  component: HistoricosPage,
});

type HistoryDocumentFilter = "all" | "cte" | "nota_fiscal" | "descarga";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDate(value?: string) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateFormatter.format(date);
}

function formatDateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function timelineDescription(item: Record<string, unknown>) {
  const description = typeof item.description === "string" ? item.description : undefined;
  const status = typeof item.status === "string" ? item.status : undefined;
  const stage = typeof item.freightStage === "string" ? item.freightStage : undefined;
  return description || stage || status || "Etapa registrada";
}

function documentName(item: Record<string, unknown>) {
  return typeof item.fileName === "string"
    ? item.fileName
    : typeof item.file_name === "string"
      ? item.file_name
      : "Documento";
}

function documentKindValue(item: Record<string, unknown>) {
  return typeof item.kind === "string" ? item.kind : "documento";
}

function documentKindLabel(item: Record<string, unknown>) {
  return documentKindValue(item).replaceAll("_", " ");
}

function documentUrl(item: Record<string, unknown>) {
  return typeof item.url === "string" ? item.url : undefined;
}

function documentCreatedAt(item: Record<string, unknown>) {
  return typeof item.createdAt === "string"
    ? item.createdAt
    : typeof item.created_at === "string"
      ? item.created_at
      : undefined;
}

function documentMatchesFilter(item: Record<string, unknown>, filter: HistoryDocumentFilter) {
  const kind = documentKindValue(item);
  if (filter === "all") return true;
  if (filter === "cte") return kind === "cte" || kind === "cte_mdfe";
  if (filter === "nota_fiscal") return kind === "nota_fiscal";
  return (
    kind === "comprovante_descarga" ||
    kind === "comprovante_entrega" ||
    kind === "canhoto" ||
    kind === "recibo"
  );
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

function HistoricosPage() {
  const [items, setItems] = useState<FreightHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [plateFilter, setPlateFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [documentFilter, setDocumentFilter] = useState<HistoryDocumentFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedItem, setSelectedItem] = useState<FreightHistory | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listFreightHistory()
      .then((records) => {
        if (active) setItems(records);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar historicos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const states = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.recipientState).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b),
      ),
    [items],
  );

  const filtered = useMemo(() => {
    const plate = plateFilter.trim().toUpperCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : undefined;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : undefined;

    return items.filter((item) => {
      const matchesPlate = !plate || item.vehiclePlate.toUpperCase().includes(plate);
      const matchesState = stateFilter === "all" || item.recipientState === stateFilter;
      const matchesDocument =
        documentFilter === "all" || item.documents.some((document) => documentMatchesFilter(document, documentFilter));

      const finishedAt = new Date(item.finishedAt);
      const validDate = !Number.isNaN(finishedAt.getTime());
      const matchesFrom = !fromDate || (validDate && finishedAt >= fromDate);
      const matchesTo = !toDate || (validDate && finishedAt <= toDate);

      return matchesPlate && matchesState && matchesDocument && matchesFrom && matchesTo;
    });
  }, [items, plateFilter, stateFilter, documentFilter, dateFrom, dateTo]);

  const selectedCount = selectedIds.length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id));
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => (checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)));
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds((current) => current.filter((id) => !filtered.some((item) => item.id === id)));
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...filtered.map((item) => item.id)])));
  };

  const clearFilters = () => {
    setPlateFilter("");
    setStateFilter("all");
    setDocumentFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const exportSelected = async () => {
    if (selectedItems.length === 0) return;
    setExporting(true);

    try {
      const zip = new JSZip();

      for (const item of selectedItems) {
        const folder = zip.folder(
          sanitizeFileName(`${item.vehiclePlate}-${formatDateInput(item.finishedAt) || item.id}`),
        );
        if (!folder) continue;

        folder.file(
          "resumo.json",
          JSON.stringify(
            {
              id: item.id,
              freightId: item.freightId,
              vehiclePlate: item.vehiclePlate,
              driverName: item.driverName,
              trailerIdentifier: item.trailerIdentifier,
              senderName: item.senderName,
              senderCity: item.senderCity,
              senderState: item.senderState,
              recipientName: item.recipientName,
              recipientCity: item.recipientCity,
              recipientState: item.recipientState,
              productName: item.productName,
              freightValue: item.freightValue,
              startedAt: item.startedAt,
              finishedAt: item.finishedAt,
              finishReason: item.finishReason,
              finalStatus: item.finalStatus,
              finalFreightStage: item.finalFreightStage,
              stageTimeline: item.stageTimeline,
              events: item.events,
            },
            null,
            2,
          ),
        );

        const documentsFolder = folder.folder("documentos");
        for (const [index, document] of item.documents.entries()) {
          const url = documentUrl(document);
          const fileName = sanitizeFileName(documentName(document));
          const prefix = `${String(index + 1).padStart(2, "0")}-${documentKindValue(document)}`;

          if (!documentsFolder) continue;
          if (!url) {
            documentsFolder.file(`${prefix}-${fileName}.txt`, "Documento indisponivel para download.");
            continue;
          }

          try {
            const buffer = await fetchFileBuffer(url);
            documentsFolder.file(`${prefix}-${fileName}`, buffer);
          } catch {
            documentsFolder.file(`${prefix}-${fileName}.txt`, "Falha ao baixar documento.");
          }
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `Historico de frete ${formatDateInput(new Date().toISOString()) || "exportacao"}.zip`);
    } finally {
      setExporting(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    try {
      await deleteFreightHistory(selectedIds);
      setItems((current) => current.filter((item) => !selectedIds.includes(item.id)));
      setSelectedIds([]);
      setSelectedItem((current) => (current && selectedIds.includes(current.id) ? null : current));
      toast.success("Historicos apagados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao apagar historicos.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Historicos"
        subtitle="Fretes finalizados com rota, documentos e horarios das etapas"
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
                placeholder="Filtrar por caminhao"
              />
            </span>
          </label>

          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Filtro</span>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="h-10">
                <span className="flex items-center gap-2">
                  <Filter className="size-4" />
                  <SelectValue placeholder="Estado" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Filtro</span>
            <Select value={documentFilter} onValueChange={(value) => setDocumentFilter(value as HistoryDocumentFilter)}>
              <SelectTrigger className="h-10">
                <span className="flex items-center gap-2">
                  <History className="size-4" />
                  <SelectValue placeholder="Documentos" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os documentos</SelectItem>
                <SelectItem value="cte">So CTE</SelectItem>
                <SelectItem value="nota_fiscal">So nota fiscal</SelectItem>
                <SelectItem value="descarga">So arquivos de descarga</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 text-sm">
            <span className="invisible text-muted-foreground">Acao</span>
            <Button variant="outline" className="h-10 w-full" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Data inicial</span>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Data final</span>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10" />
          </label>
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
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando historicos...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum frete finalizado encontrado para os filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface/70">
          {filtered.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/35"
              >
                <div className="flex items-start pt-1">
                  <Checkbox checked={checked} onCheckedChange={(value) => toggleSelected(item.id, value === true)} />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="flex min-w-0 flex-1 flex-col gap-3 text-left md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Truck className="size-3.5" />
                        {item.vehiclePlate}
                      </Badge>
                      {item.recipientState ? <Badge variant="outline">{item.recipientState}</Badge> : null}
                      <Badge variant="outline">{item.finishReason.replaceAll("_", " ")}</Badge>
                    </div>
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {item.senderName ?? "Origem nao informada"} {"->"} {item.recipientName ?? "Destino nao informado"}
                    </h2>
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {item.driverName ?? "Motorista nao informado"} · {item.productName ?? "Produto nao informado"}
                    </p>
                  </div>
                  <div className="shrink-0 text-[12.5px] text-muted-foreground md:text-right">
                    <p className="font-semibold text-foreground">{formatDate(item.finishedAt)}</p>
                    <p>{item.freightValue ? moneyFormatter.format(item.freightValue) : "Valor nao informado"}</p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-4xl overflow-y-auto">
          {selectedItem ? (
            <>
              <DialogHeader>
                <DialogTitle>Frete {selectedItem.vehiclePlate}</DialogTitle>
                <DialogDescription>
                  {selectedItem.senderName ?? "Origem nao informada"} {"->"}{" "}
                  {selectedItem.recipientName ?? "Destino nao informado"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Truck className="size-3.5" />
                    {selectedItem.vehiclePlate}
                  </Badge>
                  {selectedItem.recipientState ? <Badge variant="outline">{selectedItem.recipientState}</Badge> : null}
                  <Badge variant="outline">{selectedItem.finishReason.replaceAll("_", " ")}</Badge>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <Detail label="Motorista" value={selectedItem.driverName ?? "Nao informado"} />
                  <Detail label="Cacamba" value={selectedItem.trailerIdentifier ?? "Nao informada"} />
                  <Detail label="Inicio" value={formatDate(selectedItem.startedAt)} />
                  <Detail label="Finalizacao" value={formatDate(selectedItem.finishedAt)} />
                  <Detail label="Origem" value={`${selectedItem.senderCity ?? "-"} / ${selectedItem.senderState ?? "-"}`} />
                  <Detail
                    label="Destino"
                    value={`${selectedItem.recipientCity ?? "-"} / ${selectedItem.recipientState ?? "-"}`}
                  />
                  <Detail label="Produto" value={selectedItem.productName ?? "Produto nao informado"} />
                  <Detail
                    label="Valor"
                    value={selectedItem.freightValue ? moneyFormatter.format(selectedItem.freightValue) : "Valor nao informado"}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="size-4" />
                    Horarios das etapas
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedItem.stageTimeline.map((stage, index) => (
                      <div key={`${selectedItem.id}-${index}`} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">{timelineDescription(stage)}</p>
                        <p className="text-muted-foreground">
                          {formatDate(typeof stage.timestamp === "string" ? stage.timestamp : undefined)}
                        </p>
                      </div>
                    ))}
                    {selectedItem.stageTimeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma etapa registrada.</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <History className="size-3.5" />
                    {selectedItem.events.length} eventos
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {selectedItem.documents.length} documentos
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="size-4" />
                    Documentos do frete
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedItem.documents.map((document, index) => {
                      const url = documentUrl(document);
                      return (
                        <div key={`${selectedItem.id}-doc-${index}`} className="rounded-md border p-3 text-sm">
                          <p className="font-medium capitalize">{documentKindLabel(document)}</p>
                          <p className="mt-1 truncate text-muted-foreground">{documentName(document)}</p>
                          <p className="mt-1 text-muted-foreground">{formatDate(documentCreatedAt(document))}</p>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex text-xs font-semibold text-primary"
                            >
                              Abrir documento
                            </a>
                          ) : (
                            <p className="mt-3 text-xs text-muted-foreground">Arquivo indisponivel</p>
                          )}
                        </div>
                      );
                    })}
                    {selectedItem.documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum documento arquivado.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface/50 p-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
