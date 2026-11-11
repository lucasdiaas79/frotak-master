// Link de acompanhamento do frete para o cliente (embarcador), sem login.
// Este arquivo e compartilhado entre o servidor e a pagina publica: so tipos e
// regras puras. Nada aqui pode expor valor do frete, custos ou dados de outros fretes.

export type PublicFreightStep = "programado" | "carregamento" | "em_rota" | "entregue";

export type PublicFreightDocumentKind =
  | "nota_fiscal"
  | "cte"
  | "cte_mdfe"
  | "balanca"
  | "comprovante_descarga"
  | "canhoto"
  | "comprovante_entrega";

export interface PublicFreightEvent {
  label: string;
  at: string;
  place?: string;
}

export interface PublicFreightDocument {
  kind: PublicFreightDocumentKind;
  label: string;
  url?: string;
  sentAt: string;
  isImage: boolean;
}

export interface PublicFreightTracking {
  carrierName: string;
  freightCode: string;
  plate: string;
  driverFirstName?: string;
  product?: string;
  origin?: string;
  originName?: string;
  destination?: string;
  destinationName?: string;
  step: PublicFreightStep;
  statusLabel: string;
  statusDetail?: string;
  occurrence?: string;
  finished: boolean;
  position?: { lat: number; lng: number; at?: string; place?: string };
  events: PublicFreightEvent[];
  documents: PublicFreightDocument[];
  expiresAt: string;
  updatedAt: string;
}

export const PUBLIC_DOCUMENT_LABELS: Record<PublicFreightDocumentKind, string> = {
  nota_fiscal: "Nota fiscal",
  cte: "CT-e",
  cte_mdfe: "CT-e / MDF-e",
  balanca: "Ticket de balança",
  comprovante_descarga: "Comprovante de descarga",
  canhoto: "Canhoto assinado",
  comprovante_entrega: "Comprovante de entrega",
};

export function isPublicDocumentKind(kind: string): kind is PublicFreightDocumentKind {
  return kind in PUBLIC_DOCUMENT_LABELS;
}

export const PUBLIC_STEPS: Array<{ id: PublicFreightStep; label: string }> = [
  { id: "programado", label: "Programado" },
  { id: "carregamento", label: "Carregamento" },
  { id: "em_rota", label: "Em rota de entrega" },
  { id: "entregue", label: "Entregue" },
];

const DELIVERED_STAGES = new Set(["ENTREGUE_AG_FINALIZACAO", "ENTREGA_FINALIZADA"]);
const LOADING_STAGES = new Set([
  "AGUARDANDO_NOTA",
  "NOTA_EM_CONFERENCIA",
  "NOTA_APROVADA_AG_CTE",
  "CTE_GERADA_AG_CONFIRMACAO_MOTORISTA",
]);

// Traduz a etapa interna do Kanban para o que o cliente entende.
export function publicStatus(
  freightStage?: string | null,
  vehicleStatus?: string | null,
): { step: PublicFreightStep; label: string; detail?: string; occurrence?: string } {
  const stage = freightStage ?? "";
  const status = vehicleStatus ?? "";
  const occurrence =
    status === "parado-quebrado" || status === "manutencao"
      ? "Veículo parado por problema mecânico. A transportadora está cuidando disso."
      : undefined;

  if (
    DELIVERED_STAGES.has(stage) ||
    status === "rota-retornando" ||
    status === "parado-aguardando-comando"
  ) {
    return { step: "entregue", label: "Entregue" };
  }
  if (stage === "EM_ROTA_ENTREGA") {
    if (status === "parado-descarregando") {
      return {
        step: "em_rota",
        label: "No local de entrega",
        detail: "Aguardando descarga",
        occurrence,
      };
    }
    return { step: "em_rota", label: "Em rota de entrega", occurrence };
  }
  if (
    LOADING_STAGES.has(stage) ||
    status === "aguardando-cte" ||
    status === "aguardando-confirmacao"
  ) {
    return {
      step: "carregamento",
      label: "Carregado",
      detail: "Emitindo documentos para seguir viagem",
      occurrence,
    };
  }
  if (stage === "EM_ROTA_CARREGAR") {
    if (status === "parado-aguardando-carga") {
      return { step: "carregamento", label: "No local de carregamento", occurrence };
    }
    return { step: "programado", label: "A caminho do carregamento", occurrence };
  }
  return { step: "programado", label: "Frete programado", occurrence };
}

// Rotulo de cada evento da linha do tempo, a partir do status do veiculo.
const EVENT_LABELS: Record<string, string> = {
  "rota-carregar": "Saiu para carregar",
  "parado-aguardando-carga": "Chegou ao local de carregamento",
  "aguardando-cte": "Carregado, emitindo documentos",
  "aguardando-confirmacao": "Documentos emitidos",
  "rota-descarregar": "Saiu para entrega",
  "parado-descarregando": "Chegou ao local de entrega",
  "parado-aguardando-comando": "Entrega concluída",
  "rota-retornando": "Entrega concluída",
  "parado-quebrado": "Parada por problema mecânico",
  manutencao: "Parada por problema mecânico",
};

export function publicEventLabel(status?: string | null) {
  return status ? EVENT_LABELS[status] : undefined;
}

export function placeLabel(city?: string | null, state?: string | null) {
  const c = city?.trim();
  const s = state?.trim();
  if (c && s) return `${c}/${s}`;
  return c || s || undefined;
}

export function firstName(name?: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first || undefined;
}

// Token: 32 bytes aleatorios em base64url. No banco fica so o SHA-256 em hex.
export function generateShareToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isWellFormedShareToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function hashShareToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function shareUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/acompanhar/${token}`;
}

// Usado so em desenvolvimento (/acompanhar/demo?cenario=...) para ver a pagina sem banco.
export type DemoScenario = "carregamento" | "em_rota" | "descarga" | "quebrado" | "entregue";

export function demoTracking(scenario: string = "em_rota"): PublicFreightTracking {
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const all: PublicFreightEvent[] = [
    { label: "Entrega concluída", at: at(20), place: "Salvador/BA" },
    { label: "Chegou ao local de entrega", at: at(95), place: "Salvador/BA" },
    { label: "Saiu para entrega", at: at(390), place: "Aracaju/SE" },
    { label: "Documentos emitidos", at: at(410), place: "Aracaju/SE" },
    { label: "Carregado, emitindo documentos", at: at(470), place: "Aracaju/SE" },
    { label: "Chegou ao local de carregamento", at: at(560), place: "Aracaju/SE" },
    { label: "Saiu para carregar", at: at(620), place: "Nossa Senhora do Socorro/SE" },
  ];
  const docs: PublicFreightDocument[] = [
    { kind: "nota_fiscal", label: "Nota fiscal", sentAt: at(440), isImage: false },
    { kind: "cte_mdfe", label: "CT-e / MDF-e", sentAt: at(410), isImage: false },
    { kind: "balanca", label: "Ticket de balança", sentAt: at(460), isImage: true },
    {
      kind: "comprovante_descarga",
      label: "Comprovante de descarga",
      sentAt: at(22),
      isImage: true,
    },
    { kind: "canhoto", label: "Canhoto assinado", sentAt: at(21), isImage: true },
  ];
  const base = {
    carrierName: "Transportadora Exemplo",
    freightCode: "FRT-TNX6J30-8A2F",
    plate: "TNX6J30",
    driverFirstName: "João",
    product: "Areia lavada",
    origin: "Aracaju/SE",
    originName: "Mineração Pedra Branca",
    destination: "Salvador/BA",
    destinationName: "Construtora Litoral",
    expiresAt: new Date(now + 29 * 86_400_000).toISOString(),
    updatedAt: at(1),
  };
  switch (scenario) {
    case "carregamento":
      return {
        ...base,
        step: "carregamento",
        statusLabel: "No local de carregamento",
        finished: false,
        position: { lat: -10.9472, lng: -37.0731, at: at(4), place: "Aracaju/SE" },
        events: all.slice(5),
        documents: [],
      };
    case "descarga":
      return {
        ...base,
        step: "em_rota",
        statusLabel: "No local de entrega",
        statusDetail: "Aguardando descarga",
        finished: false,
        position: { lat: -12.9714, lng: -38.5014, at: at(3), place: "Salvador/BA" },
        events: all.slice(1),
        documents: docs.slice(0, 3),
      };
    case "quebrado":
      return {
        ...base,
        step: "em_rota",
        statusLabel: "Em rota de entrega",
        occurrence: "Veículo parado por problema mecânico. A transportadora está cuidando disso.",
        finished: false,
        position: { lat: -11.79, lng: -37.95, at: at(12), place: "Esplanada/BA" },
        events: [
          { label: "Parada por problema mecânico", at: at(40), place: "Esplanada/BA" },
          ...all.slice(2),
        ],
        documents: docs.slice(0, 3),
      };
    case "entregue":
      return {
        ...base,
        step: "entregue",
        statusLabel: "Entregue",
        finished: true,
        events: all,
        documents: docs,
      };
    default:
      return {
        ...base,
        step: "em_rota",
        statusLabel: "Em rota de entrega",
        finished: false,
        position: { lat: -11.79, lng: -37.95, at: at(6), place: "Esplanada/BA" },
        events: all.slice(2),
        documents: docs.slice(0, 3),
      };
  }
}
