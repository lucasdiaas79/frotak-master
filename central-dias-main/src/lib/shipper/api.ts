import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import {
  FROTAK_AI_TEXT_FALLBACK_MODEL,
  FROTAK_AI_TEXT_MODEL,
} from "@/modules/frotak-ai/infrastructure/geminiAiModel";
import { resolveFrotakAiContext } from "@/modules/frotak-ai/infrastructure/frotakAiContext";
import { answerLocally, buildAiContext } from "./analytics";
import { demoPortalData } from "./demo";
import type {
  DriverDecision,
  NetworkDriver,
  ShipperCarrier,
  ShipperNetworkSettings,
  ShipperPortalData,
  ShipperThirdPartyData,
} from "./types";
import {
  addDriverNote,
  loadShipperThirdParties,
  rateDriverTrip,
  saveNetworkSettings,
  searchNetwork,
  setDriverDecision,
} from "../../../server/lib/shipper-network.ts";
import {
  ShipperError,
  acceptInviteByToken,
  inviteCarrier,
  inviteInfo,
  listTenantShipperLinks,
  loadShipperPortal,
  removeCarrier,
  renewCarrierInvite,
  resolveShipperSession,
  respondShipperLink,
  shipperDocumentUrl,
  signUpShipper,
  type TenantShipperLink,
} from "../../../server/lib/shipper-portal.ts";

// Funcoes de servidor do portal do embarcador e da tela "Embarcadores" da Frotak.
// Toda resposta segue { ok: true, ... } ou { ok: false, error } para a tela mostrar.

type Fail = { ok: false; error: string; code?: string };

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fail(error: unknown, scope: string): Fail {
  if (error instanceof ShipperError) return { ok: false, error: error.message, code: error.code };
  if (error instanceof Error && error.message === "multi_db") {
    return {
      ok: false,
      code: "multi_db",
      error:
        "O portal do embarcador ainda não funciona no modo banco por cliente. Ele roda na produção atual (banco único).",
    };
  }
  console.error(`[shipper] ${scope} failed`, {
    message: error instanceof Error ? error.message : String(error),
  });
  return { ok: false, error: "Não foi possível concluir agora. Tente de novo em instantes." };
}

// ------------------------------------------------------------ Embarcador

export const shipperSignUp = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    companyName: clean(input?.companyName, 160),
    cnpj: clean(input?.cnpj, 30),
    fullName: clean(input?.fullName, 120),
    email: clean(input?.email, 200),
    password: typeof input?.password === "string" ? input.password.slice(0, 200) : "",
    phone: clean(input?.phone, 30),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      return await signUpShipper(data);
    } catch (error) {
      return fail(error, "signup");
    }
  });

export const shipperLoadPortal = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken?: string } | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
  }))
  .handler(async ({ data }): Promise<{ ok: true; data: ShipperPortalData } | Fail> => {
    try {
      assertSingleDatabase();
      const session = await resolveShipperSession(data.accessToken);
      return { ok: true, data: await loadShipperPortal(session) };
    } catch (error) {
      return fail(error, "load");
    }
  });

export const shipperInviteCarrier = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    name: clean(input?.name, 160),
    cnpj: clean(input?.cnpj, 30),
    contactName: clean(input?.contactName, 120),
    email: clean(input?.email, 200),
    phone: clean(input?.phone, 30),
    origin: clean(input?.origin, 200),
  }))
  .handler(async ({ data }): Promise<{ ok: true; carrier: ShipperCarrier } | Fail> => {
    try {
      const session = await resolveShipperSession(data.accessToken);
      return { ok: true, carrier: await inviteCarrier(session, data) };
    } catch (error) {
      return fail(error, "invite");
    }
  });

export const shipperRenewInvite = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    carrierId: clean(input?.carrierId, 64),
    origin: clean(input?.origin, 200),
  }))
  .handler(async ({ data }): Promise<{ ok: true; carrier: ShipperCarrier } | Fail> => {
    try {
      const session = await resolveShipperSession(data.accessToken);
      return { ok: true, carrier: await renewCarrierInvite(session, data.carrierId, data.origin) };
    } catch (error) {
      return fail(error, "renew");
    }
  });

export const shipperRemoveCarrier = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    carrierId: clean(input?.carrierId, 64),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const session = await resolveShipperSession(data.accessToken);
      return await removeCarrier(session, data.carrierId);
    } catch (error) {
      return fail(error, "remove");
    }
  });

export const shipperDocumentLink = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    documentId: clean(input?.documentId, 64),
  }))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | Fail> => {
    try {
      const session = await resolveShipperSession(data.accessToken);
      return { ok: true, url: await shipperDocumentUrl(session, data.documentId) };
    } catch (error) {
      return fail(error, "document");
    }
  });

// ------------------------------------------------------------ IA do embarcador

type ChatTurn = { role: "user" | "assistant"; text: string };

function systemPrompt(context: unknown) {
  return [
    "Você é a Frotak IA do embarcador: uma assistente de logística para quem contrata frete.",
    "Responda em português do Brasil, curto e direto, com frases completas. Use listas só quando ajudar.",
    "Use apenas os dados abaixo. Se a informação não estiver neles, diga que não tem esse dado.",
    "Nunca invente cargas, placas, horários ou números.",
    "Você não tem acesso a valores de frete nem custos da transportadora, e não deve especular sobre eles.",
    "Tempos de espera acima de 5 horas podem gerar estadia (Lei 11.442).",
    "O CO2 é calculado pelo diesel abastecido durante a viagem; trate como estimativa.",
    "",
    "DADOS DO EMBARCADOR (JSON):",
    JSON.stringify(context),
  ].join("\n");
}

async function askGemini(question: string, history: ChatTurn[], data: ShipperPortalData) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return undefined;
  const ai = new GoogleGenAI({ apiKey: key });
  const models = [
    process.env.GEMINI_TEXT_MODEL,
    FROTAK_AI_TEXT_MODEL,
    FROTAK_AI_TEXT_FALLBACK_MODEL,
  ].filter((item): item is string => Boolean(item && item.trim()));
  const contents = [
    ...history.slice(-10).map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.text.slice(0, 2000) }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];
  for (const model of [...new Set(models)]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0.2,
          maxOutputTokens: 900,
          systemInstruction: systemPrompt(buildAiContext(data)),
        },
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (error) {
      console.error("[shipper-ai] gemini failed", {
        model,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

export const shipperAskAi = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    demo: input?.demo === true,
    question: clean(input?.question, 1000),
    history: Array.isArray(input?.history)
      ? (input.history as unknown[])
          .slice(-10)
          .map((turn) => {
            const item = turn as Record<string, unknown>;
            return {
              role: item.role === "assistant" ? "assistant" : "user",
              text: clean(item.text, 2000),
            } as ChatTurn;
          })
          .filter((turn) => turn.text)
      : [],
  }))
  .handler(async ({ data }): Promise<{ ok: true; text: string; source: "ia" | "local" } | Fail> => {
    try {
      if (!data.question) return { ok: false, error: "Escreva uma pergunta." };
      const portal = data.demo
        ? demoPortalData()
        : await loadShipperPortal(await resolveShipperSession(data.accessToken));
      const text = await askGemini(data.question, data.history, portal);
      if (text) return { ok: true, text, source: "ia" };
      return { ok: true, text: answerLocally(data.question, portal), source: "local" };
    } catch (error) {
      return fail(error, "ai");
    }
  });

// ------------------------------------------------------------ Lado da transportadora (Frotak)

export const carrierListShippers = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
  }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; links: TenantShipperLink[]; isOwner: boolean } | Fail> => {
      try {
        const context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
        return {
          ok: true,
          links: await listTenantShipperLinks(context.tenantId),
          isOwner: context.isOwner,
        };
      } catch (error) {
        return fail(error, "carrier-list");
      }
    },
  );

export const carrierRespondShipper = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    linkId: clean(input?.linkId, 64),
    action: (["aceitar", "recusar", "pausar"].includes(String(input?.action))
      ? input?.action
      : "recusar") as "aceitar" | "recusar" | "pausar",
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      await respondShipperLink(context, data.linkId, data.action);
      return { ok: true };
    } catch (error) {
      return fail(error, "carrier-respond");
    }
  });

export const shipperInviteInfo = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    token: clean(input?.token, 100),
  }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; shipperName: string; carrierName: string; status: string } | Fail> => {
      try {
        const info = await inviteInfo(data.token);
        return {
          ok: true,
          shipperName: info.shipperName,
          carrierName: info.carrierName,
          status: info.status,
        };
      } catch (error) {
        return fail(error, "invite-info");
      }
    },
  );

export const carrierAcceptInvite = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    workspaceId: clean(input?.workspaceId, 64),
    token: clean(input?.token, 100),
  }))
  .handler(async ({ data }): Promise<{ ok: true; shipperName: string } | Fail> => {
    try {
      const context = await resolveFrotakAiContext(data.accessToken, data.workspaceId);
      return await acceptInviteByToken(context, data.token);
    } catch (error) {
      return fail(error, "carrier-accept");
    }
  });

// ------------------------------------------------------------ Terceiros e Rede Frotak

/** O portal cruza transportadoras: so existe no banco unico (sem o agente das VPS). */
function assertSingleDatabase() {
  if (process.env.FROTAK_AGENT_URL) throw new Error("multi_db");
}

async function sessionAndPortal(accessToken: string) {
  assertSingleDatabase();
  const session = await resolveShipperSession(accessToken);
  return { session, portal: await loadShipperPortal(session) };
}

export const shipperLoadThirdParties = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken?: string } | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
  }))
  .handler(async ({ data }): Promise<{ ok: true; data: ShipperThirdPartyData } | Fail> => {
    try {
      const { session, portal } = await sessionAndPortal(data.accessToken);
      return { ok: true, data: await loadShipperThirdParties(session, portal) };
    } catch (error) {
      return fail(error, "third-parties");
    }
  });

export const shipperSetDriverDecision = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    profileId: clean(input?.profileId, 64),
    status: (["aprovado", "em_revisao", "bloqueado", "limpar"].includes(String(input?.status))
      ? input?.status
      : "em_revisao") as DriverDecision | "limpar",
    reason: clean(input?.reason, 300),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const { session, portal } = await sessionAndPortal(data.accessToken);
      await setDriverDecision(session, portal, data);
      return { ok: true };
    } catch (error) {
      return fail(error, "decision");
    }
  });

export const shipperAddDriverNote = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    profileId: clean(input?.profileId, 64),
    body: clean(input?.body, 1000),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const { session, portal } = await sessionAndPortal(data.accessToken);
      await addDriverNote(session, portal, data);
      return { ok: true };
    } catch (error) {
      return fail(error, "note");
    }
  });

export const shipperRateTrip = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    freightId: clean(input?.freightId, 64),
    score: Number(input?.score),
    onTime: typeof input?.onTime === "boolean" ? input.onTime : undefined,
    comment: clean(input?.comment, 500),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      const { session, portal } = await sessionAndPortal(data.accessToken);
      await rateDriverTrip(session, portal, data);
      return { ok: true };
    } catch (error) {
      return fail(error, "rate");
    }
  });

export const shipperSearchNetwork = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    state: clean(input?.state, 2),
    city: clean(input?.city, 80),
    vehicle: clean(input?.vehicle, 60),
    docsOk: input?.docsOk === true,
    minScore: typeof input?.minScore === "number" ? input.minScore : undefined,
  }))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; drivers: NetworkDriver[]; total: number; locked: boolean } | Fail> => {
      try {
        assertSingleDatabase();
        const session = await resolveShipperSession(data.accessToken);
        return { ok: true, ...(await searchNetwork(session, data)) };
      } catch (error) {
        return fail(error, "network");
      }
    },
  );

export const shipperSaveNetworkSettings = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown> | undefined) => ({
    accessToken: clean(input?.accessToken, 5000),
    settings: {
      shareApproved:
        (input?.settings as ShipperNetworkSettings | undefined)?.shareApproved === true,
      shareRatings: (input?.settings as ShipperNetworkSettings | undefined)?.shareRatings !== false,
      shareBlocks: (input?.settings as ShipperNetworkSettings | undefined)?.shareBlocks === true,
    },
  }))
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    try {
      assertSingleDatabase();
      const session = await resolveShipperSession(data.accessToken);
      await saveNetworkSettings(session, data.settings);
      return { ok: true };
    } catch (error) {
      return fail(error, "network-settings");
    }
  });
