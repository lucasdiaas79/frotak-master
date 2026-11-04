import {
  EndSensitivity,
  FunctionCallingConfigMode,
  GoogleGenAI,
  Modality,
  StartSensitivity,
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
export const FROTAK_AI_LIVE_MODEL = "gemini-3.8-live";

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada");
  return key;
}

function modelList() {
  return Array.from(
    new Set(
      [process.env.GEMINI_TEXT_MODEL, FROTAK_AI_TEXT_MODEL, FROTAK_AI_TEXT_FALLBACK_MODEL].filter(
        (item): item is string => Boolean(item && item.trim()),
      ),
    ),
  );
}

function isRetryableGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|unavailable|overloaded|503|500|internal|high demand|deadline|timeout|fetch failed/i.test(
    message,
  );
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

function toGeminiRequest(request: AiGenerateRequest) {
  return {
    contents: toContents(request.turns),
    config: {
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
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

  async start(request: AiGenerateRequest) {
    let lastError: unknown;
    for (const model of modelList()) {
      try {
        const response = await this.ai.models.generateContent({
          ...toGeminiRequest(request),
          model,
        });
        return toReply(model, response);
      } catch (error) {
        lastError = error;
        this.onError(error, `${model}#select`);
        if (!isRetryableGeminiError(error)) break;
      }
    }
    throw lastError;
  }

  async continue(preferredModel: string, request: AiGenerateRequest) {
    const models = Array.from(new Set([preferredModel, ...modelList()]));
    let lastError: unknown;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await this.ai.models.generateContent({
            ...toGeminiRequest(request),
            model,
          });
          return toReply(model, response);
        } catch (error) {
          lastError = error;
          this.onError(error, `${model}#${attempt + 1}`);
          if (!isRetryableGeminiError(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
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
