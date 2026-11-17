// Indicadores do portal do embarcador. Funcoes puras: rodam igual no servidor,
// nas telas e no modo demonstracao.

import {
  DWELL_LIMIT_MIN,
  type ShipperCarrier,
  type ShipperFreight,
  type ShipperPortalData,
} from "./types";

const HOUR = 60 * 60 * 1000;
/** Caminhao parado ha mais que isso no mesmo status vira alerta. */
export const STOPPED_ALERT_MIN = 6 * 60;
/** Entregue ha mais que isso sem comprovante vira "canhoto atrasado". */
export const PROOF_ALERT_HOURS = 24;

export function hasProof(freight: ShipperFreight) {
  return freight.documents.some((doc) => doc.isProof);
}

export function isDelivered(freight: ShipperFreight) {
  return freight.step === "entregue" && !freight.cancelled;
}

export function isActive(freight: ShipperFreight) {
  return !freight.finished && freight.step !== "entregue";
}

function minutesSince(iso?: string, now = Date.now()) {
  if (!iso) return undefined;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.round((now - time) / 60_000)) : undefined;
}

export function proofDelayHours(freight: ShipperFreight, now = Date.now()) {
  if (!isDelivered(freight) || !freight.deliveredAt) return undefined;
  const proof = freight.documents
    .filter((doc) => doc.isProof)
    .map((doc) => new Date(doc.sentAt).getTime())
    .sort((a, b) => a - b)[0];
  const delivered = new Date(freight.deliveredAt).getTime();
  const end = proof ?? now;
  return Math.max(0, (end - delivered) / HOUR);
}

export function stoppedMinutes(freight: ShipperFreight, now = Date.now()) {
  if (!isActive(freight)) return undefined;
  if (!/^No local|Carregado/.test(freight.statusLabel) && !freight.occurrence) return undefined;
  return minutesSince(freight.lastEventAt, now);
}

// ---------------------------------------------------------------- KPIs

export interface ShipperKpis {
  active: number;
  inRoute: number;
  atDock: number;
  deliveredToday: number;
  delivered30d: number;
  occurrences: number;
  pendingProofs: number;
  trackedPct: number;
  avgUnloadingDwellMin?: number;
  dwellOverLimit: number;
  co2Kg30d: number;
  connectedCarriers: number;
  invitedCarriers: number;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

export function computeKpis(data: ShipperPortalData, now = Date.now()): ShipperKpis {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const monthAgo = now - 30 * 24 * HOUR;
  const active = data.freights.filter(isActive);
  const delivered = data.freights.filter(isDelivered);
  const delivered30d = delivered.filter(
    (freight) => !freight.deliveredAt || new Date(freight.deliveredAt).getTime() >= monthAgo,
  );
  const dwellValues = data.freights
    .flatMap((freight) => [freight.loadingDwellMin, freight.unloadingDwellMin])
    .filter((value): value is number => typeof value === "number");

  return {
    active: active.length,
    inRoute: active.filter((freight) => freight.statusLabel.startsWith("Em rota")).length,
    atDock: active.filter((freight) => freight.statusLabel.startsWith("No local")).length,
    deliveredToday: delivered.filter(
      (freight) =>
        freight.deliveredAt && new Date(freight.deliveredAt).getTime() >= startOfDay.getTime(),
    ).length,
    delivered30d: delivered30d.length,
    occurrences: active.filter((freight) => freight.occurrence).length,
    pendingProofs: delivered.filter((freight) => !hasProof(freight)).length,
    trackedPct: active.length
      ? Math.round((active.filter((freight) => freight.tracked).length / active.length) * 100)
      : 100,
    avgUnloadingDwellMin: average(
      data.freights
        .map((freight) => freight.unloadingDwellMin)
        .filter((value): value is number => typeof value === "number"),
    ),
    dwellOverLimit: dwellValues.filter((value) => value > DWELL_LIMIT_MIN).length,
    co2Kg30d: Math.round(delivered30d.reduce((sum, freight) => sum + (freight.co2Kg ?? 0), 0)),
    connectedCarriers: data.carriers.filter((carrier) => carrier.status === "ativa").length,
    invitedCarriers: data.carriers.filter((carrier) => carrier.status === "convidada").length,
  };
}

// ---------------------------------------------------------------- Alertas

export type AlertTone = "danger" | "warning" | "info";

export interface ShipperAlert {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  freightId?: string;
  carrierId?: string;
}

export function formatDuration(minutes?: number) {
  if (minutes === undefined || !Number.isFinite(minutes)) return "-";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours < 24) return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function computeAlerts(data: ShipperPortalData, now = Date.now()): ShipperAlert[] {
  const alerts: ShipperAlert[] = [];
  for (const freight of data.freights) {
    const label = `${freight.carrierName} · ${freight.plate}`;
    if (isActive(freight) && freight.occurrence) {
      alerts.push({
        id: `occ-${freight.id}`,
        tone: "danger",
        title: "Ocorrência na viagem",
        detail: `${label}: ${freight.occurrence}`,
        freightId: freight.id,
      });
      continue;
    }
    const stopped = stoppedMinutes(freight, now);
    if (stopped !== undefined && stopped >= STOPPED_ALERT_MIN) {
      alerts.push({
        id: `stop-${freight.id}`,
        tone: "warning",
        title: `${freight.statusLabel} há ${formatDuration(stopped)}`,
        detail: `${label} · ${freight.destinationName ?? freight.destination ?? ""}`,
        freightId: freight.id,
      });
    }
    const delay = proofDelayHours(freight, now);
    if (delay !== undefined && !hasProof(freight) && delay >= PROOF_ALERT_HOURS) {
      alerts.push({
        id: `proof-${freight.id}`,
        tone: "warning",
        title: "Canhoto atrasado",
        detail: `${label}: entregue há ${formatDuration(delay * 60)} sem comprovante`,
        freightId: freight.id,
      });
    }
  }
  for (const carrier of data.carriers) {
    if (carrier.status !== "convidada") continue;
    const days = (now - new Date(carrier.invitedAt).getTime()) / (24 * HOUR);
    if (days >= 3) {
      alerts.push({
        id: `invite-${carrier.id}`,
        tone: "info",
        title: "Convite sem resposta",
        detail: `${carrier.name} ainda não aceitou (enviado há ${Math.floor(days)} dias)`,
        carrierId: carrier.id,
      });
    }
  }
  const order: Record<AlertTone, number> = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ---------------------------------------------------------------- Scorecard

export interface CarrierScorecard {
  carrier: ShipperCarrier;
  total: number;
  active: number;
  delivered: number;
  occurrences: number;
  pendingProofs: number;
  avgProofHours?: number;
  trackedPct?: number;
  avgLoadingDwellMin?: number;
  avgUnloadingDwellMin?: number;
  co2Kg: number;
  /** 0 a 100. So existe quando ha cargas suficientes para avaliar. */
  score?: number;
  rank?: number;
}

export function computeScorecards(data: ShipperPortalData, now = Date.now()): CarrierScorecard[] {
  const cards = data.carriers.map((carrier): CarrierScorecard => {
    const freights = data.freights.filter((freight) => freight.carrierId === carrier.id);
    const delivered = freights.filter(isDelivered);
    const proofHours = delivered
      .filter(hasProof)
      .map((freight) => proofDelayHours(freight, now))
      .filter((value): value is number => typeof value === "number");
    const occurrences = freights.filter((freight) =>
      freight.events.some((event) => event.label.includes("problema mecânico")),
    ).length;
    const trackable = freights.filter((freight) => !freight.cancelled);
    const card: CarrierScorecard = {
      carrier,
      total: freights.length,
      active: freights.filter(isActive).length,
      delivered: delivered.length,
      occurrences,
      pendingProofs: delivered.filter((freight) => !hasProof(freight)).length,
      avgProofHours: average(proofHours),
      trackedPct: trackable.length
        ? Math.round(
            (trackable.filter((freight) => freight.tracked).length / trackable.length) * 100,
          )
        : undefined,
      avgLoadingDwellMin: average(
        freights.map((f) => f.loadingDwellMin).filter((v): v is number => typeof v === "number"),
      ),
      avgUnloadingDwellMin: average(
        freights.map((f) => f.unloadingDwellMin).filter((v): v is number => typeof v === "number"),
      ),
      co2Kg: Math.round(freights.reduce((sum, freight) => sum + (freight.co2Kg ?? 0), 0)),
    };
    if (card.total >= 2) {
      // Pontuacao simples e explicavel: comeca em 100 e perde pontos por problema.
      let score = 100;
      score -= Math.min(30, (card.occurrences / card.total) * 60);
      score -= Math.min(20, (card.pendingProofs / Math.max(1, card.delivered)) * 30);
      if (card.avgProofHours !== undefined)
        score -= Math.min(20, Math.max(0, card.avgProofHours - 4) * 1.5);
      if (card.trackedPct !== undefined) score -= Math.min(20, (100 - card.trackedPct) * 0.2);
      card.score = Math.max(0, Math.round(score));
    }
    return card;
  });
  const ranked = cards
    .filter((card) => card.score !== undefined)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  ranked.forEach((card, index) => {
    card.rank = index + 1;
  });
  return cards.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return b.total - a.total;
  });
}

// ---------------------------------------------------------------- IA

/** Resumo compacto que vai para a IA. Sem valores: so o que o embarcador ja pode ver. */
export function buildAiContext(data: ShipperPortalData, now = Date.now()) {
  const kpis = computeKpis(data, now);
  const scorecards = computeScorecards(data, now);
  const alerts = computeAlerts(data, now);
  return {
    agora: new Date(now).toISOString(),
    embarcador: data.profile.companyName,
    indicadores: kpis,
    alertas: alerts.map((alert) => `${alert.title}: ${alert.detail}`),
    transportadoras: scorecards.map((card) => ({
      nome: card.carrier.name,
      situacao: card.carrier.status,
      cargas: card.total,
      em_andamento: card.active,
      entregues: card.delivered,
      ocorrencias: card.occurrences,
      canhotos_pendentes: card.pendingProofs,
      horas_medias_para_canhoto: card.avgProofHours?.toFixed(1),
      pct_rastreado: card.trackedPct,
      espera_media_carregamento_min: card.avgLoadingDwellMin && Math.round(card.avgLoadingDwellMin),
      espera_media_descarga_min: card.avgUnloadingDwellMin && Math.round(card.avgUnloadingDwellMin),
      co2_kg: card.co2Kg,
      nota: card.score,
      posicao_ranking: card.rank,
    })),
    cargas: data.freights.slice(0, 120).map((freight) => ({
      codigo: freight.code,
      transportadora: freight.carrierName,
      placa: freight.plate,
      motorista: freight.driverFirstName,
      produto: freight.product,
      origem: [freight.originName, freight.origin].filter(Boolean).join(" - "),
      destino: [freight.destinationName, freight.destination].filter(Boolean).join(" - "),
      status: freight.statusLabel,
      detalhe: freight.statusDetail,
      ocorrencia: freight.occurrence,
      ultima_atualizacao: freight.lastEventAt,
      entregue_em: freight.deliveredAt,
      posicao: freight.position?.place,
      posicao_em: freight.position?.at,
      documentos: freight.documents.map((doc) => doc.label),
      tem_canhoto: hasProof(freight),
      espera_carregamento_min: freight.loadingDwellMin,
      espera_descarga_min: freight.unloadingDwellMin,
      co2_kg: freight.co2Kg,
    })),
  };
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function listFreights(freights: ShipperFreight[], limit = 6) {
  return freights
    .slice(0, limit)
    .map(
      (freight) =>
        `• ${freight.carrierName}, ${freight.plate}: ${freight.statusLabel}${
          freight.position?.place ? ` (${freight.position.place})` : ""
        }`,
    )
    .join("\n");
}

/**
 * Resposta sem IA externa. Usada quando a chave da IA nao esta configurada ou
 * falha, e no modo demonstracao. Cobre as perguntas mais comuns.
 */
export function answerLocally(question: string, data: ShipperPortalData, now = Date.now()): string {
  const q = normalize(question);
  const kpis = computeKpis(data, now);
  const scorecards = computeScorecards(data, now);
  const alerts = computeAlerts(data, now);
  const active = data.freights.filter(isActive);

  const carrier = data.carriers.find((item) => q.includes(normalize(item.name).split(" ")[0]));

  if (/canhoto|comprovante/.test(q)) {
    const pending = data.freights.filter((freight) => isDelivered(freight) && !hasProof(freight));
    if (!pending.length)
      return "Todas as cargas entregues já têm canhoto ou comprovante de entrega.";
    const worst = [...scorecards].sort(
      (a, b) => (b.avgProofHours ?? 0) - (a.avgProofHours ?? 0),
    )[0];
    return `${pending.length} carga(s) entregue(s) ainda sem comprovante:\n${listFreights(pending)}${
      worst?.avgProofHours
        ? `\n\nQuem mais demora para mandar canhoto: ${worst.carrier.name} (média de ${worst.avgProofHours.toFixed(1)} h).`
        : ""
    }`;
  }
  if (/doca|espera|estadia|parad/.test(q)) {
    const long = data.freights
      .filter(
        (freight) =>
          (freight.unloadingDwellMin ?? 0) > DWELL_LIMIT_MIN ||
          (freight.loadingDwellMin ?? 0) > DWELL_LIMIT_MIN,
      )
      .slice(0, 5);
    const avg = kpis.avgUnloadingDwellMin;
    return `Espera média na descarga: ${formatDuration(avg)}. ${kpis.dwellOverLimit} parada(s) passaram de 5 horas, que é quando a lei prevê estadia.${
      long.length
        ? `\n${long
            .map(
              (freight) =>
                `• ${freight.carrierName}, ${freight.plate}: carregamento ${formatDuration(freight.loadingDwellMin)}, descarga ${formatDuration(freight.unloadingDwellMin)}`,
            )
            .join("\n")}`
        : ""
    }`;
  }
  if (/co2|carbono|emiss|esg/.test(q)) {
    return `Emissão das cargas entregues nos últimos 30 dias: ${kpis.co2Kg30d.toLocaleString("pt-BR")} kg de CO₂, calculada pelo diesel abastecido nas viagens.\n${scorecards
      .filter((card) => card.co2Kg > 0)
      .map((card) => `• ${card.carrier.name}: ${card.co2Kg.toLocaleString("pt-BR")} kg`)
      .join("\n")}`;
  }
  if (/melhor|pior|ranking|nota|score|desempenho/.test(q)) {
    const ranked = scorecards.filter((card) => card.rank);
    if (!ranked.length) return "Ainda não há cargas suficientes para comparar as transportadoras.";
    return `Ranking das transportadoras:\n${ranked
      .map(
        (card) =>
          `${card.rank}. ${card.carrier.name}: nota ${card.score}, ${card.delivered} entregas, ${card.occurrences} ocorrência(s), ${card.pendingProofs} canhoto(s) pendente(s)`,
      )
      .join("\n")}`;
  }
  if (/ocorr|quebr|problema|alerta|atras/.test(q)) {
    if (!alerts.length) return "Nenhum alerta agora. Todas as cargas estão andando normalmente.";
    return `${alerts.length} alerta(s):\n${alerts
      .slice(0, 6)
      .map((alert) => `• ${alert.title}: ${alert.detail}`)
      .join("\n")}`;
  }
  if (carrier) {
    const freights = data.freights.filter(
      (freight) => freight.carrierId === carrier.id && isActive(freight),
    );
    const card = scorecards.find((item) => item.carrier.id === carrier.id);
    return `${carrier.name}: ${freights.length} carga(s) em andamento.${freights.length ? `\n${listFreights(freights)}` : ""}${
      card?.score !== undefined
        ? `\nNota ${card.score}${card.rank ? `, ${card.rank}º no ranking` : ""}.`
        : ""
    }`;
  }
  if (/onde|posic|mapa|caminh/.test(q)) {
    const located = active.filter((freight) => freight.position);
    if (!located.length) return "Nenhum caminhão com posição recente agora.";
    return `Caminhões em viagem:\n${listFreights(located, 8)}`;
  }
  if (/convite|transportadora/.test(q)) {
    return `Você tem ${kpis.connectedCarriers} transportadora(s) conectada(s) e ${kpis.invitedCarriers} convite(s) aguardando resposta.`;
  }
  return `Resumo de agora: ${kpis.active} carga(s) em andamento (${kpis.inRoute} em rota, ${kpis.atDock} em doca), ${kpis.deliveredToday} entregue(s) hoje, ${kpis.occurrences} ocorrência(s) e ${kpis.pendingProofs} canhoto(s) pendente(s).${
    alerts.length
      ? `\n\nPrecisa de atenção:\n${alerts
          .slice(0, 3)
          .map((alert) => `• ${alert.title}: ${alert.detail}`)
          .join("\n")}`
      : ""
  }`;
}
