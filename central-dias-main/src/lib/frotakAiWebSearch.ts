import { GoogleGenAI } from "@google/genai";

// Pesquisa na web pela busca do Google (grounding do Gemini). Roda como ferramenta propria, numa
// chamada separada, para funcionar igual no texto e na voz sem misturar com as ferramentas do tenant.

const SEARCH_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash"];

type Source = { titulo: string; url: string };

export async function searchFrotakAiWeb(args: Record<string, unknown>) {
  const question = typeof args.pergunta === "string" ? args.pergunta.trim().slice(0, 400) : "";
  if (!question) return { error: "Informe o que pesquisar.", code: "INVALID_FILTER" };
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return { error: "Busca na web indisponivel.", code: "SEARCH_UNAVAILABLE" };

  const ai = new GoogleGenAI({ apiKey });
  const models = Array.from(
    new Set(
      [process.env.GEMINI_TEXT_MODEL, ...SEARCH_MODELS].filter((item): item is string =>
        Boolean(item),
      ),
    ),
  );
  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: question,
        config: {
          temperature: 0.2,
          maxOutputTokens: 900,
          tools: [{ googleSearch: {} }],
          systemInstruction:
            "Pesquise na web e responda em portugues do Brasil com informacoes atuais e objetivas: valores, faixas de preco, datas e de onde vem cada dado. Prefira fontes do Brasil quando o assunto for o mercado brasileiro. Em ate 6 frases.",
        },
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const fontes: Source[] = [];
      chunks.forEach((chunk) => {
        const url = chunk.web?.uri;
        if (url && !fontes.some((item) => item.url === url) && fontes.length < 5) {
          fontes.push({ titulo: chunk.web?.title ?? url, url });
        }
      });
      const resposta = (response.text ?? "").trim();
      if (!resposta) throw new Error("Busca sem resposta");
      return { pergunta: question, resposta, fontes, pesquisado_em: new Date().toISOString() };
    } catch (error) {
      lastError = error;
    }
  }
  return {
    error: lastError instanceof Error ? lastError.message : "Falha na busca na web.",
    code: "SEARCH_FAILED",
  };
}
