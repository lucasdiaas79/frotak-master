import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, FileWarning, History, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  currentWorkflowRank,
  manualTargetByCode,
  manualTargetsForMacroStage,
  missingDocumentsForTarget,
  pendingDocumentLabel,
  skippedTargetLabels,
} from "@/lib/freight-kanban";
import type { ManualTargetCode } from "@/lib/freight-kanban";
import { freightMacroStageById } from "@/lib/freight-workflow";
import type { FreightMacroStageId } from "@/lib/freight-workflow";
import { manualMoveFreightCard, WorkflowConflictError } from "@/lib/services/manual-kanban";
import type { FreightDocument, Vehicle } from "@/lib/types";

const INFORMATION_SOURCES = [
  { value: "ligacao_motorista", label: "Ligação do motorista" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "rastreamento", label: "Rastreamento" },
  { value: "cliente_remetente", label: "Cliente/remetente" },
  { value: "destinatario", label: "Destinatário" },
  { value: "equipe_patio", label: "Equipe de pátio" },
  { value: "informacao_interna", label: "Informação interna" },
  { value: "correcao_operacional", label: "Correção operacional" },
  { value: "outra", label: "Outra fonte" },
];

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

interface ManualMoveDialogProps {
  open: boolean;
  vehicle: Vehicle | null;
  targetMacroStage: FreightMacroStageId | null;
  documents: FreightDocument[];
  onOpenChange: (open: boolean) => void;
  onApplied: (vehicle: Vehicle) => void | Promise<void>;
  onConflict: () => void | Promise<void>;
}

export function ManualMoveDialog({
  open,
  vehicle,
  targetMacroStage,
  documents,
  onOpenChange,
  onApplied,
  onConflict,
}: ManualMoveDialogProps) {
  const targets = useMemo(
    () => (targetMacroStage ? manualTargetsForMacroStage(targetMacroStage) : []),
    [targetMacroStage],
  );
  const [targetCode, setTargetCode] = useState<ManualTargetCode | "">("");
  const [reason, setReason] = useState("");
  const [informationSource, setInformationSource] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue(new Date()));
  const [observation, setObservation] = useState("");
  const [confirmDocuments, setConfirmDocuments] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetCode(targets[0]?.code ?? "");
    setReason("");
    setInformationSource("");
    setOccurredAt(localDateTimeValue(new Date()));
    setObservation("");
    setConfirmDocuments(false);
  }, [open, targets]);

  const selectedTarget = targetCode ? manualTargetByCode(targetCode) : null;
  const missingDocuments =
    vehicle && selectedTarget ? missingDocumentsForTarget(vehicle, selectedTarget, documents) : [];
  const skippedStages =
    vehicle && selectedTarget ? skippedTargetLabels(vehicle, selectedTarget) : [];
  const movedBackward =
    !!vehicle && !!selectedTarget && selectedTarget.rank < currentWorkflowRank(vehicle);
  const targetMacroLabel = targetMacroStage
    ? freightMacroStageById(targetMacroStage).label
    : "Destino";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicle || !selectedTarget) return;
    if (reason.trim().length < 8) {
      toast.error("Informe um motivo com pelo menos 8 caracteres.");
      return;
    }
    if (!informationSource) {
      toast.error("Selecione a fonte da informação.");
      return;
    }
    if (missingDocuments.length > 0 && !confirmDocuments) {
      toast.error("Confirme os documentos informados por fonte externa.");
      return;
    }

    const parsedDate = new Date(occurredAt);
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error("Informe uma data e hora válidas.");
      return;
    }

    try {
      setSubmitting(true);
      const updated = await manualMoveFreightCard({
        vehicle,
        targetCode: selectedTarget.code,
        reason,
        informationSource,
        occurredAt: parsedDate.toISOString(),
        observation,
        confirmDocuments,
      });
      await onApplied(updated);
      toast.success(`${vehicle.plate} movido para ${targetMacroLabel}.`);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof WorkflowConflictError) {
        await onConflict();
        toast.warning("O frete mudou enquanto o modal estava aberto. Os dados foram recarregados.");
        onOpenChange(false);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o card.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Conciliação manual da etapa"
      description="Movimentação auditada pela expedição"
      size="lg"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="manual-freight-move-form" disabled={submitting}>
            {submitting ? "Aplicando..." : "Confirmar movimentação"}
          </Button>
        </div>
      }
    >
      <form id="manual-freight-move-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/55 p-4">
          <div className="min-w-0 flex-1">
            <div className="label-tiny">Veículo</div>
            <div className="mt-1 font-sans text-[16px] font-black">{vehicle?.plate ?? "-"}</div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-right">
            <div className="label-tiny">Macrocoluna de destino</div>
            <div className="mt-1 truncate text-[14px] font-extrabold text-primary">
              {targetMacroLabel}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Microetapa exata</Label>
            <Select
              value={targetCode}
              onValueChange={(value) => setTargetCode(value as ManualTargetCode)}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione a microetapa" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.code} value={target.code}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTarget && (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {selectedTarget.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Fonte da informação</Label>
            <Select value={informationSource} onValueChange={setInformationSource}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione a fonte" />
              </SelectTrigger>
              <SelectContent>
                {INFORMATION_SOURCES.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="manual-move-occurred-at">Data e hora real da ocorrência</Label>
            <Input
              id="manual-move-occurred-at"
              type="datetime-local"
              value={occurredAt}
              max={localDateTimeValue(new Date())}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-move-reason">Motivo obrigatório</Label>
            <Input
              id="manual-move-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex.: motorista informou a etapa por telefone"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-move-observation">Observação</Label>
          <Textarea
            id="manual-move-observation"
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            placeholder="Detalhes adicionais da conciliação operacional..."
            rows={3}
          />
        </div>

        {skippedStages.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <div className="text-[13px] font-extrabold text-foreground">Etapas serão puladas</div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {skippedStages.join(", ")}. O histórico anterior será preservado e o salto ficará
                registrado na auditoria.
              </p>
            </div>
          </div>
        )}

        {movedBackward && (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
            <History className="mt-0.5 size-5 shrink-0 text-blue-400" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Este movimento volta o frete para uma etapa anterior. Nenhum evento será apagado; uma
              correção manual será adicionada ao histórico.
            </p>
          </div>
        )}

        {missingDocuments.length > 0 ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <FileWarning className="mt-0.5 size-5 shrink-0 text-warning" />
              <div>
                <div className="text-[13px] font-extrabold">Documento pendente</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {missingDocuments.map(pendingDocumentLabel).join(" e ")} não está vinculado ao
                  frete atual. O card ficará sinalizado até o documento ser anexado.
                </p>
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-warning/25 bg-background/30 p-3">
              <Checkbox
                checked={confirmDocuments}
                onCheckedChange={(checked) => setConfirmDocuments(checked === true)}
                className="mt-0.5"
              />
              <span className="text-[12px] leading-relaxed text-foreground/85">
                Confirmo que a informação documental foi recebida por fonte externa e será
                regularizada no mesmo frete.
              </span>
            </label>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-success/25 bg-success/10 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Os documentos exigidos para a microetapa estão vinculados ao freight_id atual.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
