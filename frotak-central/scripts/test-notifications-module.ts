// Regras de notificacao no Master sem banco nem rede: validacao, previa do texto e permissoes.
// npm run test:notifications
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlatformActor } from "../src/core/domain/platform-actor.ts";
import {
  deleteNotificationRule,
  saveNotificationRule,
  setNotificationRuleActive,
  type NotificationRuleDeps,
} from "../src/modules/notifications/application/notification-rules.ts";
import {
  fieldOf,
  notificationSources,
  opsFor,
  sourceOf,
} from "../src/modules/notifications/domain/catalog.ts";
import {
  emptyRuleDraft,
  renderPreview,
  rulesForTenant,
  validateRule,
  type NotificationRule,
  type NotificationRuleDraft,
} from "../src/modules/notifications/domain/rule.ts";

const admin: PlatformActor = { userId: "a", email: "admin@frotak", role: "super_admin" };
const operations: PlatformActor = { userId: "o", email: "ops@frotak", role: "operations" };
const support: PlatformActor = { userId: "s", email: "sup@frotak", role: "support" };
const TENANT = "11111111-1111-4111-8111-111111111111";

function draft(patch: Partial<NotificationRuleDraft> = {}): NotificationRuleDraft {
  return { ...emptyRuleDraft(), name: "Frete mudou de etapa", ...patch };
}

function rejects(input: NotificationRuleDraft, message: RegExp) {
  assert.throws(
    () => validateRule(input),
    (error: Error) => message.test(error.message),
  );
}

test("validacao: regra padrao do frete passa e sai normalizada", () => {
  const rule = validateRule(draft({ name: "  Frete mudou de etapa  ", description: "  " }));
  assert.equal(rule.name, "Frete mudou de etapa");
  assert.equal(rule.description, null);
  assert.deepEqual(rule.watchFields, ["etapa"]);
  assert.equal(rule.tenantId, null);
});

test("validacao: mensagens claras para o que falta ou nao existe", () => {
  rejects(draft({ name: "x" }), /nome/i);
  rejects(
    draft({ titleTemplate: "Frete {{placa}} em {{cidade}}" }),
    /\{\{cidade\}\} não existe em Fretes/,
  );
  rejects(draft({ triggerKind: "schedule", conditions: [] }), /ao menos uma condição/);
  rejects(draft({ conditions: [{ field: "valor", op: "gt", value: "muito" }] }), /número em Valor/);
  rejects(
    draft({ conditions: [{ field: "etapa", op: "eq", value: "VOANDO" }] }),
    /opção desconhecida/,
  );
  rejects(draft({ conditions: [{ field: "etapa", op: "in", value: [] }] }), /ao menos uma opção/);
  rejects(
    draft({ triggerKind: "insert", conditions: [{ field: "etapa", op: "changed" }] }),
    /só existe quando a regra observa alterações/,
  );
  rejects(draft({ linkPath: "https://golpe.example" }), /tela do sistema/);
  rejects(draft({ audienceRoles: ["CEO"] }), /Papel desconhecido/);
  rejects(
    draft({ source: "fleet_events" as never, triggerKind: "update" }),
    /quando a regra dispara/,
  );
});

test("validacao: tipos de valor viram o que o banco compara", () => {
  const rule = validateRule(
    draft({
      source: "driver_compliance_documents",
      triggerKind: "schedule",
      watchFields: ["etapa"],
      titleTemplate: "{{tipo}} de {{motorista}} vence em {{vencimento}}",
      bodyTemplate: "",
      conditions: [
        { field: "tipo", op: "in", value: ["cnh", "aso", "cnh"] },
        { field: "dias_para_vencer", op: "lte", value: "30" },
        { field: "vencimento", op: "within_days", value: "15" },
        { field: "bloqueante", op: "eq", value: true },
      ],
    }),
  );
  assert.deepEqual(rule.watchFields, [], "agendada nao observa mudancas");
  assert.deepEqual(rule.conditions, [
    { field: "tipo", op: "in", value: ["cnh", "aso"] },
    { field: "dias_para_vencer", op: "lte", value: 30 },
    { field: "vencimento", op: "within_days", value: 15 },
    { field: "bloqueante", op: "eq", value: "true" },
  ]);
});

test("catalogo: 'mudou' so aparece quando o gatilho observa alteracao", () => {
  const fretes = sourceOf("freights");
  assert.ok(fretes);
  const etapa = fieldOf(fretes, "etapa");
  assert.ok(etapa);
  assert.ok(opsFor(etapa, "update").includes("changed_to"));
  assert.ok(!opsFor(etapa, "insert").includes("changed_to"));
  assert.ok(!opsFor(etapa, "schedule").includes("changed"));
  for (const source of notificationSources) {
    for (const key of Object.keys(source.sample)) {
      assert.ok(fieldOf(source, key), `${source.key}: exemplo com campo desconhecido ${key}`);
    }
  }
});

test("previa: mesmo resultado que o banco monta (casos do teste SQL)", () => {
  const values = {
    placa: "ABC1D23",
    remetente: "Usina Norte",
    destinatario: "Porto Sul",
    motorista: "João Silva",
  };
  assert.equal(
    renderPreview("[[{{remetente}} → {{destinatario}}. ]][[Motorista {{motorista}}.]]", values),
    "Usina Norte → Porto Sul. Motorista João Silva.",
  );
  assert.equal(renderPreview("Novo frete[[ {{placa}}]]", values), "Novo frete ABC1D23");
  assert.equal(renderPreview("Novo frete[[ {{placa}}]]", { placa: "" }), "Novo frete");
  assert.equal(
    renderPreview("[[Motorista {{motorista}}.]] Frete   {{placa}}", { motorista: "", placa: "X" }),
    "Frete X",
  );
});

test("copia por cliente: gerais e as do proprio cliente", () => {
  const rules = [
    { id: "g", tenantId: null },
    { id: "a", tenantId: TENANT },
    { id: "b", tenantId: "outro" },
  ] as NotificationRule[];
  assert.deepEqual(
    rulesForTenant(rules, TENANT).map((rule) => rule.id),
    ["g", "a"],
  );
});

function fakeDeps(initial: NotificationRule[] = []) {
  const stored = new Map(initial.map((rule) => [rule.id, rule]));
  const distributed: number[] = [];
  let next = 1;
  const deps: NotificationRuleDeps = {
    rules: {
      list: async () => [...stored.values()],
      find: async (id) => stored.get(id) ?? null,
      save: async (input) => {
        const rule = {
          ...input,
          id: input.id ?? `r${next++}`,
          updatedAt: null,
        } as NotificationRule;
        stored.set(rule.id, rule);
        return rule;
      },
      setActive: async (id, active) => {
        const rule = { ...(stored.get(id) as NotificationRule), active };
        stored.set(id, rule);
        return rule;
      },
      remove: async (id) => {
        stored.delete(id);
      },
    },
    distributor: {
      distribute: async (rules) => {
        distributed.push(rules.length);
        return { clients: 2, failures: [] };
      },
    },
    tenants: { list: async () => [{ id: TENANT, name: "Transportes Teste" }] },
  };
  return { deps, stored, distributed };
}

test("permissao: regra para todos os clientes so com administrador", async () => {
  const { deps } = fakeDeps();
  await assert.rejects(saveNotificationRule(deps, operations, draft()), /administrador/);
  await assert.rejects(
    saveNotificationRule(deps, support, draft({ tenantId: TENANT })),
    /consulta/,
  );
  const own = await saveNotificationRule(deps, operations, draft({ tenantId: TENANT }));
  assert.equal(own.rule?.tenantId, TENANT);
  const global = await saveNotificationRule(deps, admin, draft());
  assert.equal(global.rule?.tenantId, null);
});

test("permissao: operacao nao mexe em regra geral, nem tirando o alcance de todos", async () => {
  const global = { ...validateRule(draft()), id: "g1", updatedAt: null } as NotificationRule;
  const { deps } = fakeDeps([global]);
  await assert.rejects(
    saveNotificationRule(deps, operations, { ...global, tenantId: TENANT }),
    /administrador/,
  );
  await assert.rejects(
    setNotificationRuleActive(deps, operations, { id: "g1", active: false }),
    /administrador/,
  );
  await assert.rejects(deleteNotificationRule(deps, operations, { id: "g1" }), /administrador/);
});

test("gravar distribui todas as regras; cliente desconhecido e recusado", async () => {
  const { deps, distributed } = fakeDeps();
  await saveNotificationRule(deps, admin, draft());
  await saveNotificationRule(deps, admin, draft({ tenantId: TENANT, name: "Outra regra" }));
  assert.deepEqual(distributed, [1, 2]);
  await assert.rejects(
    saveNotificationRule(deps, admin, draft({ tenantId: "22222222-2222-4222-8222-222222222222" })),
    /Cliente não encontrado/,
  );
  const removed = await deleteNotificationRule(deps, admin, { id: "r1" });
  assert.equal(removed.rule, null);
  assert.deepEqual(distributed, [1, 2, 1]);
});
