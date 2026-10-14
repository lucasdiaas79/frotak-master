import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionResponse,
} from "@google/genai";
import {
  FROTAK_AI_TOOL_DECLARATIONS,
  isFrotakAiToolName,
  normalizeFrotakAiToolCall,
  type FrotakAiToolCall,
  type FrotakAiToolName,
} from "@/lib/frotakAiTools";

export const FROTAK_AI_OPENAI_TEXT_MODEL = "gpt-6.1-sol";
export const FROTAK_AI_GEMINI_TEXT_MODEL = "gemini-3.8-flash";
export const FROTAK_AI_GEMINI_FALLBACK_MODEL = "gemini-3.6-flash";

type FrotakAiMessage = {
  role: "assistant" | "user";
  text: string;
};

type ProviderName = "openai" | "gemini";
type SerializableValue =
  | null
  | boolean
  | number
  | string
  | SerializableValue[]
  | { [key: string]: SerializableValue };

type ExecuteTool = (
  name: FrotakAiToolName,
  args: Record<string, unknown>,
) => Promise<unknown>;

type ToolResult = {
  call: FrotakAiToolCall;
  result: unknown;
};

type OpenAiResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type Selection =
  | {
      provider: "openai";
      model: string;
      calls: FrotakAiToolCall[];
      responseId: string;
    }
  | {
      provider: "gemini";
      model: string;
      calls: FrotakAiToolCall[];
      contents: Content[];
      modelContent: Content;
    };

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 6_000;
const MAX_TOOL_CALLS = 6;

function trimText(value: unknown, max = 2400) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function toSerializableValue(value: unknown): SerializableValue {
  return JSON.parse(JSON.stringify(value ?? null)) as SerializableValue;
}

function cleanModelText(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(
      (line) => !/^(analyzing|calculating|confirming|identifying|verifying)\b/i.test(line.trim()),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function historyWindow(history: FrotakAiMessage[]) {
  const selected: FrotakAiMessage[] = [];
  let totalChars = 0;
  for (const message of history
    .filter((item) => item.text.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .reverse()) {
    const text = trimText(message.text);
    if (!text || totalChars + text.length > MAX_HISTORY_CHARS) continue;
    totalChars += text.length;
    selected.unshift({ role: message.role, text });
  }
  return selected;
}

function historyToGeminiContents(history: FrotakAiMessage[]) {
  return historyWindow(history).map(
    (message) =>
      ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.text }],
      }) as Content,
  );
}

function historyToOpenAiInput(history: FrotakAiMessage[], message: string) {
  return [
    ...historyWindow(history).map((item) => ({
      role: item.role,
      content: item.text,
    })),
    { role: "user", content: message },
  ];
}

function providerOrder(): ProviderName[] {
  const configured = (process.env.FROTAK_AI_TEXT_PROVIDERS || "openai,gemini")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is ProviderName => item === "openai" || item === "gemini");
  return Array.from(new Set(configured.length ? configured : ["openai", "gemini"]));
}

function openAiApiKey() {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

function providerAvailable(provider: ProviderName) {
  return provider === "openai" ? Boolean(openAiApiKey()) : Boolean(geminiApiKey());
}

function openAiModel() {
  return process.env.OPENAI_TEXT_MODEL?.trim() || FROTAK_AI_OPENAI_TEXT_MODEL;
}

function openAiServiceTier() {
  return process.env.OPENAI_SERVICE_TIER?.trim() || "fast";
}

function openAiTimeoutMs() {
  const value = Number(process.env.OPENAI_TIMEOUT_MS ?? 5_000);
  return Number.isFinite(value) ? Math.max(2_000, Math.min(30_000, Math.trunc(value))) : 5_000;
}

function geminiModels() {
  return Array.from(
    new Set(
      [
        process.env.GEMINI_TEXT_MODEL,
        FROTAK_AI_GEMINI_TEXT_MODEL,
        FROTAK_AI_GEMINI_FALLBACK_MODEL,
      ].filter((item): item is string => Boolean(item && item.trim())),
    ),
  );
}

function schemaForOpenAi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaForOpenAi);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (key === "type" && typeof item === "string") {
      const normalized = item.toLowerCase().replace(/^type_/, "");
      result[key] = normalized === "unspecified" ? "string" : normalized;
    } else {
      result[key] = schemaForOpenAi(item);
    }
  }
  return result;
}

function openAiTools() {
  return FROTAK_AI_TOOL_DECLARATIONS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: schemaForOpenAi(tool.parameters),
  }));
}

async function openAiRequest(body: Record<string, unknown>): Promise<OpenAiResponse> {
  const apiKey = openAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada");

  const request = async (payload: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), openAiTimeoutMs());
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}: ${raw.slice(0, 1200)}`);
      }
      return JSON.parse(raw) as OpenAiResponse;
    } finally {
      clearTimeout(timeout);
    }
  };

  const tier = openAiServiceTier();
  try {
    return await request({ ...body, service_tier: tier });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (tier !== "auto" && /service.?tier|ultrafast|unsupported|invalid.*tier/i.test(message)) {
      return request(body);
    }
    throw error;
  }
}

function openAiText(response: OpenAiResponse) {
  if (response.output_text?.trim()) return response.output_text.trim();
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) parts.push(content.text.trim());
    }
  }
  return parts.join("\n").trim();
}

function parseOpenAiCalls(response: OpenAiResponse) {
  const calls: FrotakAiToolCall[] = [];
  for (const item of response.output ?? []) {
    if (
      item.type !== "function_call" ||
      !item.call_id ||
      !item.name ||
      !isFrotakAiToolName(item.name)
    ) {
      continue;
    }
    let args: Record<string, unknown> = {};
    if (item.arguments) {
      try {
        const parsed = JSON.parse(item.arguments);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        throw new Error(`OpenAI retornou argumentos invalidos para ${item.name}`);
      }
    }
    calls.push({ id: item.call_id, name: item.name, args });
  }
  return calls.slice(0, MAX_TOOL_CALLS);
}

async function selectWithOpenAi(
  history: FrotakAiMessage[],
  message: string,
  systemInstruction: string,
): Promise<Selection> {
  const model = openAiModel();
  const response = await openAiRequest({
    model,
    instructions: systemInstruction,
    input: historyToOpenAiInput(history, message),
    reasoning: { effort: "low" },
    tools: openAiTools(),
    tool_choice: "required",
    parallel_tool_calls: true,
    max_output_tokens: 800,
  });
  const calls = parseOpenAiCalls(response);
  if (!response.id || calls.length === 0) {
    throw new Error("OpenAI nao selecionou uma ferramenta Frotak valida");
  }
  return { provider: "openai", model, calls, responseId: response.id };
}

async function selectWithGemini(
  history: FrotakAiMessage[],
  message: string,
  systemInstruction: string,
): Promise<Selection> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const ai = new GoogleGenAI({ apiKey });
  const contents = [
    ...historyToGeminiContents(history),
    { role: "user", parts: [{ text: message }] },
  ] as Content[];
  let lastError: unknown;

  for (const model of geminiModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0,
          maxOutputTokens: 260,
          systemInstruction,
          tools: [{ functionDeclarations: [...FROTAK_AI_TOOL_DECLARATIONS] }],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
          },
        },
      });
      const modelContent = response.candidates?.[0]?.content;
      const calls = (response.functionCalls ?? [])
        .map(normalizeFrotakAiToolCall)
        .filter((call): call is FrotakAiToolCall => Boolean(call))
        .slice(0, MAX_TOOL_CALLS);
      if (!modelContent || calls.length === 0) {
        throw new Error("Gemini nao selecionou uma ferramenta Frotak valida");
      }
      return { provider: "gemini", model, calls, contents, modelContent };
    } catch (error) {
      lastError = error;
      const messageText = error instanceof Error ? error.message : String(error);
      if (!/not found|unavailable|overloaded|503|high demand|429|quota|rate.?limit/i.test(messageText)) {
        break;
      }
    }
  }
  throw lastError;
}

function toolResponsePart(call: FrotakAiToolCall, result: unknown): FunctionResponse {
  return {
    id: call.id,
    name: call.name,
    response: { output: toSerializableValue(result) as Record<string, unknown> },
  };
}

function functionResponseContent(results: ToolResult[]): Content {
  return {
    role: "user",
    parts: results.map(({ call, result }) => ({
      functionResponse: toolResponsePart(call, result),
    })),
  } as Content;
}

async function finalizeWithOpenAi(
  selection: Extract<Selection, { provider: "openai" }>,
  results: ToolResult[],
  systemInstruction: string,
) {
  const response = await openAiRequest({
    model: selection.model,
    instructions: systemInstruction,
    previous_response_id: selection.responseId,
    input: results.map(({ call, result }) => ({
      type: "function_call_output",
      call_id: call.id,
      output: JSON.stringify(toSerializableValue(result)),
    })),
    reasoning: { effort: "low" },
    tools: openAiTools(),
    tool_choice: "none",
    max_output_tokens: 700,
  });
  const text = cleanModelText(openAiText(response));
  if (!text) throw new Error("Resposta vazia da OpenAI");
  return { text, model: selection.model, provider: "openai" as const };
}

async function finalizeWithGemini(
  selection: Extract<Selection, { provider: "gemini" }>,
  results: ToolResult[],
  systemInstruction: string,
) {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: selection.model,
    contents: [...selection.contents, selection.modelContent, functionResponseContent(results)],
    config: {
      temperature: 0.1,
      maxOutputTokens: 500,
      systemInstruction,
    },
  });
  const text = cleanModelText(response.text ?? "");
  if (!text) throw new Error("Resposta vazia do Gemini");
  return { text, model: selection.model, provider: "gemini" as const };
}

function resultsPrompt(message: string, results: ToolResult[]) {
  return [
    `Pergunta do usuario: ${message}`,
    "Resultados exatos retornados pelo backend da Frotak:",
    JSON.stringify(
      results.map(({ call, result }) => ({
        ferramenta: call.name,
        resultado: toSerializableValue(result),
      })),
    ),
    "Responda somente com base nesses resultados. Nao recalcule nem invente valores.",
  ].join("\n");
}

async function draftWithGemini(
  history: FrotakAiMessage[],
  message: string,
  results: ToolResult[],
  systemInstruction: string,
) {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY nao configurada");
  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown;
  for (const model of geminiModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...historyToGeminiContents(history),
          { role: "user", parts: [{ text: resultsPrompt(message, results) }] },
        ],
        config: {
          temperature: 0.1,
          maxOutputTokens: 500,
          systemInstruction,
        },
      });
      const text = cleanModelText(response.text ?? "");
      if (!text) throw new Error("Resposta vazia do Gemini");
      return { text, model, provider: "gemini" as const };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function draftWithOpenAi(
  history: FrotakAiMessage[],
  message: string,
  results: ToolResult[],
  systemInstruction: string,
) {
  const model = openAiModel();
  const response = await openAiRequest({
    model,
    instructions: systemInstruction,
    input: [
      ...historyWindow(history).map((item) => ({ role: item.role, content: item.text })),
      { role: "user", content: resultsPrompt(message, results) },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: 500,
  });
  const text = cleanModelText(openAiText(response));
  if (!text) throw new Error("Resposta vazia da OpenAI");
  return { text, model, provider: "openai" as const };
}

function logProviderFailure(provider: ProviderName, stage: "select" | "finalize", error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[frotakAi] provider fallback", {
    provider,
    stage,
    message: message.slice(0, 500),
  });
}

export async function runFrotakAiTextChat(params: {
  history: FrotakAiMessage[];
  message: string;
  systemInstruction: string;
  executeTool: ExecuteTool;
}) {
  let selection: Selection | null = null;
  let lastError: unknown;

  for (const provider of providerOrder()) {
    if (!providerAvailable(provider)) continue;
    try {
      if (provider === "openai") {
        selection = await selectWithOpenAi(params.history, params.message, params.systemInstruction);
      } else {
        selection = await selectWithGemini(params.history, params.message, params.systemInstruction);
      }
      break;
    } catch (error) {
      lastError = error;
      logProviderFailure(provider, "select", error);
    }
  }

  if (!selection) throw lastError ?? new Error("Nenhum provedor de IA disponivel");

  const results = await Promise.all(
    selection.calls.map(async (call) => ({
      call,
      result: await params.executeTool(call.name, call.args ?? {}),
    })),
  );

  try {
    const final =
      selection.provider === "openai"
        ? await finalizeWithOpenAi(selection, results, params.systemInstruction)
        : await finalizeWithGemini(selection, results, params.systemInstruction);
    return {
      ...final,
      tools: selection.calls.map((call) => call.name),
    };
  } catch (error) {
    lastError = error;
    logProviderFailure(selection.provider, "finalize", error);
  }

  const fallbackOrder = providerOrder().filter(
    (provider) => provider !== selection?.provider && providerAvailable(provider),
  );
  for (const provider of fallbackOrder) {
    try {
      const final =
        provider === "openai"
          ? await draftWithOpenAi(params.history, params.message, results, params.systemInstruction)
          : await draftWithGemini(params.history, params.message, results, params.systemInstruction);
      return {
        ...final,
        tools: selection.calls.map((call) => call.name),
      };
    } catch (error) {
      lastError = error;
      logProviderFailure(provider, "finalize", error);
    }
  }

  throw lastError ?? new Error("Nenhum provedor conseguiu concluir a resposta");
}
