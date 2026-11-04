import type {
  AiConversationTurn,
  AiLiveSessionIssuer,
  AiModel,
  FrotakAiToolRunner,
} from "@/modules/frotak-ai/application/ports";
import {
  createFrotakAiContextSummary,
  type FrotakAiContext,
} from "@/modules/frotak-ai/domain/frotakAiContext";
import { deterministicAnswerFromToolResult } from "@/modules/frotak-ai/domain/frotakAiDeterministic";
import {
  cleanModelText,
  frotakAiSystemInstruction,
  simpleConversationAnswer,
} from "@/modules/frotak-ai/domain/frotakAiPrompt";
import {
  extractFrotakAiPendingAction,
  stripFrotakAiActionToken,
  type FrotakAiPendingAction,
} from "@/modules/frotak-ai/domain/frotakAiToolCatalog";
import {
  FROTAK_AI_TOOL_DECLARATIONS,
  normalizeFrotakAiToolCall,
  type FrotakAiToolCall,
} from "@/modules/frotak-ai/domain/frotakAiToolDeclarations";

export type FrotakAiMessage = {
  role: "assistant" | "user";
  text: string;
};

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 6_000;
const MAX_MESSAGE_CHARS = 2_400;
const MAX_TOOL_CALLS = 6;
const MAX_TOOL_ROUNDS = 3;

function trimText(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}...` : text;
}

function historyToTurns(history: FrotakAiMessage[]) {
  const turns: AiConversationTurn[] = [];
  let totalChars = 0;
  for (const message of history
    .filter((item) => item.text.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .reverse()) {
    const text = trimText(message.text);
    if (!text || totalChars + text.length > MAX_HISTORY_CHARS) continue;
    totalChars += text.length;
    turns.unshift({ kind: "text", role: message.role, text });
  }
  return turns;
}

function toSerializable(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

/**
 * Conversa por texto: o modelo pode encadear ferramentas (ex.: buscar -> consultar) ate o limite
 * de rodadas. Se toda ferramenta da rodada ja traz resposta pronta do servidor, ela vale sem
 * passar de novo pelo modelo, para nao correr o risco de alterar numeros.
 */
export async function sendFrotakAiChat(
  deps: { model: AiModel; tools: FrotakAiToolRunner },
  input: { context: FrotakAiContext; message: string; history: FrotakAiMessage[] },
) {
  const { context, message } = input;

  const conversationAnswer = simpleConversationAnswer(message);
  if (conversationAnswer) {
    return {
      text: conversationAnswer,
      model: "frotak-server",
      tools: [] as string[],
      pendingActions: [] as FrotakAiPendingAction[],
    };
  }

  const systemInstruction = frotakAiSystemInstruction(
    "texto",
    createFrotakAiContextSummary(context),
    await deps.tools.tenantSnapshot(context),
  );
  const firstTurns: AiConversationTurn[] = [
    ...historyToTurns(input.history),
    { kind: "text", role: "user", text: message },
  ];
  const request = {
    systemInstruction,
    maxOutputTokens: 1200,
    tools: FROTAK_AI_TOOL_DECLARATIONS,
  };

  let reply = await deps.model.start({
    ...request,
    turns: firstTurns,
    temperature: 0.2,
    toolMode: "auto",
  });
  const selectedModel = reply.model;
  const conversation = [...firstTurns];
  const usedTools: string[] = [];
  const pendingActions: FrotakAiPendingAction[] = [];

  for (let round = 0; ; round += 1) {
    const toolCalls = reply.toolCalls
      .map(normalizeFrotakAiToolCall)
      .filter((call): call is FrotakAiToolCall => Boolean(call))
      .slice(0, MAX_TOOL_CALLS);
    if (!reply.raw || toolCalls.length === 0) break;

    const executions = await Promise.all(
      toolCalls.map(async (call) => ({
        call,
        result: await deps.tools.execute(context, call.name, call.args ?? {}),
      })),
    );
    for (const { result } of executions) {
      const pending = extractFrotakAiPendingAction(result);
      if (pending) pendingActions.push(pending);
    }
    usedTools.push(...toolCalls.map((call) => call.name));

    const deterministicAnswers = executions
      .map(({ result }) => deterministicAnswerFromToolResult(result))
      .filter((answer): answer is string => Boolean(answer));
    if (deterministicAnswers.length > 0 && deterministicAnswers.length === executions.length) {
      return {
        text: deterministicAnswers.join("\n\n"),
        model: "frotak-server",
        tools: usedTools,
        pendingActions,
      };
    }

    conversation.push(
      { kind: "model", raw: reply.raw },
      {
        kind: "toolResults",
        results: executions.map(({ call, result }) => ({
          call,
          output: toSerializable(stripFrotakAiActionToken(result)),
        })),
      },
    );

    const lastRound = round + 1 >= MAX_TOOL_ROUNDS;
    reply = await deps.model.continue(selectedModel, {
      ...request,
      turns: conversation,
      temperature: 0.1,
      toolMode: lastRound ? "none" : "auto",
    });
    if (lastRound) break;
  }

  const text = cleanModelText(reply.text());
  if (!text) throw new Error("Resposta vazia da IA");
  return { text, model: selectedModel, tools: usedTools, pendingActions };
}

/** Sessao de voz: as mesmas instrucoes e ferramentas, com credencial efemera para o navegador. */
export async function startFrotakAiLiveSession(
  deps: { live: AiLiveSessionIssuer; tools: FrotakAiToolRunner },
  context: FrotakAiContext,
) {
  return deps.live.issue({
    systemInstruction: frotakAiSystemInstruction(
      "voz",
      createFrotakAiContextSummary(context),
      await deps.tools.tenantSnapshot(context),
    ),
    tools: FROTAK_AI_TOOL_DECLARATIONS,
  });
}
