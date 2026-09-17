import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { getCurrentAccessToken } from "@/lib/auth";

export const FROTAK_AI_TEXT_MODEL = "gemini-3.1-flash-lite";
export const FROTAK_AI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

const AI_PERMISSION_CODE = "ai.assistant.use";
const AI_MODULE_CODE = "frotak_ai";
const MAX_MESSAGE_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 10;

type AiChannel = "chat" | "live_token";

type FrotakAiMessage = {
  role: "assistant" | "user";
  text: string;
};

type AiAccessContext = {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  tenantId: string;
  workspaceId: string;
  userId: string;
};

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) throw new Error(`FROTAK_AI_CONFIG:${name}`);
  return value;
}

function readRateLimit(name: string, fallback: number) {
  const raw = readEnv(name);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 1_000);
}

function getSupabaseAdmin() {
  return createClient(
    readEnv("SUPABASE_URL") || requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY nao configurada");
  process.env.GOOGLE_API_KEY = key;
  return key;
}

function normalizeMessage(value: string) {
  return value.trim().slice(0, MAX_MESSAGE_CHARS);
}

function historyToContents(history: FrotakAiMessage[]) {
  return history
    .filter((message) => message.text.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: normalizeMessage(message.text) }],
    }));
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("FROTAK_AI_")) return message.split(":", 1)[0];
  if (message.includes("GEMINI_API_KEY")) return "FROTAK_AI_PROVIDER_CONFIG";
  return "FROTAK_AI_PROVIDER_ERROR";
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("FROTAK_AI_AUTH_REQUIRED")) return "Sua sessao expirou. Entre novamente.";
  if (message.startsWith("FROTAK_AI_PROFILE_INACTIVE")) return "Seu usuario esta inativo.";
  if (message.startsWith("FROTAK_AI_WORKSPACE_REQUIRED")) return "Nenhum workspace ativo foi encontrado.";
  if (message.startsWith("FROTAK_AI_MODULE_DISABLED")) return "O modulo Frotak IA nao esta habilitado para este workspace.";
  if (message.startsWith("FROTAK_AI_PERMISSION_DENIED")) return "Seu usuario nao tem permissao para usar a Frotak IA.";
  if (message.startsWith("FROTAK_AI_RATE_LIMIT")) return "Muitas solicitacoes em pouco tempo. Tente novamente em instantes.";
  if (message.startsWith("FROTAK_AI_CONFIG")) return "A Frotak IA nao esta configurada corretamente no servidor.";
  if (message.includes("GEMINI_API_KEY")) return "Chave da IA nao configurada.";
  if (message.includes("API key")) return "Chave da IA invalida ou nao autorizada.";
  if (message.includes("not found")) return "Modelo de IA nao encontrado ou indisponivel.";
  return "Nao foi possivel concluir a conversa com a Frotak IA.";
}

async function assertAiAccess(accessToken: string): Promise<AiAccessContext> {
  if (!accessToken.trim()) throw new Error("FROTAK_AI_AUTH_REQUIRED");

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) throw new Error("FROTAK_AI_AUTH_REQUIRED");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.active) throw new Error("FROTAK_AI_PROFILE_INACTIVE");

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("id, workspace_id, status, workspaces!inner(id, tenant_id, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(20);
  if (membershipError) throw membershipError;

  const membership = (memberships ?? []).find((candidate) => {
    const workspace = firstRelation(candidate.workspaces as unknown as {
      id: string;
      tenant_id: string;
      status: string;
    });
    return workspace?.status === "active";
  });
  if (!membership) throw new Error("FROTAK_AI_WORKSPACE_REQUIRED");

  const workspace = firstRelation(membership.workspaces as unknown as {
    id: string;
    tenant_id: string;
    status: string;
  });
  if (!workspace) throw new Error("FROTAK_AI_WORKSPACE_REQUIRED");

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, status")
    .eq("id", workspace.tenant_id)
    .in("status", ["active", "trial"])
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) throw new Error("FROTAK_AI_WORKSPACE_REQUIRED");

  const { data: moduleRows, error: moduleError } = await supabase
    .from("workspace_modules")
    .select("enabled, starts_at, expires_at, modules!inner(code, active)")
    .eq("workspace_id", workspace.id)
    .eq("enabled", true);
  if (moduleError) throw moduleError;

  const now = Date.now();
  const moduleEnabled = (moduleRows ?? []).some((row) => {
    const module = firstRelation(row.modules as unknown as { code: string; active: boolean });
    const startsAt = new Date(row.starts_at).getTime();
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
    return (
      module?.code === AI_MODULE_CODE &&
      module.active === true &&
      startsAt <= now &&
      (expiresAt === null || expiresAt > now)
    );
  });
  if (!moduleEnabled) throw new Error("FROTAK_AI_MODULE_DISABLED");

  const { data: membershipRoles, error: membershipRolesError } = await supabase
    .from("membership_roles")
    .select("role_id")
    .eq("membership_id", membership.id)
    .eq("workspace_id", workspace.id);
  if (membershipRolesError) throw membershipRolesError;
  const roleIds = (membershipRoles ?? []).map((row) => row.role_id).filter(Boolean);
  if (!roleIds.length) throw new Error("FROTAK_AI_PERMISSION_DENIED");

  const { data: activeRoles, error: activeRolesError } = await supabase
    .from("workspace_roles")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("active", true)
    .in("id", roleIds);
  if (activeRolesError) throw activeRolesError;
  const activeRoleIds = (activeRoles ?? []).map((row) => row.id);
  if (!activeRoleIds.length) throw new Error("FROTAK_AI_PERMISSION_DENIED");

  const { data: rolePermissions, error: rolePermissionsError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", activeRoleIds);
  if (rolePermissionsError) throw rolePermissionsError;
  const permissionIds = (rolePermissions ?? []).map((row) => row.permission_id).filter(Boolean);
  if (!permissionIds.length) throw new Error("FROTAK_AI_PERMISSION_DENIED");

  const { data: permission, error: permissionError } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", AI_PERMISSION_CODE)
    .eq("active", true)
    .in("id", permissionIds)
    .maybeSingle();
  if (permissionError) throw permissionError;
  if (!permission) throw new Error("FROTAK_AI_PERMISSION_DENIED");

  return {
    supabase,
    tenantId: workspace.tenant_id,
    workspaceId: workspace.id,
    userId: user.id,
  };
}

async function startUsageEvent(
  access: AiAccessContext,
  channel: AiChannel,
  model: string,
): Promise<string> {
  const limit =
    channel === "chat"
      ? readRateLimit("FROTAK_AI_CHAT_RATE_LIMIT_PER_MINUTE", 30)
      : readRateLimit("FROTAK_AI_LIVE_RATE_LIMIT_PER_MINUTE", 6);

  const { data, error } = await access.supabase.rpc("start_ai_usage_event", {
    p_tenant_id: access.tenantId,
    p_workspace_id: access.workspaceId,
    p_user_id: access.userId,
    p_channel: channel,
    p_provider: "gemini",
    p_model: model,
    p_limit_per_minute: limit,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.event_id) throw new Error("FROTAK_AI_CONFIG:usage_event");
  if (!row.allowed) throw new Error("FROTAK_AI_RATE_LIMIT");
  return row.event_id as string;
}

async function finishUsageEvent(
  access: AiAccessContext,
  eventId: string,
  outcome: "succeeded" | "failed",
  error: unknown = null,
) {
  const { error: finishError } = await access.supabase.rpc("finish_ai_usage_event", {
    p_event_id: eventId,
    p_outcome: outcome,
    p_error_code: outcome === "failed" ? errorCode(error) : null,
    p_metadata: {},
  });
  if (finishError) {
    console.error("[frotakAi] usage audit finalization failed", {
      message: finishError.message,
      eventId,
    });
  }
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

const createFrotakLiveTokenServer = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string } | undefined) => ({
    accessToken: input?.accessToken ?? "",
  }))
  .handler(async ({ data }) => {
    const model = process.env.GEMINI_LIVE_MODEL || FROTAK_AI_LIVE_MODEL;
    let access: AiAccessContext | null = null;
    let usageEventId: string | null = null;

    try {
      access = await assertAiAccess(data.accessToken);
      usageEventId = await startUsageEvent(access, "live_token", model);

      const ai = new GoogleGenAI({
        apiKey: geminiApiKey(),
        httpOptions: { apiVersion: "v1beta" },
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
              thinkingConfig: {
                thinkingLevel: "minimal",
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
      await finishUsageEvent(access, usageEventId, "succeeded");
      return { token: token.name, model };
    } catch (error) {
      if (access && usageEventId) await finishUsageEvent(access, usageEventId, "failed", error);
      console.error("[frotakAi] live token failed", {
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });

const sendFrotakAiChatMessageServer = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input:
        | { accessToken: string; message: string; history?: FrotakAiMessage[] }
        | undefined,
    ) => ({
      accessToken: input?.accessToken ?? "",
      message: normalizeMessage(input?.message ?? ""),
      history: (input?.history ?? []).slice(-MAX_HISTORY_MESSAGES).map((message) => ({
        role: message.role,
        text: normalizeMessage(message.text),
      })),
    }),
  )
  .handler(async ({ data }) => {
    const model = process.env.GEMINI_TEXT_MODEL || FROTAK_AI_TEXT_MODEL;
    let access: AiAccessContext | null = null;
    let usageEventId: string | null = null;

    try {
      const message = data.message.trim();
      if (!message) throw new Error("Mensagem vazia");

      access = await assertAiAccess(data.accessToken);
      usageEventId = await startUsageEvent(access, "chat", model);

      const ai = new GoogleGenAI({ apiKey: geminiApiKey() });
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
      await finishUsageEvent(access, usageEventId, "succeeded");
      return { text, model };
    } catch (error) {
      if (access && usageEventId) await finishUsageEvent(access, usageEventId, "failed", error);
      console.error("[frotakAi] chat failed", {
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error(publicError(error));
    }
  });

async function currentAccessTokenOrThrow() {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw new Error("Sua sessao expirou. Entre novamente.");
  return accessToken;
}

export async function createFrotakLiveToken() {
  const accessToken = await currentAccessTokenOrThrow();
  return createFrotakLiveTokenServer({ data: { accessToken } });
}

export async function sendFrotakAiChatMessage(input: {
  data: { message: string; history?: FrotakAiMessage[] };
}) {
  const accessToken = await currentAccessTokenOrThrow();
  return sendFrotakAiChatMessageServer({
    data: {
      accessToken,
      message: input.data.message,
      history: input.data.history,
    },
  });
}
