import assert from "node:assert/strict";
import test from "node:test";
import { sendFrotakAiChat } from "@/modules/frotak-ai/application/frotakAiConversation";
import { dispatchIdlePush } from "@/modules/frotak-ai/application/frotakAiIdlePush";
import type {
  AiGenerateRequest,
  AiModel,
  AiModelReply,
  FrotakAiToolRunner,
  PushSubscription,
  PushSubscriptionStore,
} from "@/modules/frotak-ai/application/ports";
import type { FrotakAiContext } from "@/modules/frotak-ai/domain/frotakAiContext";
import { publicFrotakAiError } from "@/modules/frotak-ai/domain/frotakAiPrompt";

const context = {
  accessToken: "t",
  userId: "u1",
  membershipId: "m1",
  workspaceId: "w1",
  tenantId: "t1",
  workspaceName: "Principal",
  tenantName: "Empresa",
  isOwner: true,
  permissions: [],
} satisfies FrotakAiContext;

const reply = (
  text: string,
  toolCalls: AiModelReply["toolCalls"] = [],
  raw: unknown = { role: "model" },
): AiModelReply => ({ model: "fake-1", toolCalls, raw, text: () => text });

function fakeModel(replies: AiModelReply[]) {
  const requests: AiGenerateRequest[] = [];
  const preferred: string[] = [];
  const model: AiModel = {
    start: async (request) => {
      requests.push(structuredClone({ ...request, tools: [] }));
      return replies.shift() as AiModelReply;
    },
    continue: async (preferredModel, request) => {
      preferred.push(preferredModel);
      requests.push(structuredClone({ ...request, tools: [] }));
      return replies.shift() as AiModelReply;
    },
  };
  return { model, requests, preferred };
}

function fakeTools(results: Record<string, unknown>) {
  const executed: string[] = [];
  const tools: FrotakAiToolRunner = {
    execute: async (_context, name) => {
      executed.push(name);
      return results[name] ?? { ok: true };
    },
    tenantSnapshot: async () => "retrato-do-tenant",
  };
  return { tools, executed };
}

test("a greeting is answered by the server without calling the model", async () => {
  const { model, requests } = fakeModel([]);
  const result = await sendFrotakAiChat(
    { model, tools: fakeTools({}).tools },
    { context, message: "ola", history: [] },
  );
  assert.equal(result.model, "frotak-server");
  assert.equal(requests.length, 0);
});

test("the system instruction carries the tenant context and snapshot", async () => {
  const { model, requests } = fakeModel([reply("Tudo certo.")]);
  await sendFrotakAiChat(
    { model, tools: fakeTools({}).tools },
    { context, message: "como vai a frota?", history: [] },
  );
  assert.ok(requests[0].systemInstruction.includes("Empresa"));
  assert.ok(requests[0].systemInstruction.includes("retrato-do-tenant"));
  assert.equal(requests[0].temperature, 0.2);
  assert.equal(requests[0].toolMode, "auto");
});

test("tool results go back to the model, without the confirmation token", async () => {
  const { model, requests, preferred } = fakeModel([
    reply("", [{ id: "c1", name: "alertas", args: {} }]),
    reply("*Resposta* final"),
  ]);
  const { tools, executed } = fakeTools({
    alertas: { ok: true, data: { confirmacao: { token: "segredo", resumo: "Registrar" }, id: 1 } },
  });
  const result = await sendFrotakAiChat(
    { model, tools },
    { context, message: "o que precisa de atencao?", history: [] },
  );
  assert.deepEqual(executed, ["alertas"]);
  assert.deepEqual(preferred, ["fake-1"]);
  assert.equal(result.text, "Resposta final");
  assert.deepEqual(result.tools, ["alertas"]);
  const second = requests[1];
  assert.equal(second.temperature, 0.1);
  const results = second.turns.find((turn) => turn.kind === "toolResults");
  assert.ok(results && results.kind === "toolResults");
  assert.equal(results.results[0].call.name, "alertas");
  assert.deepEqual(results.results[0].output, { ok: true, data: { id: 1 } });
  assert.equal(JSON.stringify(second).includes("segredo"), false);
  assert.deepEqual(result.pendingActions, [{ token: "segredo", resumo: "Registrar" }]);
});

test("unknown tools are ignored and end the conversation with the model text", async () => {
  const { model } = fakeModel([reply("Sem ferramenta.", [{ name: "apagar_tudo" }])]);
  const { tools, executed } = fakeTools({});
  const result = await sendFrotakAiChat(
    { model, tools },
    { context, message: "faca algo", history: [] },
  );
  assert.deepEqual(executed, []);
  assert.equal(result.text, "Sem ferramenta.");
});

test("a server-ready answer is returned as is, without going through the model", async () => {
  const { model, requests } = fakeModel([reply("", [{ name: "alertas", args: {} }])]);
  const { tools } = fakeTools({ alertas: { deterministicAnswer: "3 veiculos parados." } });
  const result = await sendFrotakAiChat(
    { model, tools },
    { context, message: "alertas", history: [] },
  );
  assert.equal(result.text, "3 veiculos parados.");
  assert.equal(result.model, "frotak-server");
  assert.equal(requests.length, 1);
});

test("the last round forces a text answer, so the tool loop always ends", async () => {
  const call = [{ name: "alertas", args: {} }];
  const { model, requests } = fakeModel([
    reply("", call),
    reply("", call),
    reply("", call),
    reply("Fim."),
  ]);
  const result = await sendFrotakAiChat(
    { model, tools: fakeTools({}).tools },
    { context, message: "alertas", history: [] },
  );
  assert.equal(requests.length, 4);
  assert.equal(requests.at(-1)?.toolMode, "none");
  assert.equal(requests.at(-2)?.toolMode, "auto");
  assert.equal(result.text, "Fim.");
});

test("internal errors become safe messages", () => {
  assert.match(publicFrotakAiError(new Error("MODULE_DISABLED:frotak_ai")), /nao esta liberada/);
  assert.match(publicFrotakAiError(new Error("GEMINI_API_KEY nao configurada")), /Chave da IA/);
  assert.match(publicFrotakAiError(new Error("x")), /Nao foi possivel/);
});

function pushSetup(options: { moduleOn?: boolean; sendResult?: { ok: boolean; gone: boolean } }) {
  const log: string[] = [];
  const subscription: PushSubscription = {
    id: "s1",
    tenantId: "t1",
    workspaceId: "w1",
    userId: "u1",
    endpoint: "https://push",
    p256dh: "k",
    auth: "a",
  };
  const store: PushSubscriptionStore = {
    listAll: async () => [subscription, { ...subscription, id: "s2", userId: "ex-membro" }],
    listActiveMembers: async () => new Set(["u1"]),
    remove: async (id) => {
      log.push(`remove:${id}`);
    },
    markSent: async (id) => {
      log.push(`sent:${id}`);
    },
    markFailed: async (id) => {
      log.push(`failed:${id}`);
    },
  };
  return {
    log,
    deps: {
      store,
      sender: {
        send: async (target: PushSubscription) => {
          log.push(`push:${target.id}`);
          return options.sendResult ?? { ok: true, gone: false };
        },
      },
      idleFleet: {
        listIdle: async () => ({
          quantidade: 1,
          horas_minimas: 24,
          veiculos: [{ placa: "AAA1A11", dias_parado: 2, precisa_motivo: true, motivo: "" }],
        }),
      },
      module: { isEnabled: async () => options.moduleOn ?? true },
    },
  };
}

test("idle push reaches only active members of tenants with the module", async () => {
  const { deps, log } = pushSetup({});
  const stats = await dispatchIdlePush(deps);
  assert.deepEqual(log, ["push:s1", "sent:s1"]);
  assert.equal(stats.enviados, 1);

  const off = pushSetup({ moduleOn: false });
  const offStats = await dispatchIdlePush(off.deps);
  assert.deepEqual(off.log, []);
  assert.equal(offStats.semModulo, 2);
});

test("an expired subscription is removed", async () => {
  const { deps, log } = pushSetup({ sendResult: { ok: false, gone: true } });
  const stats = await dispatchIdlePush(deps);
  assert.deepEqual(log, ["push:s1", "remove:s1"]);
  assert.equal(stats.removidos, 1);
});
