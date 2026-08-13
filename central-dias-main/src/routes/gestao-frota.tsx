import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Container,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileText,
  FilterX,
  History,
  ListChecks,
  MapPin,
  MessageCircle,
  PackageCheck,
  GripVertical,
  RefreshCw,
  RouteIcon,
  Search,
  SearchCheck,
  Send,
  ShieldCheck,
  Truck,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ManualMoveDialog } from "@/components/fleet/ManualMoveDialog";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";
import * as freightDocumentsService from "@/lib/services/freight-documents";
import {
  advanceFreightStage as advanceFreightStageOperation,
  applyFinalFreightCommand,
  createFreightOperation,
} from "@/lib/freight-operations";
import {
  FREIGHT_MACRO_STAGES,
  FREIGHT_STAGES,
  formatFreightCode,
  freightMacroStageById,
  freightStageById,
  freightStageIndex,
  isFinalFreightStage,
  macroStageOfVehicle,
  nextFreightStage,
  stageOfVehicle,
  stageFromLegacyStatus,
} from "@/lib/freight-workflow";
import type {
  FreightMacroStage,
  FreightMacroStageId,
  FreightStage,
  FreightStageId,
  FreightTone,
} from "@/lib/freight-workflow";
import { useFleet } from "@/lib/store";
import { vehicleTrailerIds, vehicleTrailerLabel } from "@/lib/vehicle-trailers";
import {
  ALL_STATUSES,
  UFS,
  VEHICLE_SITUATION_LABEL,
  VEHICLE_STATUS_LABEL,
  isAvailableVehicleStatus,
  isAvailableVehicleSituation,
  statusGroup,
} from "@/lib/types";
import type {
  Driver,
  FreightDocument,
  Product,
  Recipient,
  Sender,
  Trailer,
  Vehicle,
  VehicleSituation,
  VehicleStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/gestao-frota")({
  head: () => ({
    meta: [
      { title: "Central de Fretes - Central Transportes" },
      {
        name: "description",
        content: "Pipeline operacional de fretes por etapa da rota.",
      },
    ],
  }),
  component: GestaoFrotaPage,
});

type Situacao = "all" | "operacao" | "parado" | "quebrado" | "manutencao" | "sem-vinculo";
type ViewMode = "pipeline" | "table";
type DemandMode = "create" | "detail";
type FreightCreateMode = "individual" | "group";
type DocumentKind = "note" | "cte";
type FinalCommand = "RETORNO_SOLICITADO" | "PRONTO_NOVO_FRETE";

interface LocalDocument {
  id?: string;
  name: string;
  uploadedAt: string;
  status: "recebido" | "em-conferencia" | "aprovado" | "anexado" | "rejeitado";
  url?: string;
  source?: FreightDocument["source"];
  mimeType?: string;
  resentAfterRejection?: boolean;
}

interface FreightDocuments {
  note?: LocalDocument;
  cte?: LocalDocument;
}

interface FreightDemand extends Vehicle {
  code: string;
  stage: FreightStage;
  macroStage: FreightMacroStage;
  microStatus: MicroStatus;
  driver?: Driver;
  trailer?: Trailer;
  trailerLabel: string;
  implementTypes: string[];
  implementTypeLabel: string;
  sender?: Sender;
  recipient?: Recipient;
  product?: Product;
  documents: FreightDocuments;
  situacao: Exclude<Situacao, "all">;
}

interface MicroStatus {
  label: string;
  tone: FreightTone;
  urgent?: boolean;
}

interface AvailableDriverResource {
  id: string;
  driver?: Driver;
  vehicle: Vehicle;
  trailer?: Trailer;
  trailerLabel: string;
  implementTypes: string[];
  implementTypeLabel: string;
  implementModel: string;
  cityLabel: string;
}

interface FreightFormState {
  vehicleId: string;
  driverId: string;
  trailerId: string;
  senderId: string;
  recipientId: string;
  productId: string;
  observations: string;
}

interface GroupFreightFormState {
  senderId: string;
  recipientId: string;
  productId: string;
  observations: string;
  vehicleIds: string[];
}

const EMPTY_FORM: FreightFormState = {
  vehicleId: "",
  driverId: "",
  trailerId: "",
  senderId: "",
  recipientId: "",
  productId: "",
  observations: "",
};

const EMPTY_GROUP_FORM: GroupFreightFormState = {
  senderId: "",
  recipientId: "",
  productId: "",
  observations: "",
  vehicleIds: [],
};

const STAGE_ICONS: Record<FreightStageId, LucideIcon> = {
  DISPONIVEL: ClipboardCheck,
  EM_ROTA_CARREGAR: RouteIcon,
  AGUARDANDO_NOTA: FileClock,
  NOTA_EM_CONFERENCIA: SearchCheck,
  NOTA_APROVADA_AG_CTE: FileCheck2,
  CTE_GERADA_AG_CONFIRMACAO_MOTORISTA: Send,
  EM_ROTA_ENTREGA: Truck,
  ENTREGUE_AG_FINALIZACAO: PackageCheck,
  ENTREGA_FINALIZADA: CheckCircle2,
};

const MACRO_STAGE_ICONS: Record<FreightMacroStageId, LucideIcon> = {
  DISPONIVEIS: ClipboardCheck,
  INDO_CARREGAR: RouteIcon,
  AGUARDANDO_CTE: FileCheck2,
  EM_ROTA_ENTREGA: Truck,
  ROTA_FINALIZADA: CheckCircle2,
};

const TONE_CLASS: Record<FreightTone, string> = {
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  maintenance: "border-maintenance/25 bg-maintenance/10 text-maintenance",
  muted: "border-border bg-muted/50 text-muted-foreground",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

const CARD_TONE_CLASS: Record<FreightTone, string> = {
  primary: "border-primary/35 hover:border-primary/55",
  success: "border-success/35 hover:border-success/55",
  warning: "border-warning/40 hover:border-warning/60",
  maintenance: "border-maintenance/40 hover:border-maintenance/60",
  muted: "border-border hover:border-muted-foreground/35",
  info: "border-blue-500/40 hover:border-blue-500/60",
};

const SITUACAO_LABEL: Record<Exclude<Situacao, "all">, string> = {
  operacao: "Em rota",
  parado: "Parado",
  quebrado: "Quebrado",
  manutencao: "Manutenção",
  "sem-vinculo": "Sem vínculo",
};

const SITUACAO_TONE: Record<Exclude<Situacao, "all">, string> = {
  operacao: "border-success/25 bg-success/10 text-success",
  parado: "border-warning/25 bg-warning/10 text-warning",
  quebrado: "border-destructive/25 bg-destructive/10 text-destructive",
  manutencao: "border-maintenance/25 bg-maintenance/10 text-maintenance",
  "sem-vinculo": "border-border bg-muted/50 text-muted-foreground",
};

const PIPELINE_SITUACOES: Array<Exclude<Situacao, "all">> = ["operacao", "parado"];
const TABLE_SITUACOES: Array<Exclude<Situacao, "all">> = [
  "operacao",
  "parado",
  "quebrado",
  "manutencao",
  "sem-vinculo",
];

function cardValue(value?: string | null) {
  return value?.trim() || "—";
}

function cardTrailerLabel(trailer?: Trailer) {
  return cardValue(trailer?.implementModel);
}

function cardProductLabel(product?: Product) {
  return cardValue(product?.name);
}

function cardLocationLabel(city?: string | null, state?: string | null) {
  const cityLabel = city?.trim();
  const stateLabel = state?.trim();
  if (cityLabel && stateLabel) return `${cityLabel} - ${stateLabel}`;
  return cardValue(cityLabel || stateLabel);
}

function cardRouteLabel(sender?: Sender, recipient?: Recipient) {
  return `${cardLocationLabel(sender?.city, sender?.state)} → ${cardLocationLabel(
    recipient?.city,
    recipient?.state,
  )}`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function trailerImplementTypes(
  vehicle: Pick<Vehicle, "trailerId" | "trailerIds">,
  trailersById: Map<string, Trailer>,
) {
  return uniqueNonEmpty(
    vehicleTrailerIds(vehicle).map((id) => trailersById.get(id)?.implementType),
  );
}

function GestaoFrotaPage() {
  const navigate = useNavigate();
  const {
    vehicles,
    drivers,
    trailers,
    senders,
    recipients,
    products,
    link,
    loadAll,
    setVehicleStatus,
    archiveFreight,
  } = useFleet();

  const [search, setSearch] = useState("");
  const [stageF, setStageF] = useState<string>("all");
  const [legacyStatusF, setLegacyStatusF] = useState<string>("all");
  const [implementTypeF, setImplementTypeF] = useState<string>("all");
  const [ufF, setUfF] = useState<string>("all");
  const [sitF, setSitF] = useState<Situacao>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [documentsByVehicle, setDocumentsByVehicle] = useState<Record<string, FreightDocuments>>(
    {},
  );
  const [freightDocuments, setFreightDocuments] = useState<FreightDocument[]>([]);
  const [finalCommandByVehicle, setFinalCommandByVehicle] = useState<Record<string, FinalCommand>>(
    {},
  );
  const [stageDrawerId, setStageDrawerId] = useState<FreightMacroStageId | null>(null);
  const [demandPanel, setDemandPanel] = useState<{ mode: DemandMode; id?: string } | null>(null);
  const [editStatusId, setEditStatusId] = useState<string | null>(null);
  const [editStatusValue, setEditStatusValue] = useState<VehicleStatus>("rota-carregar");
  const [createMode, setCreateMode] = useState<FreightCreateMode>("individual");
  const [form, setForm] = useState<FreightFormState>(EMPTY_FORM);
  const [groupForm, setGroupForm] = useState<GroupFreightFormState>(EMPTY_GROUP_FORM);
  const [intendedStageAfterCreation, setIntendedStageAfterCreation] =
    useState<FreightMacroStageId | null>(null);
  const [manualMove, setManualMove] = useState<{
    vehicle: Vehicle;
    targetMacroStage: FreightMacroStageId;
  } | null>(null);
  const [closeFreightDemand, setCloseFreightDemand] = useState<FreightDemand | null>(null);
  const [closeFreightReason, setCloseFreightReason] = useState("finalizado_pela_expedicao");
  const [closingFreight, setClosingFreight] = useState(false);

  const driversById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );
  const trailersById = useMemo(
    () => new Map(trailers.map((trailer) => [trailer.id, trailer])),
    [trailers],
  );
  const sendersById = useMemo(
    () => new Map(senders.map((sender) => [sender.id, sender])),
    [senders],
  );
  const recipientsById = useMemo(
    () => new Map(recipients.map((recipient) => [recipient.id, recipient])),
    [recipients],
  );
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const implementTypeOptions = useMemo(
    () =>
      uniqueNonEmpty(trailers.map((trailer) => trailer.implementType)).sort((a, b) =>
        a.localeCompare(b),
      ),
    [trailers],
  );
  const activeDriverIds = useMemo(() => {
    return new Set(
      vehicles
        .filter((vehicle) => {
          const stage = stageOfVehicle(vehicle);
          return vehicle.driverId && stage !== "DISPONIVEL" && !isFinalFreightStage(stage);
        })
        .map((vehicle) => vehicle.driverId as string),
    );
  }, [vehicles]);

  useEffect(() => {
    let cancelled = false;
    const documentRefs = vehicles.map((vehicle) => ({
      vehicleId: vehicle.id,
      freightId: vehicle.currentFreightId,
    }));

    freightDocumentsService
      .listFreightDocuments(documentRefs)
      .then((documents) => {
        if (cancelled) return;
        setFreightDocuments(documents);
        const grouped: Record<string, FreightDocuments> = {};
        for (const document of documents) {
          const key =
            document.kind === "nota_fiscal"
              ? "note"
              : document.kind === "cte" || document.kind === "cte_mdfe"
                ? "cte"
                : undefined;
          if (!key) continue;
          const previous = grouped[document.vehicleId]?.[key];
          const resentAfterRejection =
            key === "note" &&
            document.status === "em-conferencia" &&
            documents.some(
              (candidate) =>
                candidate.vehicleId === document.vehicleId &&
                candidate.kind === "nota_fiscal" &&
                candidate.status === "rejeitado" &&
                candidate.createdAt < document.createdAt,
            );

          if (previous?.uploadedAt && previous.uploadedAt > document.createdAt) continue;
          grouped[document.vehicleId] = {
            ...(grouped[document.vehicleId] ?? {}),
            [key]: {
              id: document.id,
              name: document.fileName,
              uploadedAt: document.createdAt,
              status:
                document.status === "em-conferencia"
                  ? "em-conferencia"
                  : document.status === "aprovado"
                    ? "aprovado"
                    : document.status === "rejeitado"
                      ? "rejeitado"
                      : "anexado",
              url: document.url,
              source: document.source,
              mimeType: document.mimeType,
              resentAfterRejection,
            },
          };
        }
        setDocumentsByVehicle(grouped);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [vehicles]);

  const demands = useMemo<FreightDemand[]>(() => {
    return vehicles
      .map((vehicle) => {
        const stage = freightStageById(stageOfVehicle(vehicle));
        const documents = documentsByVehicle[vehicle.id] ?? {};
        const macroStage = freightMacroStageById(macroStageOfVehicle(vehicle));
        const driver = vehicle.driverId ? driversById.get(vehicle.driverId) : undefined;
        const linkedTrailer = vehicle.trailerId ? trailersById.get(vehicle.trailerId) : undefined;
        const implementTypes = trailerImplementTypes(vehicle, trailersById);
        const trailerLabel = vehicleTrailerLabel(vehicle, trailers, "");
        const linkedProduct = vehicle.productId ? productsById.get(vehicle.productId) : undefined;
        return {
          ...vehicle,
          code: formatFreightCode(vehicle),
          stage,
          macroStage,
          microStatus: microStatusOf(
            stage.id,
            documents,
            vehicle.status,
            vehicle.situation,
            finalCommandByVehicle[vehicle.id],
          ),
          driver,
          trailer: linkedTrailer,
          trailerLabel,
          implementTypes,
          implementTypeLabel: implementTypes.join(" + "),
          sender: vehicle.senderId ? sendersById.get(vehicle.senderId) : undefined,
          recipient: vehicle.recipientId ? recipientsById.get(vehicle.recipientId) : undefined,
          product: linkedProduct,
          documents,
          situacao: situacaoOf(vehicle.situation, vehicle.status, !!driver),
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [
    vehicles,
    driversById,
    trailersById,
    trailers,
    sendersById,
    recipientsById,
    productsById,
    documentsByVehicle,
    finalCommandByVehicle,
  ]);

  const availableDriverResources = useMemo<AvailableDriverResource[]>(() => {
    return vehicles
      .filter((vehicle) => !vehicle.currentFreightId && isVehicleAvailableForFreight(vehicle))
      .map((vehicle) => {
        const driver = vehicle.driverId ? driversById.get(vehicle.driverId) : undefined;
        const linkedTrailer = vehicle.trailerId ? trailersById.get(vehicle.trailerId) : undefined;
        const trailerLabel = vehicleTrailerLabel(vehicle, trailers, "");
        const implementTypes = trailerImplementTypes(vehicle, trailersById);
        const implementModel = linkedTrailer?.implementModel?.trim() || "";
        return {
          id: vehicle.id,
          driver,
          vehicle,
          trailer: linkedTrailer,
          trailerLabel,
          implementTypes,
          implementTypeLabel: implementTypes.join(" + "),
          implementModel,
          cityLabel: `${vehicle.city}/${vehicle.state}`,
        };
      })
      .filter((resource) => {
        const q = search.trim().toLowerCase();
        if (stageF !== "all" && stageF !== "DISPONIVEIS") return false;
        if (q) {
          const haystack = [
            resource.driver?.name,
            resource.driver?.cnh,
            resource.vehicle.plate,
            resource.vehicle.city,
            resource.vehicle.state,
            resource.trailerLabel,
            resource.implementTypeLabel,
            resource.trailer?.implementModel,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (implementTypeF !== "all" && !resource.implementTypes.includes(implementTypeF)) {
          return false;
        }
        if (ufF !== "all" && resource.vehicle.state !== ufF) return false;
        if (sitF !== "all" && sitF !== "parado") return false;
        return true;
      })
      .sort((a, b) => a.vehicle.plate.localeCompare(b.vehicle.plate));
  }, [vehicles, driversById, trailersById, trailers, search, stageF, implementTypeF, ufF, sitF]);

  const filteredDemands = useMemo(() => {
    return demands.filter((demand) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const haystack = [
          demand.code,
          demand.plate,
          demand.driver?.name,
          demand.city,
          demand.state,
          demand.sender?.name,
          demand.sender?.city,
          demand.recipient?.name,
          demand.recipient?.city,
          demand.product?.name,
          demand.trailerLabel,
          demand.implementTypeLabel,
          demand.trailer?.implementModel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (stageF !== "all" && demand.macroStage.id !== stageF) return false;
      if (legacyStatusF !== "all" && demand.status !== legacyStatusF) return false;
      if (implementTypeF !== "all" && !demand.implementTypes.includes(implementTypeF)) return false;
      if (ufF !== "all" && demand.state !== ufF) return false;
      if (sitF !== "all" && demand.situacao !== sitF) return false;
      return true;
    });
  }, [demands, search, stageF, legacyStatusF, implementTypeF, ufF, sitF]);

  const countsByStage = useMemo(() => {
    return FREIGHT_MACRO_STAGES.reduce(
      (acc, stage) => {
        acc[stage.id] =
          stage.id === "DISPONIVEIS"
            ? availableDriverResources.length
            : filteredDemands.filter((demand) => demand.macroStage.id === stage.id).length;
        return acc;
      },
      {} as Record<FreightMacroStageId, number>,
    );
  }, [filteredDemands, availableDriverResources.length]);

  const selectedDemand = demandPanel?.id
    ? (demands.find((demand) => demand.id === demandPanel.id) ?? null)
    : null;
  const stageDrawer = stageDrawerId ? freightMacroStageById(stageDrawerId) : null;
  const stageDrawerDemands = stageDrawerId
    ? filteredDemands.filter((demand) => demand.macroStage.id === stageDrawerId)
    : [];
  const stageDrawerCount =
    stageDrawerId === "DISPONIVEIS" ? availableDriverResources.length : stageDrawerDemands.length;
  const editing = vehicles.find((vehicle) => vehicle.id === editStatusId) || null;
  const situacaoOptions = viewMode === "pipeline" ? PIPELINE_SITUACOES : TABLE_SITUACOES;

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAll();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [loadAll]);

  const clearFilters = () => {
    setSearch("");
    setStageF("all");
    setLegacyStatusF("all");
    setImplementTypeF("all");
    setUfF("all");
    setSitF("all");
  };

  useEffect(() => {
    if (viewMode === "pipeline" && !PIPELINE_SITUACOES.includes(sitF as Exclude<Situacao, "all">)) {
      setSitF("all");
    }
  }, [sitF, viewMode]);

  const formWithVehicleDefaults = useCallback(
    (seed?: Partial<FreightFormState>): FreightFormState => {
      const vehicle = seed?.vehicleId ? vehicles.find((item) => item.id === seed.vehicleId) : null;
      const linkedDriver = vehicle?.driverId
        ? drivers.find((item) => item.id === vehicle.driverId)
        : undefined;
      const linkedTrailer = vehicle?.trailerId
        ? trailers.find((item) => item.id === vehicle.trailerId)
        : undefined;

      return {
        ...EMPTY_FORM,
        ...seed,
        driverId: seed?.driverId ?? linkedDriver?.id ?? "",
        trailerId: seed?.trailerId ?? linkedTrailer?.id ?? "",
      };
    },
    [drivers, trailers, vehicles],
  );

  const openCreate = useCallback(
    (seed?: Partial<FreightFormState>) => {
      const nextForm = formWithVehicleDefaults(seed);
      setCreateMode("individual");
      setForm(nextForm);
      setGroupForm({
        ...EMPTY_GROUP_FORM,
        senderId: seed?.senderId ?? "",
        recipientId: seed?.recipientId ?? "",
        productId: seed?.productId ?? "",
        observations: seed?.observations ?? "",
        vehicleIds: seed?.vehicleId ? [seed.vehicleId] : [],
      });
      setDemandPanel({ mode: "create" });
    },
    [formWithVehicleDefaults],
  );

  const openDemand = (id: string) => {
    setDemandPanel({ mode: "detail", id });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("central:new-freight-seed");
    if (!raw) return;

    window.sessionStorage.removeItem("central:new-freight-seed");
    try {
      const seed = JSON.parse(raw) as Partial<FreightFormState>;
      openCreate({
        vehicleId: seed.vehicleId ?? "",
        driverId: seed.driverId ?? "",
      });
    } catch {
      openCreate();
    }
  }, [openCreate]);

  const closeDemandPanel = (preserveIntendedStage = false) => {
    setDemandPanel(null);
    setCreateMode("individual");
    setForm(EMPTY_FORM);
    setGroupForm(EMPTY_GROUP_FORM);
    if (!preserveIntendedStage) setIntendedStageAfterCreation(null);
  };

  const startFreightFromAvailable = async (
    resource: AvailableDriverResource,
    targetMacroStageId: FreightMacroStageId,
  ) => {
    if (targetMacroStageId === "DISPONIVEIS") return;
    setIntendedStageAfterCreation(targetMacroStageId);
    openCreate({
      vehicleId: resource.vehicle.id,
      driverId: resource.driver?.id ?? "",
      trailerId: resource.trailer?.id ?? resource.vehicle.trailerId ?? "",
    });
  };

  const moveDemandToMacroStage = async (
    demand: FreightDemand,
    targetMacroStageId: FreightMacroStageId,
  ) => {
    if (targetMacroStageId === demand.macroStage.id) return;
    if (targetMacroStageId === "DISPONIVEIS") {
      setCloseFreightReason("finalizado_pela_expedicao");
      setCloseFreightDemand(demand);
      return;
    }

    setManualMove({ vehicle: demand, targetMacroStage: targetMacroStageId });
  };

  const advanceDemand = async (demand: FreightDemand, explicitNext?: FreightStageId) => {
    const result = await advanceFreightStageOperation({
      demand,
      explicitNext,
      setVehicleStatus,
      onResetFinalCommand: (vehicleId) =>
        setFinalCommandByVehicle((current) => {
          const nextCommands = { ...current };
          delete nextCommands[vehicleId];
          return nextCommands;
        }),
    });
    if (!result.ok && result.reason === "missing-note") {
      toast.error("Nota obrigatoria", {
        description: "Anexe ou receba a nota para mover o frete para Aguardando Ct-e/Mdf-e.",
      });
      return;
    }
    if (!result.ok && result.reason === "missing-cte") {
      toast.error("CTE obrigatorio", {
        description: "Anexe o CTE para deixar o frete aguardando confirmacao do motorista.",
      });
      return;
    }
    if (!result.ok) return;
    toast.success("Etapa atualizada", {
      description: `${demand.code} ? ${result.nextStage.label}`,
    });
  };

  const setFinalCommand = async (demand: FreightDemand, command: FinalCommand) => {
    setFinalCommandByVehicle((current) => ({ ...current, [demand.id]: command }));
    const result = await applyFinalFreightCommand({
      command,
      demand,
      setVehicleStatus,
      archiveFreight,
    });
    if (result.action === "create-next-freight") {
      openCreate({
        vehicleId: result.seed.vehicleId,
        driverId: result.seed.driverId,
        trailerId: result.seed.trailerId,
      });
    }
    toast.success(
      command === "RETORNO_SOLICITADO" ? "Retorno solicitado" : "Pronto para novo frete",
      { description: demand.code },
    );
  };

  const handleDocument = async (demand: FreightDemand, kind: DocumentKind, file: File) => {
    const uploaded = await freightDocumentsService.uploadFreightDocument({
      vehicleId: demand.id,
      freightId: demand.currentFreightId,
      driverId: demand.driver?.id,
      kind: kind === "note" ? "nota_fiscal" : "cte_mdfe",
      file,
      source: "gestao_central",
      status: kind === "note" ? "em-conferencia" : "anexado",
    });

    const document: LocalDocument = {
      id: uploaded.id,
      name: uploaded.fileName,
      uploadedAt: uploaded.createdAt,
      status: kind === "note" ? "em-conferencia" : "anexado",
      url: uploaded.url,
      source: uploaded.source,
    };

    setDocumentsByVehicle((current) => ({
      ...current,
      [demand.id]: {
        ...(current[demand.id] ?? {}),
        [kind]: document,
      },
    }));

    if (kind === "note") {
      await advanceDemand(demand, "NOTA_EM_CONFERENCIA");
      toast.success("Nota anexada para conferência");
      return;
    }

    await setVehicleStatus(
      demand.id,
      "aguardando-confirmacao",
      "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA",
    );
    toast.success("CTE anexado e enviado para confirmação");
  };

  const approveNote = async (demand: FreightDemand) => {
    if (demand.documents.note?.id) {
      await freightDocumentsService.updateFreightDocumentStatus(
        demand.documents.note.id,
        "aprovado",
      );
    }
    setDocumentsByVehicle((current) => ({
      ...current,
      [demand.id]: {
        ...(current[demand.id] ?? {}),
        note: current[demand.id]?.note
          ? { ...current[demand.id]!.note!, status: "aprovado" }
          : {
              name: "Nota fiscal",
              uploadedAt: new Date().toISOString(),
              status: "aprovado",
            },
      },
    }));
    await advanceDemand(demand, "NOTA_APROVADA_AG_CTE");
  };

  const rejectNote = async (demand: FreightDemand) => {
    if (!demand.documents.note?.id) return;

    await freightDocumentsService.updateFreightDocumentStatus(
      demand.documents.note.id,
      "rejeitado",
    );
    await setVehicleStatus(demand.id, "aguardando-cte", "NOTA_EM_CONFERENCIA");
    await supabase.from("fleet_events").insert({
      vehicle_id: demand.id,
      freight_id: demand.currentFreightId ?? null,
      status: "aguardando-cte",
      freight_stage: "NOTA_EM_CONFERENCIA",
      city: demand.city,
      state: demand.state,
      source: "Operador",
      description: "Expedição não conseguiu ler a nota fiscal. Solicitar nova foto.",
      event_type: "nota_fiscal_rejeitada",
      action_origin: "gestao_central",
      metadata: { noteDocumentId: demand.documents.note.id },
    });

    setDocumentsByVehicle((current) => ({
      ...current,
      [demand.id]: {
        ...(current[demand.id] ?? {}),
        note: current[demand.id]?.note
          ? { ...current[demand.id]!.note!, status: "rejeitado", resentAfterRejection: false }
          : undefined,
      },
    }));

    toast.success("Nota reprovada", {
      description: "O motorista foi avisado para reenviar uma foto melhor.",
    });
  };

  const createFreight = async () => {
    const vehicle = vehicles.find((item) => item.id === form.vehicleId);
    const driver = drivers.find((item) => item.id === form.driverId);
    if (!vehicle || !driver || !form.senderId || !form.recipientId || !form.productId) {
      toast.error("Preencha os campos obrigatórios para criar o frete.");
      return;
    }
    if (!isDriverAvailable(driver, form.vehicleId, activeDriverIds)) {
      toast.error("Motorista indisponível para novo frete.");
      return;
    }
    if (!isVehicleAvailableForFreight(vehicle)) {
      toast.error("Veículo indisponível para operação.");
      return;
    }

    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === form.vehicleId);
    const trailerIds =
      selectedVehicle?.trailerIds?.[0] === form.trailerId ? selectedVehicle.trailerIds : undefined;
    await createFreightOperation({
      vehicleId: form.vehicleId,
      driverId: form.driverId,
      trailerId: form.trailerId || undefined,
      trailerIds,
      senderId: form.senderId,
      recipientId: form.recipientId,
      productId: form.productId,
      link,
      setVehicleStatus,
    });
    toast.success("Frete criado", { description: `${vehicle.plate} · ${driver.name}` });
    const intendedStage = intendedStageAfterCreation;
    closeDemandPanel(true);
    setIntendedStageAfterCreation(null);

    if (intendedStage && intendedStage !== "INDO_CARREGAR") {
      await loadAll();
      const updatedVehicle = useFleet
        .getState()
        .vehicles.find((candidate) => candidate.id === vehicle.id);
      if (updatedVehicle?.currentFreightId) {
        setManualMove({ vehicle: updatedVehicle, targetMacroStage: intendedStage });
      }
    }
  };

  const createGroupFreight = async () => {
    if (!groupForm.senderId || !groupForm.recipientId || !groupForm.productId) {
      toast.error("Preencha origem, destino e produto para criar o frete em grupo.");
      return;
    }
    if (groupForm.vehicleIds.length === 0) {
      toast.error("Selecione pelo menos um caminhão para o frete em grupo.");
      return;
    }

    const selectedResources = groupForm.vehicleIds
      .map((vehicleId) =>
        availableDriverResources.find((resource) => resource.vehicle.id === vehicleId),
      )
      .filter((resource): resource is AvailableDriverResource => Boolean(resource));

    if (selectedResources.length !== groupForm.vehicleIds.length) {
      toast.error("Um ou mais caminhões selecionados não estão mais disponíveis.");
      return;
    }

    const missingDriver = selectedResources.find((resource) => !resource.driver);
    if (missingDriver) {
      toast.error("Todos os caminhões do grupo precisam ter motorista vinculado.", {
        description: missingDriver.vehicle.plate,
      });
      return;
    }

    for (const resource of selectedResources) {
      await createFreightOperation({
        vehicleId: resource.vehicle.id,
        driverId: resource.driver!.id,
        trailerId: resource.vehicle.trailerId || undefined,
        trailerIds: resource.vehicle.trailerIds,
        senderId: groupForm.senderId,
        recipientId: groupForm.recipientId,
        productId: groupForm.productId,
        link,
        setVehicleStatus,
      });
    }

    toast.success("Frete em grupo criado", {
      description: `${selectedResources.length} caminhões atribuídos ao mesmo frete.`,
    });
    closeDemandPanel();
  };

  const confirmCloseFreight = async () => {
    if (!closeFreightDemand) return;
    try {
      setClosingFreight(true);
      await archiveFreight(closeFreightDemand.id, closeFreightReason);
      toast.success("Frete arquivado", {
        description: `${closeFreightDemand.plate} voltou para Disponíveis.`,
      });
      setCloseFreightDemand(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível arquivar o frete.");
    } finally {
      setClosingFreight(false);
    }
  };

  const totals = {
    active: filteredDemands.filter((demand) => demand.macroStage.id !== "ROTA_FINALIZADA").length,
    available: countsByStage.DISPONIVEIS,
    loading: countsByStage.INDO_CARREGAR,
    cte: countsByStage.AGUARDANDO_CTE,
    delivery: countsByStage.EM_ROTA_ENTREGA,
    done: countsByStage.ROTA_FINALIZADA,
  };

  return (
    <div className="space-y-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Central de Fretes"
        subtitle="Demandas por etapa operacional, com documentos e avanço de rota"
        actions={
          <>
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <Button onClick={() => openCreate()} className="h-10 gap-2">
              <Truck className="size-4" />
              Criar frete
            </Button>
          </>
        }
        className="mx-0 mt-3 md:mt-0"
      />

      <Metrics totals={totals} />

      <section className="premium-card p-4">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="label-tiny">Filtros da esteira</div>
            <h2 className="mt-1 text-[15px] font-extrabold text-foreground">
              Localize por placa, motorista, origem, destino, UF ou código
            </h2>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 self-start rounded-2xl px-2 py-1.5 text-[12px] font-bold text-muted-foreground transition hover:bg-accent hover:text-foreground md:self-auto"
          >
            <FilterX className="size-3.5" />
            Limpar filtros
          </button>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(240px,1.4fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(170px,1fr)_100px_minmax(150px,1fr)]">
          <div className="field-shell flex h-10 items-center gap-2 px-3">
            <Search className="size-4 shrink-0 text-primary" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por frete, placa, motorista, cidade..."
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <Select value={stageF} onValueChange={setStageF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {FREIGHT_MACRO_STAGES.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={legacyStatusF} onValueChange={setLegacyStatusF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {ALL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {VEHICLE_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={implementTypeF} onValueChange={setImplementTypeF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue placeholder="Tipo implemento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os implementos</SelectItem>
              {implementTypeOptions.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ufF} onValueChange={setUfF}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas UFs</SelectItem>
              {UFS.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sitF} onValueChange={(value) => setSitF(value as Situacao)}>
            <SelectTrigger className="h-10 text-[12.5px]">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas situações</SelectItem>
              {situacaoOptions.includes("operacao") && (
                <SelectItem value="operacao">Em rota</SelectItem>
              )}
              {situacaoOptions.includes("parado") && <SelectItem value="parado">Parado</SelectItem>}
              {situacaoOptions.includes("quebrado") && (
                <SelectItem value="quebrado">Quebrado</SelectItem>
              )}
              {situacaoOptions.includes("manutencao") && (
                <SelectItem value="manutencao">Manutenção</SelectItem>
              )}
              {situacaoOptions.includes("sem-vinculo") && (
                <SelectItem value="sem-vinculo">Sem vínculo</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </section>

      {viewMode === "pipeline" ? (
        <FreightPipeline
          availableDrivers={availableDriverResources}
          demands={filteredDemands}
          countsByStage={countsByStage}
          onOpenDemand={openDemand}
          onOpenStatus={(demand) => {
            setEditStatusValue(demand.status);
            setEditStatusId(demand.id);
          }}
          onAssignDriver={(resource) =>
            openCreate({
              driverId: resource.driver?.id ?? "",
              vehicleId: resource.vehicle.id,
            })
          }
          onStartFreightFromAvailable={startFreightFromAvailable}
          onMoveDemand={moveDemandToMacroStage}
          onCreateFreight={() => openCreate()}
          onOpenStage={setStageDrawerId}
        />
      ) : (
        <FreightTable
          rows={filteredDemands}
          onOpenDemand={openDemand}
          onOpenMap={() => navigate({ to: "/mapa" })}
          onOpenStatus={(demand) => {
            setEditStatusValue(demand.status);
            setEditStatusId(demand.id);
          }}
        />
      )}

      <Modal
        open={!!stageDrawer}
        onOpenChange={(open) => !open && setStageDrawerId(null)}
        title={stageDrawer?.label ?? ""}
        description={
          stageDrawerId === "DISPONIVEIS"
            ? `${stageDrawerCount} veículos disponíveis`
            : `${stageDrawerCount} demandas nesta etapa`
        }
        size="lg"
      >
        {stageDrawer && (
          <div className="space-y-3">
            <StageHeader stage={stageDrawer} total={stageDrawerCount} compact />
            {stageDrawer.id === "DISPONIVEIS" ? (
              <div className="grid gap-3 md:grid-cols-2">
                {availableDriverResources.map((resource) => (
                  <AvailableDriverCard
                    key={resource.id}
                    resource={resource}
                    onAssign={() =>
                      openCreate({
                        driverId: resource.driver?.id ?? "",
                        vehicleId: resource.vehicle.id,
                      })
                    }
                  />
                ))}
                {availableDriverResources.length === 0 && (
                  <EmptyState title="Nenhum veículo livre" />
                )}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {stageDrawerDemands.map((demand) => (
                  <FreightCard
                    key={demand.id}
                    demand={demand}
                    onOpen={() => openDemand(demand.id)}
                    onOpenStatus={() => {
                      setEditStatusValue(demand.status);
                      setEditStatusId(demand.id);
                    }}
                  />
                ))}
                {stageDrawerDemands.length === 0 && (
                  <EmptyState title="Nenhuma demanda nesta etapa" />
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!demandPanel}
        onOpenChange={(open) => !open && closeDemandPanel()}
        title={demandPanel?.mode === "create" ? "Criar frete" : (selectedDemand?.code ?? "Demanda")}
        description={
          demandPanel?.mode === "create"
            ? "Criação guiada de demanda operacional"
            : "Detalhe e continuação da operação"
        }
        size="xl"
      >
        {demandPanel?.mode === "create" ? (
          <CreateFreightWorkspace
            createMode={createMode}
            setCreateMode={setCreateMode}
            individualForm={form}
            setIndividualForm={setForm}
            groupForm={groupForm}
            setGroupForm={setGroupForm}
            vehicles={vehicles}
            drivers={drivers}
            trailers={trailers}
            senders={senders}
            recipients={recipients}
            products={products}
            availableResources={availableDriverResources}
            activeDriverIds={activeDriverIds}
            onCreateIndividual={createFreight}
            onCreateGroup={createGroupFreight}
          />
        ) : selectedDemand ? (
          <DemandWorkspace
            mode="detail"
            demand={selectedDemand}
            vehicles={vehicles}
            drivers={drivers}
            trailers={trailers}
            senders={senders}
            recipients={recipients}
            products={products}
            activeDriverIds={activeDriverIds}
            onAdvance={advanceDemand}
            onFinalCommand={setFinalCommand}
            onDocument={handleDocument}
            onApproveNote={approveNote}
            onRejectNote={rejectNote}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!editing}
        onOpenChange={(open) => !open && setEditStatusId(null)}
        title={editing ? `Alterar status - ${editing.plate}` : ""}
        description="Status operacional centralizado pela Gestão de Frota"
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditStatusId(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (editing) {
                  await setVehicleStatus(
                    editing.id,
                    editStatusValue,
                    stageFromLegacyStatus(editStatusValue),
                  );
                  setEditStatusId(null);
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        }
      >
        <Select
          value={editStatusValue}
          onValueChange={(value) => setEditStatusValue(value as VehicleStatus)}
        >
          <SelectTrigger className="h-10 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {VEHICLE_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Modal>

      <ManualMoveDialog
        open={!!manualMove}
        vehicle={manualMove?.vehicle ?? null}
        targetMacroStage={manualMove?.targetMacroStage ?? null}
        documents={freightDocuments}
        onOpenChange={(open) => {
          if (!open) setManualMove(null);
        }}
        onApplied={async () => {
          await loadAll();
        }}
        onConflict={loadAll}
      />

      <Modal
        open={!!closeFreightDemand}
        onOpenChange={(open) => {
          if (!open && !closingFreight) setCloseFreightDemand(null);
        }}
        title={
          closeFreightDemand ? `Encerrar frete - ${closeFreightDemand.plate}` : "Encerrar frete"
        }
        description="O frete será arquivado antes de o veículo voltar para Disponíveis"
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setCloseFreightDemand(null)}
              disabled={closingFreight}
            >
              Cancelar
            </Button>
            <Button onClick={confirmCloseFreight} disabled={closingFreight}>
              {closingFreight ? "Arquivando..." : "Arquivar e disponibilizar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Eventos e documentos do freight_id atual serão preservados em Históricos. O
              current_freight_id só será limpo pela rotina transacional de arquivamento.
            </p>
          </div>
          <div className="space-y-2">
            <div className="label-tiny">Tipo de encerramento</div>
            <Select value={closeFreightReason} onValueChange={setCloseFreightReason}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="finalizado_pela_expedicao">Frete finalizado</SelectItem>
                <SelectItem value="cancelado_pela_expedicao">Frete cancelado</SelectItem>
                <SelectItem value="correcao_operacional">Correção operacional</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Metrics({ totals }: { totals: Record<string, number> }) {
  const items = [
    ["Ativos", totals.active, ListChecks, "primary"],
    ["Disponíveis", totals.available, ClipboardCheck, "primary"],
    ["Carregamento", totals.loading, RouteIcon, "success"],
    ["Aguardando Ct-e/Mdf-e", totals.cte, FileCheck2, "maintenance"],
    ["Descarga", totals.delivery, Truck, "success"],
    ["Rota finalizada", totals.done, CheckCircle2, "muted"],
  ] as const;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {items.map(([label, value, Icon, tone]) => (
        <div
          key={label}
          className="premium-card p-4 transition hover:-translate-y-0.5 hover:border-primary/25"
        >
          <div className="flex items-center justify-between gap-3">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-2xl border",
                TONE_CLASS[tone],
              )}
            >
              <Icon className="size-4" />
            </div>
            <span className="font-sans text-[22px] font-black text-foreground">{value}</span>
          </div>
          <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
        </div>
      ))}
    </section>
  );
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-2xl border border-border bg-surface-2/70 p-1">
      {(["pipeline", "table"] as ViewMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "rounded-xl px-3 py-2 text-[12px] font-bold transition",
            value === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {mode === "pipeline" ? "Pipeline" : "Tabela"}
        </button>
      ))}
    </div>
  );
}

function FreightPipeline({
  availableDrivers,
  demands,
  countsByStage,
  onOpenDemand,
  onOpenStatus,
  onAssignDriver,
  onStartFreightFromAvailable,
  onMoveDemand,
  onCreateFreight,
  onOpenStage,
}: {
  availableDrivers: AvailableDriverResource[];
  demands: FreightDemand[];
  countsByStage: Record<FreightMacroStageId, number>;
  onOpenDemand: (id: string) => void;
  onOpenStatus: (demand: FreightDemand) => void;
  onAssignDriver: (resource: AvailableDriverResource) => void;
  onStartFreightFromAvailable: (
    resource: AvailableDriverResource,
    targetStageId: FreightMacroStageId,
  ) => Promise<void>;
  onMoveDemand: (demand: FreightDemand, targetStageId: FreightMacroStageId) => Promise<void>;
  onCreateFreight: () => void;
  onOpenStage: (id: FreightMacroStageId) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const [activeItem, setActiveItem] = useState<
    | { kind: "demand"; demand: FreightDemand }
    | { kind: "available"; resource: AvailableDriverResource }
    | null
  >(null);

  const handleDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current as
      | { kind: "demand"; demand: FreightDemand }
      | { kind: "available"; resource: AvailableDriverResource }
      | undefined;
    setActiveItem(item ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const item = event.active.data.current as
      | { kind: "demand"; demand: FreightDemand }
      | { kind: "available"; resource: AvailableDriverResource }
      | undefined;
    const targetStageId = event.over?.id as FreightMacroStageId | undefined;
    setActiveItem(null);
    if (!item || !targetStageId) return;

    if (item.kind === "available") {
      await onStartFreightFromAvailable(item.resource, targetStageId);
      return;
    }
    await onMoveDemand(item.demand, targetStageId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveItem(null)}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <section className="grid gap-2.5 xl:grid-cols-5">
        {FREIGHT_MACRO_STAGES.map((stage) => {
          const stageDemands = demands.filter((demand) => demand.macroStage.id === stage.id);
          const visibleDemands = stageDemands.slice(0, 5);
          const visibleDrivers = availableDrivers.slice(0, 5);
          const visible = stage.id === "DISPONIVEIS" ? visibleDrivers : visibleDemands;
          const hidden = Math.max(
            0,
            (stage.id === "DISPONIVEIS" ? availableDrivers.length : stageDemands.length) -
              visible.length,
          );

          return (
            <DroppablePipelineColumn
              key={stage.id}
              stage={stage}
              total={countsByStage[stage.id]}
              onOpen={() => onOpenStage(stage.id)}
              action={
                stage.id === "DISPONIVEIS" ? (
                  <Button
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[10.5px]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCreateFreight();
                    }}
                  >
                    Novo Frete
                  </Button>
                ) : null
              }
              footer={
                hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenStage(stage.id)}
                    className="mx-2.5 mb-2.5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition hover:bg-primary/15"
                  >
                    + {hidden} demandas
                    <span className="inline-flex items-center gap-1">
                      Ver todos <ChevronRight className="size-3" />
                    </span>
                  </button>
                ) : null
              }
            >
              {stage.id === "DISPONIVEIS"
                ? visibleDrivers.map((resource) => (
                    <AvailableDriverCard
                      key={resource.id}
                      resource={resource}
                      onAssign={() => onAssignDriver(resource)}
                      draggable
                    />
                  ))
                : visibleDemands.map((demand) => (
                    <FreightCard
                      key={demand.id}
                      demand={demand}
                      onOpen={() => onOpenDemand(demand.id)}
                      onOpenStatus={() => onOpenStatus(demand)}
                      draggable
                    />
                  ))}
              {visible.length === 0 && (
                <EmptyState
                  title={stage.id === "DISPONIVEIS" ? "Nenhum veículo livre" : "Sem demandas"}
                  compact
                />
              )}
            </DroppablePipelineColumn>
          );
        })}
      </section>

      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
            {activeItem ? (
              <div className="w-[280px] max-w-[calc(100vw-2rem)]">
                {activeItem.kind === "demand" ? (
                  <FreightCard demand={activeItem.demand} isOverlay />
                ) : (
                  <AvailableDriverCard
                    resource={activeItem.resource}
                    onAssign={() => undefined}
                    isOverlay
                  />
                )}
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}

function DroppablePipelineColumn({
  stage,
  total,
  onOpen,
  action,
  footer,
  children,
}: {
  stage: FreightMacroStage;
  total: number;
  onOpen: () => void;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const droppable = useDroppable({ id: stage.id });

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "premium-card flex min-h-[300px] min-w-0 flex-col overflow-hidden transition-[border-color,box-shadow,background-color] duration-200",
        droppable.isOver &&
          "border-primary/60 bg-primary/[0.035] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-primary)_30%,transparent),0_18px_45px_color-mix(in_oklch,var(--color-primary)_10%,transparent)]",
      )}
    >
      <StageHeader stage={stage} total={total} onOpen={onOpen} action={action} />
      <div className="grid min-w-0 flex-1 content-start gap-2 p-2.5">{children}</div>
      {footer}
    </div>
  );
}

function StageHeader({
  stage,
  total,
  compact,
  onOpen,
  action,
}: {
  stage: FreightMacroStage;
  total: number;
  compact?: boolean;
  onOpen?: () => void;
  action?: ReactNode;
}) {
  const Icon = MACRO_STAGE_ICONS[stage.id];
  return (
    <div
      className={cn(
        "border-b border-border/80 bg-surface/35 px-3 py-3",
        compact && "rounded-2xl border bg-surface-2/45",
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-default"
        >
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl border",
              TONE_CLASS[stage.tone],
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[12.5px] font-extrabold text-foreground">{stage.label}</h3>
            <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">
              {stage.description}
            </p>
          </div>
        </button>
        {action}
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-sans text-[10px] font-black",
            TONE_CLASS[stage.tone],
          )}
        >
          {total}
        </span>
      </div>
    </div>
  );
}

function FreightCard({
  demand,
  onOpen,
  draggable,
  isOverlay,
}: {
  demand: FreightDemand;
  onOpen?: () => void;
  onOpenStatus?: () => void;
  draggable?: boolean;
  isOverlay?: boolean;
}) {
  const trailerLabel = cardTrailerLabel(demand.trailer);
  const productLabel = cardProductLabel(demand.product);
  const routeLabel = cardRouteLabel(demand.sender, demand.recipient);
  const drag = useDraggable({
    id: isOverlay ? `overlay-demand-${demand.id}` : `demand-${demand.id}`,
    data: { kind: "demand", demand },
    disabled: !draggable || isOverlay,
  });

  return (
    <article
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      className={cn(
        "group w-full min-w-0 touch-none select-none overflow-hidden rounded-xl border bg-surface-2/55 px-2.5 py-2 text-left shadow-sm transition-[transform,opacity,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-surface-2",
        draggable && "cursor-grab active:cursor-grabbing",
        drag.isDragging && !isOverlay && "opacity-25",
        isOverlay &&
          "rotate-[1.2deg] scale-[1.025] border-primary/70 shadow-[0_22px_60px_color-mix(in_oklch,var(--color-primary)_25%,transparent)]",
        CARD_TONE_CLASS[demand.microStatus.tone],
        "disabled:hover:border-border",
      )}
    >
      <button type="button" onClick={onOpen} disabled={!onOpen} className="block w-full text-left">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="truncate font-sans text-[13px] font-black text-foreground">
              {cardValue(demand.plate)}
            </div>
            <div className="truncate text-[11px] font-medium text-muted-foreground">
              {trailerLabel}
            </div>
            <div className="truncate text-[11px] font-medium text-muted-foreground">
              {productLabel}
            </div>
            <div className="truncate text-[11px] font-medium text-muted-foreground">
              {routeLabel}
            </div>
          </div>
          {draggable && (
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
              <GripVertical className="size-3.5" />
            </span>
          )}
        </div>
      </button>
    </article>
  );
}

function AvailableDriverCard({
  resource,
  onAssign,
  draggable,
  isOverlay,
}: {
  resource: AvailableDriverResource;
  onAssign: () => void;
  draggable?: boolean;
  isOverlay?: boolean;
}) {
  const trailerLabel = cardTrailerLabel(resource.trailer);
  const cardTone =
    resource.vehicle.situation === "disponivel-oficina" ||
    resource.vehicle.status === "disponivel-oficina"
      ? "maintenance"
      : "primary";
  const locationLabel = cardLocationLabel(resource.vehicle.city, resource.vehicle.state);
  const drag = useDraggable({
    id: isOverlay ? `overlay-available-${resource.id}` : `available-${resource.id}`,
    data: { kind: "available", resource },
    disabled: !draggable || isOverlay,
  });

  return (
    <button
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      type="button"
      onClick={onAssign}
      className={cn(
        "group w-full min-w-0 touch-none select-none overflow-hidden rounded-xl border bg-surface-2/55 px-2.5 py-2 text-left shadow-sm transition-[transform,opacity,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-surface-2",
        draggable && "cursor-grab active:cursor-grabbing",
        drag.isDragging && !isOverlay && "opacity-25",
        isOverlay &&
          "rotate-[1.2deg] scale-[1.025] border-primary/70 shadow-[0_22px_60px_color-mix(in_oklch,var(--color-primary)_25%,transparent)]",
        CARD_TONE_CLASS[cardTone],
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="truncate font-sans text-[13px] font-black text-foreground">
            {cardValue(resource.vehicle.plate)}
          </div>
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {cardValue(resource.driver?.name)}
          </div>
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {trailerLabel}
          </div>
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {locationLabel}
          </div>
        </div>
        {draggable && (
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
            <GripVertical className="size-3.5" />
          </span>
        )}
      </div>
    </button>
  );
}

function FreightTable({
  rows,
  onOpenDemand,
  onOpenMap,
  onOpenStatus,
}: {
  rows: FreightDemand[];
  onOpenDemand: (id: string) => void;
  onOpenMap: () => void;
  onOpenStatus: (demand: FreightDemand) => void;
}) {
  return (
    <section className="premium-card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border/80 bg-surface/35 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
        <div>
          <div className="label-tiny">Visualização secundária</div>
          <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
            Tabela operacional preservada
          </h2>
        </div>
        <div className="text-[12px] font-semibold text-muted-foreground">
          {rows.length} registros encontrados
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[1240px]">
          <thead>
            <tr>
              <th>Frete</th>
              <th>Placa</th>
              <th>Motorista</th>
              <th>Etapa</th>
              <th>Status</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Produto</th>
              <th>Atualizado</th>
              <th>Situação</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((demand) => (
              <tr key={demand.id}>
                <td className="font-sans text-[12px] font-black">{demand.code}</td>
                <td className="font-sans text-[13px] font-black text-foreground">{demand.plate}</td>
                <td className="font-medium">{demand.driver?.name ?? "-"}</td>
                <td>
                  <FreightStatusBadge stage={demand.stage} />
                </td>
                <td>
                  <button
                    type="button"
                    title="Alterar status"
                    onClick={() => onOpenStatus(demand)}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/70 px-1.5 py-1 transition hover:border-primary/40 hover:bg-primary/10"
                  >
                    <StatusBadge status={demand.status} full />
                    <RefreshCw className="size-3.5 text-muted-foreground" />
                  </button>
                </td>
                <td className="text-muted-foreground">
                  {demand.sender ? `${demand.sender.city}/${demand.sender.state}` : "-"}
                </td>
                <td className="text-muted-foreground">
                  {demand.recipient ? `${demand.recipient.city}/${demand.recipient.state}` : "-"}
                </td>
                <td className="font-sans text-[12px] font-bold">{demand.product?.name ?? "-"}</td>
                <td className="font-sans text-[11.5px] text-muted-foreground">
                  {formatRelative(demand.updatedAt)}
                </td>
                <td>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
                      SITUACAO_TONE[demand.situacao],
                    )}
                  >
                    {SITUACAO_LABEL[demand.situacao]}
                  </span>
                </td>
                <td className="text-right">
                  <div className="inline-flex items-center gap-1 rounded-2xl border border-border bg-surface-2/60 p-1">
                    <IconButton
                      title="Visualizar"
                      icon={Eye}
                      onClick={() => onOpenDemand(demand.id)}
                    />
                    <IconButton
                      title="Alterar status"
                      icon={RefreshCw}
                      onClick={() => onOpenStatus(demand)}
                    />
                    <IconButton title="Abrir no mapa" icon={MapPin} onClick={onOpenMap} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-[12.5px] text-muted-foreground">
                  Nenhuma demanda encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreateFreightWorkspace({
  createMode,
  setCreateMode,
  individualForm,
  setIndividualForm,
  groupForm,
  setGroupForm,
  vehicles,
  drivers,
  trailers,
  senders,
  recipients,
  products,
  availableResources,
  activeDriverIds,
  onCreateIndividual,
  onCreateGroup,
}: {
  createMode: FreightCreateMode;
  setCreateMode: (mode: FreightCreateMode) => void;
  individualForm: FreightFormState;
  setIndividualForm: (form: FreightFormState) => void;
  groupForm: GroupFreightFormState;
  setGroupForm: (form: GroupFreightFormState) => void;
  vehicles: Vehicle[];
  drivers: Driver[];
  trailers: Trailer[];
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  availableResources: AvailableDriverResource[];
  activeDriverIds: Set<string>;
  onCreateIndividual: () => void;
  onCreateGroup: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-2xl border border-border bg-surface-2/70 p-1">
        {(["individual", "group"] as FreightCreateMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setCreateMode(mode)}
            className={cn(
              "rounded-xl px-3 py-2 text-[12px] font-bold transition",
              createMode === mode
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {mode === "individual" ? "Criar Frete Individual" : "Criar Frete em Grupo"}
          </button>
        ))}
      </div>

      {createMode === "individual" ? (
        <DemandWorkspace
          mode="create"
          form={individualForm}
          setForm={setIndividualForm}
          vehicles={vehicles}
          drivers={drivers}
          trailers={trailers}
          senders={senders}
          recipients={recipients}
          products={products}
          activeDriverIds={activeDriverIds}
          onCreate={onCreateIndividual}
        />
      ) : (
        <GroupFreightWorkspace
          form={groupForm}
          setForm={setGroupForm}
          senders={senders}
          recipients={recipients}
          products={products}
          availableResources={availableResources}
          onCreate={onCreateGroup}
        />
      )}
    </div>
  );
}

function GroupFreightWorkspace({
  form,
  setForm,
  senders,
  recipients,
  products,
  availableResources,
  onCreate,
}: {
  form: GroupFreightFormState;
  setForm: (form: GroupFreightFormState) => void;
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  availableResources: AvailableDriverResource[];
  onCreate: () => void;
}) {
  const [plateFilter, setPlateFilter] = useState("");
  const [implementModelFilter, setImplementModelFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const groupableResources = availableResources.filter((resource) => resource.driver);
  const normalizedPlateFilter = plateFilter.trim().toLowerCase();
  const implementModelOptions = Array.from(
    new Set(groupableResources.map((resource) => resource.implementModel.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const filteredResources = groupableResources.filter((resource) => {
    if (normalizedPlateFilter) {
      const searchablePlate = [
        resource.vehicle.plate,
        resource.driver?.name,
        resource.cityLabel,
        resource.vehicle.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!searchablePlate.includes(normalizedPlateFilter)) return false;
    }

    if (implementModelFilter !== "all" && resource.implementModel !== implementModelFilter) {
      return false;
    }

    if (stateFilter !== "all" && resource.vehicle.state !== stateFilter) return false;

    return true;
  });
  const selectedResources = groupableResources.filter((resource) =>
    form.vehicleIds.includes(resource.vehicle.id),
  );
  const sender = senders.find((item) => item.id === form.senderId);
  const recipient = recipients.find((item) => item.id === form.recipientId);
  const product = products.find((item) => item.id === form.productId);
  const validCreate =
    !!form.senderId && !!form.recipientId && !!form.productId && form.vehicleIds.length > 0;

  const toggleVehicle = (vehicleId: string) => {
    setForm({
      ...form,
      vehicleIds: form.vehicleIds.includes(vehicleId)
        ? form.vehicleIds.filter((id) => id !== vehicleId)
        : [...form.vehicleIds, vehicleId],
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <Block
          step="1"
          icon={Building2}
          title="Dados do frete em grupo"
          subtitle="Origem, destino e produto serão aplicados a todos os caminhões selecionados."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <SelectorField
              label="Remetente / origem"
              value={form.senderId}
              onChange={(value) => setForm({ ...form, senderId: value })}
              placeholder="Selecione o remetente"
              options={senders
                .filter((s) => s.active)
                .map((s) => ({ value: s.id, label: `${s.name} · ${s.city}/${s.state}` }))}
            />
            <SelectorField
              label="Destinatário / destino"
              value={form.recipientId}
              onChange={(value) => setForm({ ...form, recipientId: value })}
              placeholder="Selecione o destinatário"
              options={recipients
                .filter((r) => r.active)
                .map((r) => ({ value: r.id, label: `${r.name} · ${r.city}/${r.state}` }))}
            />
            <SelectorField
              label="Produto"
              value={form.productId}
              onChange={(value) => setForm({ ...form, productId: value })}
              placeholder="Selecione o produto"
              options={products
                .filter((item) => item.active)
                .map((item) => ({ value: item.id, label: item.name }))}
            />
            <Field label="Observações" className="md:col-span-2">
              <Textarea
                value={form.observations}
                onChange={(event) => setForm({ ...form, observations: event.target.value })}
                placeholder="Observações internas para o frete em grupo..."
              />
            </Field>
          </div>
        </Block>

        <Block
          step="2"
          icon={Truck}
          title="Caminhões do grupo"
          subtitle="Selecione quantos caminhões vão executar o mesmo frete."
        >
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={plateFilter}
                onChange={(event) => setPlateFilter(event.target.value)}
                placeholder="Filtrar por placa"
                className="h-11 pl-9"
              />
            </div>
            <Select value={implementModelFilter} onValueChange={setImplementModelFilter}>
              <SelectTrigger className="h-11 text-[13px]">
                <SelectValue placeholder="Modelo implemento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os modelos</SelectItem>
                {implementModelOptions.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="h-11 text-[13px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {Array.from(
                  new Set(
                    groupableResources.map((resource) => resource.vehicle.state).filter(Boolean),
                  ),
                )
                  .sort()
                  .map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mb-3 text-[12px] font-bold text-muted-foreground">
            {filteredResources.length} de {groupableResources.length} disponíveis
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filteredResources.map((resource) => {
              const selected = form.vehicleIds.includes(resource.vehicle.id);
              const implementType =
                resource.trailerLabel ||
                resource.trailer?.implementType ||
                resource.trailer?.implementModel ||
                resource.trailer?.type ||
                "Sem implemento";

              return (
                <button
                  key={resource.vehicle.id}
                  type="button"
                  onClick={() => toggleVehicle(resource.vehicle.id)}
                  className={cn(
                    "min-h-[84px] rounded-2xl border px-3 py-3 text-left transition",
                    selected
                      ? "border-primary/45 bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-surface-2/55 text-foreground hover:border-primary/30 hover:bg-primary/5",
                  )}
                >
                  <div className="font-sans text-[15px] font-black">{resource.vehicle.plate}</div>
                  <div className="mt-1 truncate text-[12px] font-bold text-foreground/80">
                    {resource.driver?.name}
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-muted-foreground">
                    {implementType}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-foreground/75">
                    {resource.implementModel || "Modelo implemento não informado"}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-muted-foreground/90">
                    {resource.cityLabel}
                  </div>
                </button>
              );
            })}
            {groupableResources.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-surface-2/45 px-4 py-6 text-center text-[12.5px] font-semibold text-muted-foreground sm:col-span-2 xl:col-span-3">
                Nenhum caminhão disponível com motorista vinculado.
              </div>
            )}
          </div>
        </Block>
      </div>

      <aside className="premium-card self-start overflow-hidden xl:sticky xl:top-4">
        <div className="border-b border-border/80 bg-surface/35 px-5 py-4">
          <div className="label-tiny">Resumo lateral</div>
          <h2 className="mt-1 text-[18px] font-extrabold text-foreground">Frete em grupo</h2>
        </div>
        <div className="space-y-3 p-5">
          <SummaryRow label="Caminhões" value={String(selectedResources.length)} />
          <SummaryRow label="Origem" value={sender ? `${sender.city}/${sender.state}` : "-"} />
          <SummaryRow
            label="Destino"
            value={recipient ? `${recipient.city}/${recipient.state}` : "-"}
          />
          <SummaryRow label="Produto" value={product?.name ?? "-"} />
          <CheckLine ok={selectedResources.length > 0} label="Caminhões selecionados" />
          <CheckLine ok={!!sender} label="Remetente ativo" />
          <CheckLine ok={!!recipient} label="Destinatário ativo" />
          <CheckLine ok={!!product} label="Produto informado" />
          <Button className="mt-2 h-12 w-full" disabled={!validCreate} onClick={onCreate}>
            Criar frete em grupo <ArrowRight className="size-4" />
          </Button>
        </div>
      </aside>
    </div>
  );
}

function DemandWorkspace({
  mode,
  demand,
  form,
  setForm,
  vehicles,
  drivers,
  trailers,
  senders,
  recipients,
  products,
  activeDriverIds,
  onCreate,
  onAdvance,
  onFinalCommand,
  onDocument,
  onApproveNote,
  onRejectNote,
}: {
  mode: DemandMode;
  demand?: FreightDemand;
  form?: FreightFormState;
  setForm?: (form: FreightFormState) => void;
  vehicles: Vehicle[];
  drivers: Driver[];
  trailers: Trailer[];
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  activeDriverIds: Set<string>;
  onCreate?: () => void;
  onAdvance?: (demand: FreightDemand, explicitNext?: FreightStageId) => Promise<void>;
  onFinalCommand?: (demand: FreightDemand, command: FinalCommand) => Promise<void>;
  onDocument?: (demand: FreightDemand, kind: DocumentKind, file: File) => Promise<void>;
  onApproveNote?: (demand: FreightDemand) => Promise<void>;
  onRejectNote?: (demand: FreightDemand) => Promise<void>;
}) {
  const currentForm = form ?? EMPTY_FORM;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === currentForm.vehicleId);
  const selectedDriver = drivers.find((driver) => driver.id === currentForm.driverId);
  const availableDrivers = drivers.filter((driver) =>
    isDriverAvailable(driver, currentForm.vehicleId, activeDriverIds),
  );
  const validCreate =
    !!selectedVehicle &&
    !!selectedDriver &&
    !!currentForm.senderId &&
    !!currentForm.recipientId &&
    !!currentForm.productId &&
    isVehicleAvailableForFreight(selectedVehicle);

  const selectVehicle = (vehicleId: string) => {
    if (!setForm) return;
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    const linkedDriver = vehicle?.driverId
      ? drivers.find((item) => item.id === vehicle.driverId)
      : undefined;
    const linkedTrailer = vehicle?.trailerId
      ? trailers.find((item) => item.id === vehicle.trailerId)
      : undefined;

    setForm({
      ...currentForm,
      vehicleId,
      driverId: linkedDriver?.id ?? "",
      trailerId: linkedTrailer?.id ?? "",
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <Block
          step="1"
          icon={Building2}
          title="Dados do frete"
          subtitle="Origem, destino, produto e observações da operação."
        >
          {mode === "create" && setForm ? (
            <div className="grid gap-3 md:grid-cols-2">
              <SelectorField
                label="Remetente / origem"
                value={currentForm.senderId}
                onChange={(value) => setForm({ ...currentForm, senderId: value })}
                placeholder="Selecione o remetente"
                options={senders
                  .filter((s) => s.active)
                  .map((s) => ({ value: s.id, label: `${s.name} · ${s.city}/${s.state}` }))}
              />
              <SelectorField
                label="Destinatário / destino"
                value={currentForm.recipientId}
                onChange={(value) => setForm({ ...currentForm, recipientId: value })}
                placeholder="Selecione o destinatário"
                options={recipients
                  .filter((r) => r.active)
                  .map((r) => ({ value: r.id, label: `${r.name} · ${r.city}/${r.state}` }))}
              />
              <SelectorField
                label="Produto"
                value={currentForm.productId}
                onChange={(value) => setForm({ ...currentForm, productId: value })}
                placeholder="Selecione o produto"
                options={products
                  .filter((product) => product.active)
                  .map((product) => ({ value: product.id, label: product.name }))}
              />
              <Field label="Código">
                <div className="rounded-2xl border border-dashed border-border bg-surface-2/45 px-3 py-3 text-[12px] text-muted-foreground">
                  Gerado a partir do veículo vinculado
                </div>
              </Field>
              <Field label="Observações" className="md:col-span-2">
                <Textarea
                  value={currentForm.observations}
                  onChange={(event) =>
                    setForm({ ...currentForm, observations: event.target.value })
                  }
                  placeholder="Observações internas da operação..."
                />
              </Field>
            </div>
          ) : demand ? (
            <DetailGrid demand={demand} />
          ) : null}
        </Block>

        <Block
          step="2"
          icon={Truck}
          title="Veículo e motorista"
          subtitle="Recursos operacionais vinculados à demanda."
        >
          {mode === "create" && setForm ? (
            <div className="grid gap-3 md:grid-cols-2">
              <SelectorField
                label="Veículo / placa"
                value={currentForm.vehicleId}
                onChange={selectVehicle}
                placeholder="Selecione o veículo"
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: `${v.plate} · ${v.type} · ${v.city}/${v.state}`,
                  disabled: !isVehicleAvailableForFreight(v),
                }))}
              />
              <SelectorField
                label="Motorista disponível"
                value={currentForm.driverId}
                onChange={(value) => setForm({ ...currentForm, driverId: value })}
                placeholder="Selecione o motorista"
                options={availableDrivers.map((d) => ({
                  value: d.id,
                  label: `${d.name} · ${d.cnh}`,
                }))}
              />
              <SelectorField
                label="Caçamba"
                value={currentForm.trailerId || "__none"}
                onChange={(value) =>
                  setForm({ ...currentForm, trailerId: value === "__none" ? "" : value })
                }
                placeholder="Selecione a caçamba"
                options={[
                  { value: "__none", label: "Sem caçamba" },
                  ...trailers.map((t) => ({
                    value: t.id,
                    label: `${t.identifier} · ${t.type}`,
                    disabled: !!t.vehicleId && t.vehicleId !== currentForm.vehicleId,
                  })),
                ]}
              />
              <Field label="Disponibilidade">
                <Availability vehicle={selectedVehicle} driver={selectedDriver} />
              </Field>
            </div>
          ) : demand ? (
            <div className="grid gap-3 md:grid-cols-2">
              <SummaryTile label="Placa" value={demand.plate} icon={Truck} />
              <SummaryTile
                label="Motorista"
                value={demand.driver?.name ?? "Sem motorista"}
                icon={User}
              />
              <SummaryTile label="Tipo" value={demand.type} icon={ShieldCheck} />
              <SummaryTile
                label="Caçamba"
                value={demand.trailerLabel || demand.trailer?.identifier || "-"}
                icon={Container}
              />
            </div>
          ) : null}
        </Block>

        {demand && (
          <>
            <Block
              step="3"
              icon={RouteIcon}
              title="Etapa atual da rota"
              subtitle="Status, próximo passo e checklist operacional."
            >
              <StageActionPanel
                demand={demand}
                onAdvance={onAdvance}
                onFinalCommand={onFinalCommand}
              />
            </Block>
            <Block
              step="4"
              icon={FileText}
              title={
                demand.macroStage.id === "AGUARDANDO_CTE"
                  ? "Conferência da nota / CTE"
                  : "Nota fiscal"
              }
              subtitle={
                demand.macroStage.id === "AGUARDANDO_CTE"
                  ? "Confira a nota primeiro. Depois envie o CTE uma única vez."
                  : "Documento enviado pelo motorista para conferência."
              }
            >
              {demand.macroStage.id === "AGUARDANDO_CTE" ? (
                <AwaitingCtePanel
                  demand={demand}
                  onDocument={onDocument}
                  onApproveNote={onApproveNote}
                  onRejectNote={onRejectNote}
                />
              ) : (
                <DocumentPanel
                  demand={demand}
                  kind="note"
                  onDocument={onDocument}
                  onApproveNote={onApproveNote}
                  onRejectNote={onRejectNote}
                />
              )}
            </Block>
            {demand.macroStage.id !== "AGUARDANDO_CTE" ? (
              <Block
                step="5"
                icon={FileCheck2}
                title="CTE"
                subtitle="Geração, anexo e confirmação de liberação do motorista."
              >
                <DocumentPanel demand={demand} kind="cte" onDocument={onDocument} />
              </Block>
            ) : null}
            <Block
              step="6"
              icon={User}
              title="Confirmações do motorista"
              subtitle="Confirmação do CTE e da entrega."
            >
              <DriverConfirmations demand={demand} />
            </Block>
            <Block
              step="7"
              icon={History}
              title="Histórico da demanda"
              subtitle="Linha do tempo visual baseada na etapa atual e datas disponíveis."
            >
              <FreightTimeline demand={demand} />
            </Block>
          </>
        )}
      </div>

      <FreightSummaryPanel
        mode={mode}
        demand={demand}
        form={currentForm}
        vehicles={vehicles}
        drivers={drivers}
        senders={senders}
        recipients={recipients}
        products={products}
        validCreate={validCreate}
        onCreate={onCreate}
        onAdvance={onAdvance}
        onFinalCommand={onFinalCommand}
      />
    </div>
  );
}

function FreightSummaryPanel({
  mode,
  demand,
  form,
  vehicles,
  drivers,
  senders,
  recipients,
  products,
  validCreate,
  onCreate,
  onAdvance,
  onFinalCommand,
}: {
  mode: DemandMode;
  demand?: FreightDemand;
  form: FreightFormState;
  vehicles: Vehicle[];
  drivers: Driver[];
  senders: Sender[];
  recipients: Recipient[];
  products: Product[];
  validCreate: boolean;
  onCreate?: () => void;
  onAdvance?: (demand: FreightDemand, explicitNext?: FreightStageId) => Promise<void>;
  onFinalCommand?: (demand: FreightDemand, command: FinalCommand) => Promise<void>;
}) {
  const vehicle = vehicles.find((item) => item.id === form.vehicleId);
  const driver = drivers.find((item) => item.id === form.driverId);
  const sender = senders.find((item) => item.id === form.senderId);
  const recipient = recipients.find((item) => item.id === form.recipientId);
  const product = products.find((item) => item.id === form.productId);
  const next = demand ? nextFreightStage(demand.stage.id) : null;
  const summaryDriver = mode === "create" ? driver : demand?.driver;
  const whatsappUrl = buildWhatsAppUrl(summaryDriver?.phone);

  return (
    <aside className="premium-card self-start overflow-hidden xl:sticky xl:top-4">
      <div className="border-b border-border/80 bg-surface/35 px-5 py-4">
        <div className="label-tiny">Resumo lateral</div>
        <h2 className="mt-1 text-[18px] font-extrabold text-foreground">
          {mode === "create" ? "Novo despacho" : demand?.code}
        </h2>
      </div>
      <div className="space-y-3 p-5">
        {mode === "create" ? (
          <>
            <SummaryRow label="Veículo" value={vehicle?.plate ?? "-"} />
            <SummaryRow label="Motorista" value={driver?.name ?? "-"} />
            <SummaryRow label="Origem" value={sender ? `${sender.city}/${sender.state}` : "-"} />
            <SummaryRow
              label="Destino"
              value={recipient ? `${recipient.city}/${recipient.state}` : "-"}
            />
            <SummaryRow label="Produto" value={product?.name ?? "-"} />
            <CheckLine ok={!!vehicle} label="Veículo selecionado" />
            <CheckLine ok={!!driver} label="Motorista disponível selecionado" />
            <CheckLine ok={!!sender} label="Remetente ativo" />
            <CheckLine ok={!!recipient} label="Destinatário ativo" />
            <CheckLine ok={!!product} label="Produto informado" />
            <Button className="mt-2 h-12 w-full" disabled={!validCreate} onClick={onCreate}>
              Criar frete <ArrowRight className="size-4" />
            </Button>
          </>
        ) : demand ? (
          <>
            <FreightStatusBadge stage={demand.stage} />
            <MicroStatusBadge status={demand.microStatus} />
            <SummaryRow label="Motorista" value={demand.driver?.name ?? "-"} />
            <SummaryRow label="Veículo" value={demand.plate} />
            <SummaryRow
              label="Origem"
              value={demand.sender ? `${demand.sender.city}/${demand.sender.state}` : "-"}
            />
            <SummaryRow
              label="Destino"
              value={demand.recipient ? `${demand.recipient.city}/${demand.recipient.state}` : "-"}
            />
            <SummaryRow label="Produto" value={demand.product?.name ?? "-"} />
            <SummaryRow label="Nota" value={noteLabel(demand)} />
            <SummaryRow label="CTE" value={cteLabel(demand)} />
            <div className="border-t border-border/80 pt-3">
              <CheckLine ok={freightStageIndex(demand.stage.id) >= 0} label="Frete criado" />
              <CheckLine ok={!!demand.driverId} label="Motorista vinculado" />
              <CheckLine
                ok={!!demand.documents.note || freightStageIndex(demand.stage.id) < 2}
                label="Nota encaminhada quando exigida"
              />
              <CheckLine
                ok={!!demand.documents.cte || freightStageIndex(demand.stage.id) < 4}
                label="CTE anexado quando exigido"
              />
            </div>
            {canShowFinalCommands(demand) ? (
              <div className="grid gap-2">
                <Button
                  className="h-11 w-full"
                  onClick={() => onFinalCommand?.(demand, "PRONTO_NOVO_FRETE")}
                >
                  Atribuir a novo frete
                </Button>
                <Button
                  className="h-11 w-full"
                  variant="outline"
                  onClick={() => onFinalCommand?.(demand, "RETORNO_SOLICITADO")}
                >
                  Solicitar retorno
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  className="mt-2 h-12 w-full"
                  disabled={!next}
                  onClick={() => demand && onAdvance?.(demand)}
                >
                  {next ? freightStageById(next).nextAction : "Frete finalizado"}
                  <ArrowRight className="size-4" />
                </Button>
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/12 px-4 text-[13px] font-bold text-success transition hover:bg-success/18"
                  >
                    <MessageCircle className="size-4" />
                    Chamar motorista no WhatsApp
                  </a>
                ) : (
                  <div className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2/45 px-4 text-[12px] font-semibold text-muted-foreground">
                    <MessageCircle className="size-4" />
                    Motorista sem telefone cadastrado
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function StageActionPanel({
  demand,
  onAdvance,
  onFinalCommand,
}: {
  demand: FreightDemand;
  onAdvance?: (demand: FreightDemand, explicitNext?: FreightStageId) => Promise<void>;
  onFinalCommand?: (demand: FreightDemand, command: FinalCommand) => Promise<void>;
}) {
  const next = nextFreightStage(demand.stage.id);
  if (canShowFinalCommands(demand)) {
    return (
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
          <FreightStatusBadge stage={demand.stage} />
          <div className="mt-2">
            <MicroStatusBadge status={demand.microStatus} />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Entrega confirmada. Escolha se a operação será reaproveitada em novo frete ou se deve
            retornar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col">
          <Button onClick={() => onFinalCommand?.(demand, "PRONTO_NOVO_FRETE")}>
            Atribuir a novo frete
          </Button>
          <Button variant="outline" onClick={() => onFinalCommand?.(demand, "RETORNO_SOLICITADO")}>
            Solicitar retorno
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
        <FreightStatusBadge stage={demand.stage} />
        <span className="ml-2 inline-block">
          <MicroStatusBadge status={demand.microStatus} />
        </span>
        <p className="mt-3 text-[13px] text-muted-foreground">{demand.stage.description}</p>
        <div className="mt-3 text-[12px] font-semibold text-foreground">
          Próximo passo: {next ? freightStageById(next).label : "operação concluída"}
        </div>
      </div>
      <Button disabled={!next} onClick={() => onAdvance?.(demand)} className="h-11">
        {next ? demand.stage.nextAction : "Finalizado"}
      </Button>
    </div>
  );
}

function DocumentPanel({
  demand,
  kind,
  onDocument,
  onApproveNote,
  onRejectNote,
}: {
  demand: FreightDemand;
  kind: DocumentKind;
  onDocument?: (demand: FreightDemand, kind: DocumentKind, file: File) => Promise<void>;
  onApproveNote?: (demand: FreightDemand) => Promise<void>;
  onRejectNote?: (demand: FreightDemand) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const document = kind === "note" ? demand.documents.note : demand.documents.cte;
  const driverMessage =
    kind === "cte"
      ? [
          `CT-e/foto da viagem ${demand.plate}.`,
          `Origem: ${demand.sender ? `${demand.sender.city}/${demand.sender.state}` : "-"}.`,
          `Destino: ${
            demand.recipient ? `${demand.recipient.city}/${demand.recipient.state}` : "-"
          }.`,
          "Arquivo separado no sistema para envio.",
        ].join("\n")
      : undefined;
  const whatsappUrl = kind === "cte" ? buildWhatsAppUrl(demand.driver?.phone, driverMessage) : null;
  const enabled =
    kind === "note"
      ? freightStageIndex(demand.stage.id) >= freightStageIndex("AGUARDANDO_NOTA")
      : freightStageIndex(demand.stage.id) >= freightStageIndex("NOTA_APROVADA_AG_CTE");

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void onDocument?.(demand, kind, file);
    event.target.value = "";
  };

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentBadge demand={demand} kind={kind} />
          {document && (
            <span className="text-[12px] text-muted-foreground">
              {formatRelative(document.uploadedAt)}
            </span>
          )}
        </div>
        <div className="mt-3 text-[13px] font-semibold text-foreground">
          {document?.name ?? "Nenhum arquivo anexado"}
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {kind === "note"
            ? "Anexe a nota para liberar a conferência."
            : "Anexe o CTE após aprovação da nota."}
        </p>
        {document?.url && (
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-primary"
          >
            <Download className="size-3.5" />
            Abrir arquivo
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-2 md:flex-col">
        <input ref={inputRef} type="file" className="hidden" onChange={handleChange} />
        <Button variant="outline" disabled={!enabled} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          {document ? "Substituir" : "Anexar"}
        </Button>
        {kind === "cte" &&
          (whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/12 px-4 text-[13px] font-bold text-success transition hover:bg-success/18"
            >
              <Send className="size-4" />
              Enviar ao motorista
            </a>
          ) : (
            <div className="inline-flex h-10 items-center justify-center rounded-2xl border border-border bg-muted/50 px-4 text-[12px] font-bold text-muted-foreground">
              Motorista sem telefone
            </div>
          ))}
        {kind === "note" &&
          (demand.stage.id === "NOTA_EM_CONFERENCIA" || document?.status === "rejeitado") && (
            <>
              <Button onClick={() => onApproveNote?.(demand)}>
                <CheckCircle2 className="size-4" />
                Aprovar nota
              </Button>
              <Button variant="outline" onClick={() => onRejectNote?.(demand)}>
                <XCircle className="size-4" />
                Reprovar nota
              </Button>
            </>
          )}
      </div>
    </div>
  );
}

function AwaitingCtePanel({
  demand,
  onDocument,
  onApproveNote,
  onRejectNote,
}: {
  demand: FreightDemand;
  onDocument?: (demand: FreightDemand, kind: DocumentKind, file: File) => Promise<void>;
  onApproveNote?: (demand: FreightDemand) => Promise<void>;
  onRejectNote?: (demand: FreightDemand) => Promise<void>;
}) {
  const note = demand.documents.note;
  const noteIsImage = Boolean(note?.mimeType?.startsWith("image/") && note?.url);
  const noteApproved = note?.status === "aprovado" || demand.stage.id === "NOTA_APROVADA_AG_CTE";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface-2/45 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DocumentBadge demand={demand} kind="note" />
          {note?.uploadedAt ? (
            <span className="text-[12px] text-muted-foreground">
              {formatRelative(note.uploadedAt)}
            </span>
          ) : null}
        </div>
        {noteIsImage ? (
          <a href={note?.url} target="_blank" rel="noreferrer">
            <img
              src={note?.url}
              alt={note?.name ?? "Nota fiscal"}
              className="h-[360px] w-full rounded-2xl border border-border object-contain bg-white"
            />
          </a>
        ) : note?.url ? (
          <a
            href={note.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-[13px] font-bold text-primary"
          >
            <Eye className="size-4" />
            Abrir nota fiscal
          </a>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nenhuma nota fiscal anexada.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => onApproveNote?.(demand)} disabled={!note}>
            <CheckCircle2 className="size-4" />
            Aprovar nota
          </Button>
          <Button variant="outline" onClick={() => onRejectNote?.(demand)} disabled={!note}>
            <XCircle className="size-4" />
            Reprovar nota
          </Button>
        </div>
      </div>

      {noteApproved ? (
        <DocumentPanel demand={demand} kind="cte" onDocument={onDocument} />
      ) : (
        <div className="rounded-2xl border border-border bg-surface-2/45 p-4 text-[12.5px] text-muted-foreground">
          Aprove a nota para liberar o envio do CTE.
        </div>
      )}
    </div>
  );
}

function DriverConfirmations({ demand }: { demand: FreightDemand }) {
  const cteConfirmed = freightStageIndex(demand.stage.id) >= freightStageIndex("EM_ROTA_ENTREGA");
  const deliveryConfirmed =
    freightStageIndex(demand.stage.id) >= freightStageIndex("ENTREGUE_AG_FINALIZACAO");
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <CheckLine ok={cteConfirmed} label="Motorista confirmou recebimento/liberação do CTE" />
      <CheckLine ok={deliveryConfirmed} label="Motorista confirmou entrega" />
    </div>
  );
}

function FreightTimeline({ demand }: { demand: FreightDemand }) {
  const current = freightStageIndex(demand.stage.id);
  return (
    <div className="space-y-2">
      {FREIGHT_STAGES.map((stage, index) => {
        const done = index <= current;
        const Icon = done ? CheckCircle2 : XCircle;
        return (
          <div
            key={stage.id}
            className="flex gap-3 rounded-2xl border border-border bg-surface-2/45 p-3"
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-xl border",
                done
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold text-foreground">{stage.label}</div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                {done
                  ? index === current
                    ? `Etapa atual · ${formatRelative(demand.updatedAt)}`
                    : "Concluído no fluxo"
                  : "Pendente"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Block({
  step,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  step: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="premium-card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border/80 bg-surface/35 px-4 py-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 font-sans text-[12px] font-black text-primary">
          {step}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="size-4 text-primary" />
            <h3 className="text-[15px] font-extrabold text-foreground">{title}</h3>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SelectorField({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 text-[13px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="label-tiny mb-2">{label}</div>
      {children}
    </div>
  );
}

function DetailGrid({ demand }: { demand: FreightDemand }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SummaryTile label="Código" value={demand.code} icon={ClipboardCheck} />
      <SummaryTile label="Remetente" value={demand.sender?.name ?? "-"} icon={Building2} />
      <SummaryTile label="Destinatário" value={demand.recipient?.name ?? "-"} icon={PackageCheck} />
      <SummaryTile label="Produto" value={demand.product?.name ?? "-"} icon={PackageCheck} />
      <SummaryTile label="Cidade atual" value={`${demand.city}/${demand.state}`} icon={MapPin} />
      <SummaryTile
        label="Criado em"
        value={demand.createdAt ? formatRelative(demand.createdAt) : "-"}
        icon={History}
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/45 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        <span className="label-tiny">{label}</span>
      </div>
      <div className="mt-2 break-words text-[13px] font-bold text-foreground">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-2/45 px-3 py-2.5 text-[12.5px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <span className="label-tiny shrink-0">{label}</span>
      <span className="min-w-0 break-words font-semibold sm:max-w-[64%] sm:text-right">
        {value}
      </span>
    </div>
  );
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-2xl bg-surface-2/45 px-3 py-2 text-[12px]",
        ok ? "text-success" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function FreightStatusBadge({ stage }: { stage: FreightStage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
        TONE_CLASS[stage.tone],
      )}
    >
      {stage.shortLabel}
    </span>
  );
}

function MicroStatusBadge({ status }: { status: MicroStatus }) {
  const urgent = isUrgentMicroStatus(status);
  const critical = status.label.toLowerCase() === "nota reenviada";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-[9.5px] font-bold uppercase leading-none tracking-[0.1em]",
        critical
          ? "animate-[pulse_0.6s_ease-in-out_infinite] border-destructive/55 bg-destructive/20 text-destructive ring-1 ring-destructive/30"
          : urgent
            ? "animate-pulse border-destructive/45 bg-destructive/15 text-destructive ring-1 ring-destructive/25"
            : TONE_CLASS[status.tone],
      )}
    >
      {status.label}
    </span>
  );
}

function isUrgentMicroStatus(status: MicroStatus) {
  const label = status.label.toLowerCase();
  return (
    status.urgent ||
    label === "parado aguardando comando" ||
    label === "aguardando ct-e" ||
    label === "aguardando cte"
  );
}

function DocumentBadge({ demand, kind }: { demand: FreightDemand; kind?: DocumentKind }) {
  const note = demand.documents.note;
  const cte = demand.documents.cte;
  const label =
    kind === "note"
      ? noteLabel(demand)
      : kind === "cte"
        ? cteLabel(demand)
        : cte
          ? "CTE anexado"
          : note?.status === "aprovado"
            ? "Nota aprovada"
            : note
              ? "Nota recebida"
              : "Sem nota";
  const tone = cte || note?.status === "aprovado" ? "primary" : note ? "warning" : "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase leading-none tracking-[0.12em]",
        TONE_CLASS[tone],
      )}
    >
      {label}
    </span>
  );
}

function EmptyState({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/35 text-center text-[12px] font-semibold text-muted-foreground",
        compact ? "min-h-28" : "min-h-40",
      )}
    >
      {title}
    </div>
  );
}

function IconButton({
  title,
  icon: Icon,
  onClick,
}: {
  title: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function Availability({ vehicle, driver }: { vehicle?: Vehicle; driver?: Driver }) {
  const vehicleOk = vehicle ? isVehicleAvailableForFreight(vehicle) : false;
  const driverOk = driver ? driver.active : false;
  return (
    <div className="space-y-2">
      <CheckLine
        ok={vehicleOk}
        label={vehicle ? "Veículo apto para operação" : "Selecione o veículo"}
      />
      <CheckLine
        ok={driverOk}
        label={driver ? "Motorista ativo e disponível" : "Selecione o motorista"}
      />
    </div>
  );
}

function situacaoOf(
  situation: VehicleSituation,
  status: VehicleStatus,
  hasDriver: boolean,
): Exclude<Situacao, "all"> {
  if (!hasDriver) return "sem-vinculo";
  if (isAvailableVehicleSituation(situation) || situation === "parado") return "parado";
  if (situation === "em-rota") return "operacao";
  if (situation === "quebrado") return "quebrado";
  if (situation === "manutencao") return "manutencao";
  if (status === "parado-quebrado") return "quebrado";
  if (status === "manutencao") return "manutencao";
  if (statusGroup(status) === "operacao") return "operacao";
  return "parado";
}

function isVehicleAvailableForFreight(
  vehicle: Pick<Vehicle, "currentFreightId" | "situation" | "status">,
) {
  if (vehicle.currentFreightId) return false;
  return isAvailableVehicleSituation(vehicle.situation) || isAvailableVehicleStatus(vehicle.status);
}

function canShowFinalCommands(demand: Pick<FreightDemand, "macroStage" | "status">) {
  return (
    demand.macroStage.id === "ROTA_FINALIZADA" && demand.status === "parado-aguardando-comando"
  );
}

function availableStatusForVehicle(vehicle: Pick<Vehicle, "situation" | "status">): VehicleStatus {
  if (vehicle.situation === "disponivel-patio") return "disponivel-patio";
  if (vehicle.situation === "disponivel-oficina") return "disponivel-oficina";
  return vehicle.status;
}

function isDriverAvailable(driver: Driver, vehicleId: string, activeDriverIds: Set<string>) {
  if (!driver.active) return false;
  if (activeDriverIds.has(driver.id)) return false;
  if (driver.vehicleId && driver.vehicleId !== vehicleId) return false;
  return true;
}

function noteLabel(demand: FreightDemand) {
  if (demand.documents.note?.status === "aprovado") return "Aprovada";
  if (demand.documents.note) return "Em conferência";
  return "Pendente";
}

function cteLabel(demand: FreightDemand) {
  if (demand.documents.cte) return "Anexado";
  if (freightStageIndex(demand.stage.id) >= freightStageIndex("NOTA_APROVADA_AG_CTE"))
    return "Pendente";
  return "Aguardando nota";
}

function digitsOnly(value?: string) {
  return (value ?? "").replace(/\D/g, "");
}

function buildWhatsAppUrl(phone?: string, text?: string) {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${normalized}${query}`;
}

function microStatusOf(
  stageId: FreightStageId,
  documents: FreightDocuments,
  vehicleStatus: VehicleStatus,
  vehicleSituation: VehicleSituation,
  finalCommand?: FinalCommand,
): MicroStatus {
  if (finalCommand === "RETORNO_SOLICITADO") {
    return { label: "Retornando", tone: "maintenance" };
  }
  if (finalCommand === "PRONTO_NOVO_FRETE") {
    return { label: "Parado aguardando comando", tone: "muted", urgent: true };
  }

  if (stageId === "DISPONIVEL") {
    return {
      label:
        vehicleSituation === "disponivel-oficina" ? "Disponível na oficina" : "Disponível no pátio",
      tone: vehicleSituation === "disponivel-oficina" ? "maintenance" : "primary",
    };
  }
  if (stageId === "EM_ROTA_CARREGAR") {
    return { label: "Em rota indo carregar", tone: "success" };
  }
  if (stageId === "AGUARDANDO_NOTA") {
    return { label: "Parado esperando carga", tone: "warning" };
  }
  if (stageId === "NOTA_EM_CONFERENCIA") {
    if (documents.note?.status === "rejeitado") {
      return { label: "Nota rejeitada", tone: "warning", urgent: true };
    }
    if (documents.note?.resentAfterRejection) {
      return { label: "Nota reenviada", tone: "warning", urgent: true };
    }
    return { label: "Nota em conferência", tone: "warning" };
  }
  if (stageId === "NOTA_APROVADA_AG_CTE") {
    if (documents.note?.status === "rejeitado") {
      return { label: "Nota rejeitada", tone: "warning", urgent: true };
    }
    if (documents.note?.resentAfterRejection) {
      return { label: "Nota reenviada", tone: "warning", urgent: true };
    }
    return documents.cte
      ? { label: "Aguardando confirmação", tone: "info" }
      : { label: "Aguardando CTE", tone: "warning", urgent: true };
  }
  if (stageId === "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA") {
    return { label: "Aguardando confirmação", tone: "info" };
  }
  if (stageId === "EM_ROTA_ENTREGA") {
    return { label: "Em rota indo descarregar", tone: "success" };
  }
  if (stageId === "ENTREGUE_AG_FINALIZACAO") {
    return { label: "Parado esperando descarga", tone: "warning" };
  }
  return {
    label: vehicleStatus === "rota-retornando" ? "Retornando" : "Parado aguardando comando",
    tone: vehicleStatus === "rota-retornando" ? "maintenance" : "muted",
    urgent: vehicleStatus !== "rota-retornando",
  };
}
