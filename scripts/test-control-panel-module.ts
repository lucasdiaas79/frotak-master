// Regras de saúde do painel, sem rede: node --experimental-strip-types --test scripts/test-control-panel-module.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectIssues,
  containerLevel,
  containerStateLabel,
  isProbeHealthy,
  serviceLevel,
  summarizeContainers,
  usageLevel,
  type Container,
  type HostResult,
  type HostSnapshot,
  type ServiceUnit,
} from "../src/modules/control-panel/domain/control-panel.ts";

function container(overrides: Partial<Container> = {}): Container {
  return {
    name: "frotak-rest",
    image: "postgrest",
    state: "running",
    health: "healthy",
    healthOutput: "",
    startedAt: "",
    exitCode: 0,
    oomKilled: false,
    restartCount: 0,
    restartPolicy: "unless-stopped",
    project: "frotak",
    service: "rest",
    ports: [],
    mounts: [],
    networks: [],
    group: "Compartilhado",
    clientSlug: null,
    managed: true,
    protected: false,
    restartable: true,
    maintenance: false,
    stats: null,
    ...overrides,
  };
}

function service(overrides: Partial<ServiceUnit> = {}): ServiceUnit {
  return {
    name: "caddy",
    description: "",
    active: "active",
    sub: "running",
    enabled: "enabled",
    pid: 1,
    memoryBytes: null,
    since: "",
    restarts: 0,
    result: "success",
    restartable: true,
    ...overrides,
  };
}

function host(overrides: Partial<HostSnapshot> = {}): HostResult {
  const snapshot = {
    role: "db",
    capturedAt: 0,
    services: [service()],
    containers: [container()],
    alerts: [],
    heal: {
      enabled: true,
      rules: [],
      actionsLast24h: 0,
      attention: [],
      lastCycleAt: 0,
      intervalSeconds: 30,
    },
    ...overrides,
  } as unknown as HostSnapshot;
  return { role: snapshot.role, reachable: true, snapshot };
}

test("uso vira nível pelos limites", () => {
  assert.equal(usageLevel(10), "ok");
  assert.equal(usageLevel(80), "warning");
  assert.equal(usageLevel(90), "critical");
  assert.equal(usageLevel(70, 60, 65), "critical");
});

test("estado do container", () => {
  assert.equal(containerLevel(container()), "ok");
  assert.equal(containerLevel(container({ health: null })), "ok");
  assert.equal(containerLevel(container({ health: "starting" })), "warning");
  assert.equal(containerLevel(container({ health: "unhealthy" })), "critical");
  assert.equal(containerLevel(container({ state: "exited", exitCode: 1 })), "critical");
  assert.equal(containerLevel(container({ state: "exited" })), "critical");
  assert.equal(containerLevel(container({ maintenance: true, state: "exited" })), "warning");
});

test("container que só roda uma vez e termina bem não é problema", () => {
  const oneShot = container({ state: "exited", exitCode: 0, restartPolicy: "no" });
  assert.equal(containerLevel(oneShot), "idle");
  assert.equal(containerStateLabel(oneShot), "Concluído");
});

test("estado do serviço", () => {
  assert.equal(serviceLevel(service()), "ok");
  assert.equal(serviceLevel(service({ active: "activating" })), "warning");
  assert.equal(serviceLevel(service({ active: "failed" })), "critical");
  assert.equal(serviceLevel(service({ active: "inactive" })), "critical");
  assert.equal(serviceLevel(service({ active: "inactive", enabled: "disabled" })), "idle");
});

test("resposta 4xx prova que o serviço está de pé; 5xx ou silêncio não", () => {
  assert.equal(isProbeHealthy({ status: 200, ms: 1 }), true);
  assert.equal(isProbeHealthy({ status: 401, ms: 1 }), true);
  assert.equal(isProbeHealthy({ status: 503, ms: 1 }), false);
  assert.equal(isProbeHealthy({ status: null, ms: 1 }), false);
});

test("tudo saudável não gera aviso", () => {
  assert.deepEqual(collectIssues([host()]), []);
});

test("VPS sem resposta é crítico e não some da lista", () => {
  const [issue] = collectIssues([{ role: "db", reachable: false, error: "x" }]);
  assert.equal(issue.level, "critical");
  assert.equal(issue.title, "VPS de banco sem resposta");
});

test("alerta da sentinela substitui o item do mesmo alvo, sem duplicar", () => {
  const issues = collectIssues([
    host({
      containers: [container({ health: "unhealthy" })],
      alerts: [
        {
          key: "container:frotak-rest",
          since: 1,
          level: "critical",
          title: "Container frotak-rest precisa de uma pessoa",
          detail: "",
        },
      ],
    }),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].title, "Container frotak-rest precisa de uma pessoa");
  assert.equal(issues[0].tab, "containers");
});

test("crítico vem primeiro e auto-heal pausado aparece", () => {
  const issues = collectIssues([
    host({
      heal: {
        enabled: false,
        rules: [],
        actionsLast24h: 0,
        attention: [],
        lastCycleAt: 0,
        intervalSeconds: 30,
      },
      services: [service({ active: "failed" })],
    }),
  ]);
  assert.equal(issues[0].level, "critical");
  assert.equal(issues[1].key, "heal:db");
  assert.equal(issues[1].tab, "autoheal");
});

test("alerta de backup leva para a aba de backups", () => {
  const issues = collectIssues([
    host({
      alerts: [{ key: "backup:age", since: 1, level: "critical", title: "Sem backup", detail: "" }],
    }),
  ]);
  assert.equal(issues[0].tab, "backups");
});

test("contagem de containers ignora os que só rodam uma vez", () => {
  const summary = summarizeContainers([
    host({
      containers: [
        container(),
        container({ name: "b", health: "unhealthy" }),
        container({ name: "c", state: "exited", exitCode: 0, restartPolicy: "no" }),
      ],
    }),
    { role: "service", reachable: false, error: "x" },
  ]);
  assert.deepEqual(summary, { total: 2, healthy: 1 });
});
