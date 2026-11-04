import type { FrotakAiContext } from "@/modules/frotak-ai/domain/frotakAiContext";
import type {
  FrotakAiToolCall,
  FrotakAiToolDeclaration,
} from "@/modules/frotak-ai/domain/frotakAiToolDeclarations";
import type { FrotakAiToolName } from "@/modules/frotak-ai/domain/frotakAiToolCatalog";

/** Turno da conversa em formato neutro; o adaptador converte para o formato do provedor. */
export type AiConversationTurn =
  | { kind: "text"; role: "user" | "assistant"; text: string }
  /** Resposta do modelo devolvida como veio: o provedor pode exigir os metadados dela. */
  | { kind: "model"; raw: unknown }
  | { kind: "toolResults"; results: Array<{ call: FrotakAiToolCall; output: unknown }> };

export interface AiGenerateRequest {
  turns: AiConversationTurn[];
  systemInstruction: string;
  temperature: number;
  maxOutputTokens: number;
  tools: readonly FrotakAiToolDeclaration[];
  /** "none" obriga o modelo a responder em texto. */
  toolMode: "auto" | "none";
}

export interface AiModelReply {
  model: string;
  toolCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>;
  /** Conteudo bruto da resposta, para repassar no proximo turno; ausente se nao houver. */
  raw: unknown;
  /** Lido so quando a conversa termina: algumas respostas trazem apenas ferramentas. */
  text(): string;
}

/**
 * Provedor do modelo de linguagem. Para usar outro provedor, implemente esta interface num
 * adaptador em infrastructure/ e troque-o onde o caso de uso e montado.
 */
export interface AiModel {
  /** Primeira chamada da conversa: escolhe o primeiro modelo disponivel. */
  start(request: AiGenerateRequest): Promise<AiModelReply>;
  /** Chamadas seguintes: prefere o modelo ja escolhido e usa os demais como reserva. */
  continue(preferredModel: string, request: AiGenerateRequest): Promise<AiModelReply>;
}

export interface AiLiveSession {
  token: string;
  model: string;
  setupConfig: unknown;
}

/** Credencial efemera para o navegador falar direto com o modelo de voz. */
export interface AiLiveSessionIssuer {
  issue(input: {
    systemInstruction: string;
    tools: readonly FrotakAiToolDeclaration[];
  }): Promise<AiLiveSession>;
}

/** Ferramentas sobre os dados do tenant (leitura) e preparo de acoes. */
export interface FrotakAiToolRunner {
  execute(
    context: FrotakAiContext,
    name: FrotakAiToolName,
    args?: Record<string, unknown>,
  ): Promise<unknown>;
  /** Retrato do tenant para o inicio da conversa; vazio se indisponivel. */
  tenantSnapshot(context: FrotakAiContext): Promise<string>;
}

export interface PushSubscription {
  id: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushSubscriptionStore {
  listAll(): Promise<PushSubscription[]>;
  listActiveMembers(workspaceId: string): Promise<Set<string>>;
  remove(id: string): Promise<void>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, status: number | undefined): Promise<void>;
}

export interface PushSender {
  send(
    subscription: PushSubscription,
    message: PushMessage,
  ): Promise<{ ok: boolean; gone: boolean; status?: number }>;
}

export interface IdleFleetSummary {
  quantidade: number;
  horas_minimas: number;
  veiculos: Array<{
    placa: string;
    dias_parado: number | null;
    precisa_motivo: boolean;
    motivo: string;
  }>;
}

export interface IdleFleetReader {
  listIdle(subscription: PushSubscription): Promise<IdleFleetSummary>;
}

export interface AiModuleGate {
  isEnabled(workspaceId: string): Promise<boolean>;
}
