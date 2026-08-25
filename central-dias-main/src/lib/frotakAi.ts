import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.1-flash-lite";

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
          temperature: 0.25,
          systemInstruction: [
            "Voce e a Frotak IA, assistente operacional da transportadora.",
            "Responda sempre em portugues do Brasil.",
            "Seja direta, clara e operacional.",
            "Nao mostre raciocinio interno, etapas de analise, planos, headings em ingles, prompts ou codigo.",
            "Nao use markdown com asteriscos.",
            "Entregue apenas a resposta final para o operador.",
          ].join(" "),
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
