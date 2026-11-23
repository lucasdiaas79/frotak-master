import {
  EndSensitivity,
  FunctionCallingConfigMode,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";
import type {
  AiConversationTurn,
  AiGenerateRequest,
  AiLiveSessionIssuer,
  AiModel,
  AiModelReply,
} from "@/modules/frotak-ai/application/ports";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.8-flash";
export const FROTAK_AI_TEXT_FALLBACK_MODEL = "gemini-3.6-flash";
// Reservas para quando os modelos principais estao sem capacidade (HTTP 503 "high demand").
const FROTAK_AI_TEXT_EXTRA_FALLBACKS = ["gemini-3.5-flash", "gemini-2.5-flash"];
export const FROTAK_AI_LIVE_MODEL = "gemini-3.8-live";
// Modelo sem capacidade fica fora da fila por um tempo, para a proxima mensagem nao esperar por ele.
const OVERLOADED_COOLDOWN_MS = 60_000;

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada");
  return key;
}

const overloadedUntil = new Map<string, number>();

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Sem capacidade agora ou fora do ar: vale tentar outro modelo, nao o mesmo de novo. */
function isOverloadedGeminiError(error: unknown) {
  return /unavailable|overloaded|503|high demand|resource.?exhausted|429/i.test(
    errorMessage(error),
  );
}

/** Falha passageira de rede: vale uma nova tentativa no mesmo modelo. */
function isTransientGeminiError(error: unknown) {
  return /500|internal|deadline|timeout|fetch failed|ECONNRESET|socket/i.test(errorMessage(error));
}

function isRetryableGeminiError(error: unknown) {
  return (
    /not found/i.test(errorMessage(error)) ||
    isOverloadedGeminiError(error) ||
    isTransientGeminiError(error)
  );
}

/** O modelo nao aceita o nivel de raciocinio pedido: refaz sem ele. */
function isThinkingConfigError(error: unknown) {
  return (
    /thinking/i.test(errorMessage(error)) &&
    /not supported|invalid|unsupported/i.test(errorMessage(error))
  );
}

function markOverloaded(model: string, error: unknown) {
  if (isOverloadedGeminiError(error))
    overloadedUntil.set(model, Date.now() + OVERLOADED_COOLDOWN_MS);
}

function modelList() {
  const all = Array.from(
    new Set(
      [
        process.env.GEMINI_TEXT_MODEL,
        FROTAK_AI_TEXT_MODEL,
        FROTAK_AI_TEXT_FALLBACK_MODEL,
        ...FROTAK_AI_TEXT_EXTRA_FALLBACKS,
      ].filter((item): item is string => Boolean(item && item.trim())),
    ),
  );
  // Os sobrecarregados vao para o fim da fila enquanto durar a pausa; nunca somem de vez.
  const now = Date.now();
  return [
    ...all.filter((model) => (overloadedUntil.get(model) ?? 0) <= now),
    ...all.filter((model) => (overloadedUntil.get(model) ?? 0) > now),
  ];
}

function toContents(turns: AiConversationTurn[]): Content[] {
  return turns.map((turn) => {
    if (turn.kind === "text") {
      return {
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.text }],
      };
    }
    if (turn.kind === "model") return turn.raw as Content;
    return {
      role: "user",
      parts: turn.results.map(({ call, output }) => ({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { output: output as Record<string, unknown> },
        },
      })),
    } as Content;
  });
}

// As declaracoes neutras usam os mesmos nomes de tipo do Gemini ("STRING", "OBJECT"...).
function toFunctionDeclarations(tools: AiGenerateRequest["tools"]) {
  return tools.map((tool) => tool) as unknown as FunctionDeclaration[];
}

// Raciocinio baixo: no chat ele cortou o tempo de resposta de dezenas de segundos para poucos
// segundos, sem piorar a escolha da ferramenta. Modelo que nao aceita o nivel e refeito sem ele.
function toGeminiRequest(request: AiGenerateRequest, withThinkingLevel = true) {
  return {
    contents: toContents(request.turns),
    config: {
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      ...(withThinkingLevel ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      systemInstruction: request.systemInstruction,
      tools: [{ functionDeclarations: toFunctionDeclarations(request.tools) }],
      toolConfig: {
        // AUTO: dados do tenant passam por ferramenta; assuntos gerais a IA responde direto.
        functionCallingConfig: {
          mode:
            request.toolMode === "none"
              ? FunctionCallingConfigMode.NONE
              : FunctionCallingConfigMode.AUTO,
        },
      },
    },
  };
}

function toReply(model: string, response: GenerateContentResponse): AiModelReply {
  return {
    model,
    toolCalls: (response.functionCalls ?? []).map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args,
    })),
    raw: response.candidates?.[0]?.content,
    text: () => response.text ?? "",
  };
}

/** Adaptador do Gemini para a porta AiModel, com troca de modelo e novas tentativas. */
export class GeminiAiModel implements AiModel {
  private readonly ai: GoogleGenAI;
  private readonly onError: (error: unknown, tool: string) => void;

  constructor(onError: (error: unknown, tool: string) => void) {
    this.ai = new GoogleGenAI({ apiKey: geminiApiKey() });
    this.onError = onError;
  }

  private async generate(model: string, request: AiGenerateRequest) {
    try {
      return await this.ai.models.generateContent({ ...toGeminiRequest(request), model });
    } catch (error) {
      if (!isThinkingConfigError(error)) throw error;
      return this.ai.models.generateContent({ ...toGeminiRequest(request, false), model });
    }
  }

  async start(request: AiGenerateRequest) {
    let lastError: unknown;
    for (const model of modelList()) {
      try {
        return toReply(model, await this.generate(model, request));
      } catch (error) {
        lastError = error;
        this.onError(error, `${model}#select`);
        markOverloaded(model, error);
        if (!isRetryableGeminiError(error)) break;
      }
    }
    throw lastError;
  }

  async continue(preferredModel: string, request: AiGenerateRequest) {
    const models = Array.from(new Set([preferredModel, ...modelList()]));
    let lastError: unknown;
    for (const model of models) {
      // Sem capacidade: passa direto para o proximo modelo. Falha de rede: uma nova tentativa.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return toReply(model, await this.generate(model, request));
        } catch (error) {
          lastError = error;
          this.onError(error, `${model}#${attempt + 1}`);
          markOverloaded(model, error);
          if (!isRetryableGeminiError(error)) throw error;
          if (!isTransientGeminiError(error) || isOverloadedGeminiError(error)) break;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }
    throw lastError;
  }
}

/** Token efemero da API Live do Gemini: o navegador fala direto com o modelo de voz. */
export const geminiLiveSessionIssuer: AiLiveSessionIssuer = {
  async issue({ systemInstruction, tools }) {
    const model = process.env.GEMINI_LIVE_MODEL || FROTAK_AI_LIVE_MODEL;
    const setupConfig = {
      generationConfig: {
        responseModalities: [Modality.AUDIO],
        temperature: 0.1,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: process.env.GEMINI_LIVE_VOICE || "Aoede",
            },
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
          prefixPaddingMs: 300,
          silenceDurationMs: 800,
        },
      },
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: {},
      tools: [{ functionDeclarations: toFunctionDeclarations(tools) }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
    };
    const ai = new GoogleGenAI({
      apiKey: geminiApiKey(),
      httpOptions: { apiVersion: "v1beta" },
    });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        liveConnectConstraints: { model, config: setupConfig },
      },
    });
    if (!token.name) throw new Error("Token efemero vazio");
    return { token: token.name, model, setupConfig };
  },
};
