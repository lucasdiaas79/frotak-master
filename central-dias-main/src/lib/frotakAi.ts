import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI, Modality } from "@google/genai";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.1-flash-lite";
export const FROTAK_AI_VOICE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

type FrotakAiMessage = {
  role: "assistant" | "user";
  text: string;
};

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada");
  return key;
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("API key")) return "Chave Gemini invalida ou nao autorizada.";
  if (message.includes("not found")) return "Modelo Gemini nao encontrado ou indisponivel.";
  return "Nao foi possivel concluir a conversa com a Frotak IA.";
}

function historyToContents(messages: FrotakAiMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.text }],
  }));
}

export const sendFrotakAiChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { message: string; history: FrotakAiMessage[] }) => input)
  .handler(async ({ data }) => {
    try {
      const message = data.message.trim();
      if (!message) throw new Error("Mensagem vazia");

      const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL,
        contents: [
          ...historyToContents(data.history ?? []),
          { role: "user", parts: [{ text: message }] },
        ],
        config: {
          systemInstruction:
            "Voce e a Frotak IA, assistente operacional da plataforma Frotak. Responda em portugues do Brasil, com objetividade, clareza e foco em gestao de frota, fretes, motoristas, despesas e operacao logistica. Quando nao tiver dados reais conectados, diga isso de forma transparente.",
          temperature: 0.3,
        },
      });

      const text = response.text?.trim();
      if (!text) throw new Error("Resposta vazia do Gemini");
      return { text, model: process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL };
    } catch (error) {
      console.error("[frotakAi] chat failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });

export const createFrotakAiVoiceToken = createServerFn({ method: "POST" })
  .inputValidator((input: { requestedAt?: string } | undefined) => input ?? {})
  .handler(async () => {
    try {
      const model = process.env.GEMINI_VOICE_MODEL || FROTAK_AI_VOICE_MODEL;
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey(),
        httpOptions: { apiVersion: "v1alpha" },
      });
      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          liveConnectConstraints: {
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction:
                "Voce e a Frotak IA em chamada de voz. Responda em portugues do Brasil, de forma curta, operacional e natural para uma central de frotas.",
            },
          },
          lockAdditionalFields: ["model", "responseModalities", "systemInstruction"],
        },
      });

      if (!token.name) throw new Error("Token efemero vazio");
      return { token: token.name, model };
    } catch (error) {
      console.error("[frotakAi] voice token failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });
