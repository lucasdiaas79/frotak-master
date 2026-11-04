import { createServerFn } from "@tanstack/react-start";
import {
  sendFrotakAiChat,
  startFrotakAiLiveSession,
  type FrotakAiMessage,
} from "@/modules/frotak-ai/application/frotakAiConversation";
import { publicFrotakAiError } from "@/modules/frotak-ai/domain/frotakAiPrompt";
import { isFrotakAiToolName } from "@/modules/frotak-ai/domain/frotakAiToolDeclarations";
import { executeFrotakAiAction } from "@/modules/frotak-ai/infrastructure/frotakAiActions";
import { resolveFrotakAiContext } from "@/modules/frotak-ai/infrastructure/frotakAiContext";
import { supabaseFrotakAiToolRunner } from "@/modules/frotak-ai/infrastructure/frotakAiTools";
import {
  GeminiAiModel,
  geminiLiveSessionIssuer,
} from "@/modules/frotak-ai/infrastructure/geminiAiModel";

// Server functions da Frotak IA: resolvem quem esta chamando, montam o caso de uso com os
// adaptadores e devolvem so mensagens seguras. Toda chamada passa por resolveFrotakAiContext,
// que confere sessao, empresa e se o modulo esta liberado.

type SerializableValue =
  null | boolean | number | string | SerializableValue[] | { [key: string]: SerializableValue };

function toSerializableValue(value: unknown): SerializableValue {
  return JSON.parse(JSON.stringify(value ?? null)) as SerializableValue;
}

function errorInfo(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message) as { error?: { code?: number | string; message?: string } };
    if (parsed.error?.message) {
      return {
        code: parsed.error.code === undefined ? undefined : String(parsed.error.code),
        message: parsed.error.message,
      };
    }
  } catch {
    // Providers can return plain text errors.
  }
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message,
  };
}

function logFrotakAiStage(
  stage: "context" | "tool" | "gemini",
  error: unknown,
  meta: { workspaceId?: string; tenantId?: string; tool?: string } = {},
) {
  const info = errorInfo(error);
  console.error(`[frotakAi] ${stage} failed`, {
    stage,
    workspaceId: meta.workspaceId,
    tenantId: meta.tenantId,
    tool: meta.tool,
    code: info.code,
    message: info.message,
  });
}

function textModel() {
  return new GeminiAiModel((error, tool) => logFrotakAiStage("gemini", error, { tool }));
}

export const createFrotakLiveToken = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken?: string; workspaceId?: string } | undefined) => ({
    accessToken: input?.accessToken ?? "",
    workspaceId: input?.workspaceId ?? "",
  }))
  .handler(async ({ data }) => {
    let context: Awaited<ReturnType<typeof resolveFrotakAiContext>> | null = null;
    try {
      context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      const session = await startFrotakAiLiveSession(
        { live: geminiLiveSessionIssuer, tools: supabaseFrotakAiToolRunner },
        context,
      );
      return {
        token: session.token,
        model: session.model,
        setupConfig: toSerializableValue(session.setupConfig) as {
          [key: string]: SerializableValue;
        },
      };
    } catch (error) {
      logFrotakAiStage(context ? "gemini" : "context", error, {
        workspaceId: data.workspaceId,
        tenantId: context?.tenantId,
      });
      throw new Error(publicFrotakAiError(error));
    }
  });

export const executeFrotakAiToolCall = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input:
        | {
            accessToken?: string;
            workspaceId?: string;
            name?: string;
            args?: Record<string, unknown>;
          }
        | undefined,
    ) => ({
      accessToken: input?.accessToken ?? "",
      workspaceId: input?.workspaceId ?? "",
      name: input?.name ?? "",
      args: input?.args ?? {},
    }),
  )
  .handler(async ({ data }) => {
    let context: Awaited<ReturnType<typeof resolveFrotakAiContext>> | null = null;
    try {
      context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      if (!isFrotakAiToolName(data.name)) throw new Error("Ferramenta indisponivel.");
      return toSerializableValue(
        await supabaseFrotakAiToolRunner.execute(context, data.name, data.args),
      );
    } catch (error) {
      logFrotakAiStage(context ? "tool" : "context", error, {
        workspaceId: data.workspaceId,
        tenantId: context?.tenantId,
        tool: data.name,
      });
      return { error: publicFrotakAiError(error) };
    }
  });

export const sendFrotakAiChatMessage = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input:
        | {
            accessToken?: string;
            workspaceId?: string;
            message: string;
            history?: FrotakAiMessage[];
          }
        | undefined,
    ) => ({
      accessToken: input?.accessToken ?? "",
      workspaceId: input?.workspaceId ?? "",
      message: input?.message ?? "",
      history: input?.history ?? [],
    }),
  )
  .handler(async ({ data }) => {
    let context: Awaited<ReturnType<typeof resolveFrotakAiContext>> | null = null;
    try {
      const message = data.message.trim();
      if (!message) throw new Error("Mensagem vazia");
      context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      const result = await sendFrotakAiChat(
        { model: textModel(), tools: supabaseFrotakAiToolRunner },
        { context, message, history: data.history },
      );
      if (result.model !== "frotak-server") {
        console.info("[frotakAi] chat", {
          tenantId: context.tenantId,
          model: result.model,
          tools: result.tools,
        });
      }
      return result;
    } catch (error) {
      logFrotakAiStage(context ? "gemini" : "context", error, {
        workspaceId: data.workspaceId,
        tenantId: context?.tenantId,
      });
      throw new Error(publicFrotakAiError(error));
    }
  });

export const confirmFrotakAiAction = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { accessToken?: string; workspaceId?: string; token?: string } | undefined) => ({
      accessToken: input?.accessToken ?? "",
      workspaceId: input?.workspaceId ?? "",
      token: input?.token ?? "",
    }),
  )
  .handler(async ({ data }) => {
    let context: Awaited<ReturnType<typeof resolveFrotakAiContext>> | null = null;
    try {
      context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      const result = await executeFrotakAiAction(context, data.token);
      console.info("[frotakAi] action", { tenantId: context.tenantId, ok: result.ok });
      return result;
    } catch (error) {
      logFrotakAiStage(context ? "tool" : "context", error, {
        workspaceId: data.workspaceId,
        tenantId: context?.tenantId,
        tool: "confirmar_acao",
      });
      return { ok: false, error: publicFrotakAiError(error) };
    }
  });
