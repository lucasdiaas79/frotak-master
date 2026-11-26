// Notificacoes sem banco nem rede: preferencias, lista, links e envio ao Windows com portas falsas.
// npm run test:modules
import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchNotificationPush } from "../src/modules/notifications/application/dispatchNotificationPush.ts";
import type {
  NotificationPushPorts,
  PendingNotification,
  PushDevice,
} from "../src/modules/notifications/application/ports.ts";
import {
  effectivePreferences,
  MAX_PUSH_ATTEMPTS,
  mergeNotification,
  pushOutcome,
  pushPayloadOf,
  relativeTimeLabel,
  safeLinkPath,
  unreadCount,
  type AppNotification,
} from "../src/modules/notifications/domain/notification.ts";

function item(id: string, createdAt: string, readAt: string | null = null): AppNotification {
  return { id, ruleId: "r", title: id, body: "", linkPath: "/operacao", createdAt, readAt };
}

test("preferencias: sem escolha vale o padrao da regra; escolha do usuario manda", () => {
  const rows = effectivePreferences(
    [
      { id: "b", name: "Novo frete", description: null, pushDefault: true },
      { id: "a", name: "Frete mudou de etapa", description: null, pushDefault: false },
    ],
    [{ ruleId: "b", enabled: false, push: true }],
  );
  assert.deepEqual(
    rows.map((row) => [row.name, row.enabled, row.push, row.customized]),
    [
      ["Frete mudou de etapa", true, false, false],
      ["Novo frete", false, true, true],
    ],
  );
});

test("lista: aviso novo entra no topo, sem repetir, com limite", () => {
  const list = [item("b", "2026-11-26T10:00:00Z"), item("a", "2026-11-26T09:00:00Z")];
  const merged = mergeNotification(list, item("c", "2026-11-26T11:00:00Z"), 2);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["c", "b"],
  );
  assert.equal(mergeNotification(merged, item("c", "2026-11-26T11:00:00Z")).length, 2);
  assert.equal(
    unreadCount([item("x", "2026-11-26T11:00:00Z", "2026-11-26T11:01:00Z"), ...merged]),
    2,
  );
});

test("link do aviso: so caminho interno; o resto cai no historico", () => {
  assert.equal(safeLinkPath("/operacao"), "/operacao");
  assert.equal(safeLinkPath("https://golpe.example"), "/notificacoes");
  assert.equal(safeLinkPath("//golpe.example"), "/notificacoes");
  assert.equal(safeLinkPath('/x"><script>'), "/notificacoes");
  assert.equal(safeLinkPath(null), "/notificacoes");
  assert.equal(
    pushPayloadOf({ id: "n1", title: "T", body: "B", linkPath: "javascript:alert(1)" }).url,
    "/notificacoes",
  );
});

test("tempo: agora, minutos, horas, ontem e data", () => {
  const now = new Date(2026, 10, 26, 15, 0, 0);
  assert.equal(relativeTimeLabel(new Date(2026, 10, 26, 14, 59, 40).toISOString(), now), "agora");
  assert.equal(relativeTimeLabel(new Date(2026, 10, 26, 14, 50).toISOString(), now), "há 10 min");
  assert.equal(relativeTimeLabel(new Date(2026, 10, 26, 9, 0).toISOString(), now), "há 6 h");
  assert.match(relativeTimeLabel(new Date(2026, 10, 25, 9, 5).toISOString(), now), /^ontem 09:05$/);
  assert.match(
    relativeTimeLabel(new Date(2026, 10, 20, 8, 30).toISOString(), now),
    /^20\/11 08:30$/,
  );
});

test("resultado do envio: entregou, sem aparelho, tenta de novo e desiste no limite", () => {
  assert.equal(pushOutcome({ devices: 2, delivered: 1, attempts: 0 }), "sent");
  assert.equal(pushOutcome({ devices: 0, delivered: 0, attempts: 0 }), "skipped");
  assert.equal(pushOutcome({ devices: 1, delivered: 0, attempts: 0 }), "pending");
  assert.equal(
    pushOutcome({ devices: 1, delivered: 0, attempts: MAX_PUSH_ATTEMPTS - 1 }),
    "failed",
  );
});

function fakePorts(input: {
  pending: PendingNotification[];
  devices: PushDevice[];
  respond: (device: PushDevice) => { ok: boolean; gone: boolean } | Error;
}) {
  const sent: Array<{ device: string; notification: string }> = [];
  const removed: string[] = [];
  const marked: Array<{ id: string; status: string; attempts: number }> = [];
  const ports: NotificationPushPorts = {
    listPending: async () => input.pending,
    listDevices: async (userIds) =>
      input.devices.filter((device) => userIds.includes(device.userId)),
    send: async (device, payload) => {
      sent.push({ device: device.id, notification: payload.id });
      const result = input.respond(device);
      if (result instanceof Error) throw result;
      return result;
    },
    removeDevice: async (id) => {
      removed.push(id);
    },
    mark: async (results) => {
      marked.push(...results);
    },
  };
  return { ports, sent, removed, marked };
}

const pending = (id: string, userId: string, attempts = 0): PendingNotification => ({
  id,
  userId,
  title: `Frete ${id}`,
  body: "",
  linkPath: "/operacao",
  attempts,
});
const device = (id: string, userId: string): PushDevice => ({
  id,
  userId,
  endpoint: `https://push.example/${id}`,
  p256dh: "p",
  auth: "a",
});

test("envio: cada aviso vai a todos os aparelhos do destinatario", async () => {
  const fake = fakePorts({
    pending: [pending("n1", "u1"), pending("n2", "u2")],
    devices: [device("d1", "u1"), device("d2", "u1"), device("d3", "u3")],
    respond: () => ({ ok: true, gone: false }),
  });
  const stats = await dispatchNotificationPush(fake.ports);
  assert.deepEqual(fake.sent, [
    { device: "d1", notification: "n1" },
    { device: "d2", notification: "n1" },
  ]);
  assert.deepEqual(fake.marked, [
    { id: "n1", status: "sent", attempts: 1 },
    { id: "n2", status: "skipped", attempts: 0 },
  ]);
  assert.equal(stats.enviados, 1);
  assert.equal(stats.semAparelho, 1);
});

test("envio: aparelho descartado sai do cadastro e nao recebe o proximo aviso", async () => {
  const fake = fakePorts({
    pending: [pending("n1", "u1"), pending("n2", "u1")],
    devices: [device("velho", "u1"), device("novo", "u1")],
    respond: (target) =>
      target.id === "velho" ? { ok: false, gone: true } : { ok: true, gone: false },
  });
  await dispatchNotificationPush(fake.ports);
  assert.deepEqual(fake.removed, ["velho"]);
  assert.deepEqual(
    fake.sent.filter((row) => row.notification === "n2").map((row) => row.device),
    ["novo"],
  );
  assert.ok(fake.marked.every((row) => row.status === "sent"));
});

test("envio: aparelho fora do ar tenta de novo ate o limite e nao derruba os outros", async () => {
  const fake = fakePorts({
    pending: [pending("n1", "u1"), pending("n2", "u2", MAX_PUSH_ATTEMPTS - 1), pending("n3", "u3")],
    devices: [device("d1", "u1"), device("d2", "u2"), device("d3", "u3")],
    respond: (target) => (target.id === "d3" ? { ok: true, gone: false } : new Error("rede")),
  });
  const stats = await dispatchNotificationPush(fake.ports);
  assert.deepEqual(fake.marked, [
    { id: "n1", status: "pending", attempts: 1 },
    { id: "n2", status: "failed", attempts: MAX_PUSH_ATTEMPTS },
    { id: "n3", status: "sent", attempts: 1 },
  ]);
  assert.equal(stats.falhas, 2);
});

test("envio: nada pendente nao consulta aparelhos", async () => {
  let asked = false;
  const fake = fakePorts({ pending: [], devices: [], respond: () => ({ ok: true, gone: false }) });
  fake.ports.listDevices = async () => {
    asked = true;
    return [];
  };
  const stats = await dispatchNotificationPush(fake.ports);
  assert.equal(asked, false);
  assert.equal(stats.avisos, 0);
});
