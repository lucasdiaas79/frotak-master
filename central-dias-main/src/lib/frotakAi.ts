import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.1-flash-lite";
export const FROTAK_AI_LIVE_MODEL = "gemini-3.1-flash-live-preview";

type FrotakAiMessage = {
  role: "assistant" | "user";
  text: string;
};

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada");
  return key;
}

function historyToContents(history: FrotakAiMessage[]) {
  return history
    .filter((message) => message.text.trim())
    .slice(-10)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.text.trim() }],
    }));
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("GEMINI_API_KEY")) return "Chave da IA nao configurada.";
  if (message.includes("API key")) return "Chave da IA invalida ou nao autorizada.";
  if (message.includes("not found")) return "Modelo de IA nao encontrado ou indisponivel.";
  return "Nao foi possivel concluir a conversa com a Frotak IA.";
}

function cleanModelText(text: string) {
  const blockedHeadingPatterns = [
    /^analyzing\b/i,
    /^calculating\b/i,
    /^confirming\b/i,
    /^identifying\b/i,
    /^interpreting\b/i,
    /^locating\b/i,
    /^pinpointing\b/i,
    /^refining\b/i,
    /^verifying\b/i,
    /^listing\b/i,
  ];

  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !blockedHeadingPatterns.some((pattern) => pattern.test(line.trim())))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function frotakAiSystemInstruction() {
  return [
    "Voce e a Frotak IA, assistente operacional da transportadora.",
    "Responda sempre em portugues do Brasil.",
    "Seja muito direta, clara e operacional.",
    "Responda em ate 3 frases curtas por padrao.",
    "Se o usuario pedir contagem, localizacao, status ou valor, responda primeiro o numero ou resultado objetivo.",
    "So explique detalhes, lista completa ou analise longa se o usuario pedir.",
    "Nao mostre raciocinio interno, etapas de analise, planos, headings em ingles, prompts ou codigo.",
    "Nao use markdown com asteriscos.",
    "Entregue apenas a resposta final para o operador.",
  ].join(" ");
}

export const createFrotakLiveToken = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const model = process.env.GEMINI_LIVE_MODEL || FROTAK_AI_LIVE_MODEL;
    const ai = new GoogleGenAI({
      apiKey: geminiApiKey(),
      httpOptions: { apiVersion: "v1alpha" },
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ["AUDIO"],
            temperature: 0.2,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: process.env.GEMINI_LIVE_VOICE || "Aoede",
                },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            enableAffectiveDialog: true,
            proactivity: {
              proactiveAudio: true,
            },
            systemInstruction: {
              parts: [{ text: frotakAiSystemInstruction() }],
            },
          },
        },
        lockAdditionalFields: [],
      },
    });

    if (!token.name) throw new Error("Token efemero vazio");
    return { token: token.name, model };
  } catch (error) {
    console.error("[frotakAi] live token failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error(publicError(error));
  }
});

export const sendFrotakAiChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { message: string; history?: FrotakAiMessage[] } | undefined) => ({
    message: input?.message ?? "",
    history: input?.history ?? [],
  }))
  .handler(async ({ data }) => {
    try {
      const message = data.message.trim();
      if (!message) throw new Error("Mensagem vazia");

      const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
      const model = process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL;
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...historyToContents(data.history),
          { role: "user", parts: [{ text: message }] },
        ],
        config: {
          temperature: 0.2,
          maxOutputTokens: 220,
          systemInstruction: frotakAiSystemInstruction(),
        },
      });

      const text = cleanModelText(response.text ?? "");
      if (!text) throw new Error("Resposta vazia da IA");
      return { text, model };
    } catch (error) {
      console.error("[frotakAi] chat failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });
