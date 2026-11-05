// Administração do cliente, sem rede: node --experimental-strip-types --test scripts/test-client-admin-module.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dnsRecordsFor,
  normalizeDomain,
  splitDomain,
  toSubdomain,
  validateClientProfile,
  validateSubdomain,
  type ClientAddresses,
} from "../src/modules/tenants/domain/client-admin.ts";
import {
  changeSubdomain,
  resetClientLoginPassword,
  setClientStatus,
  updateClientProfile,
  type ClientAdminDeps,
} from "../src/modules/tenants/application/client-admin.ts";

const operator = { userId: "u1", email: "op@frotak.test", role: "operations" as const };
const reader = { userId: "u2", email: "leitura@frotak.test", role: "read_only" as const };

function addresses(subdomain: string): ClientAddresses {
  return {
    slug: "acme",
    subdomain,
    baseDomain: "frotak.app",
    primaryHost: `${subdomain}.frotak.app`,
    clientUrl: `https://${subdomain}.frotak.app`,
    domains: [],
    serviceIp: "203.0.113.10",
    apiUrl: "https://api.frotak.app/c/acme",
  };
}

function fakeDeps(options: { multi?: boolean; failCatalog?: boolean } = {}) {
  const calls: string[] = [];
  const deps: ClientAdminDeps = {
    catalog: {
      async locate(slug) {
        calls.push(`locate:${slug}`);
        return slug === "acme" ? { tenantId: "t1", slug, status: "active" } : null;
      },
      async updateProfile() {
        calls.push("catalog.profile");
        if (options.failCatalog) throw new Error("central fora");
      },
      async setStatus(_id, status) {
        calls.push(`catalog.status:${status}`);
      },
      async setAddresses(_id, value) {
        calls.push(`catalog.addresses:${value.subdomain}`);
      },
      async recordLoginReset(_actor, _id, email) {
        calls.push(`audit:${email}`);
      },
    },
    environment:
      options.multi === false
        ? null
        : {
            async settings() {
              return { baseDomain: "frotak.app", serviceIp: "203.0.113.10" };
            },
            async checkSubdomain(subdomain) {
              return {
                subdomain,
                host: "",
                baseDomain: "",
                serviceIp: "",
                available: true,
                reason: "",
              };
            },
            async resources() {
              throw new Error("nao usado");
            },
            async addresses() {
              return addresses("acme");
            },
            async setSubdomain(_slug, subdomain) {
              calls.push(`agent.subdomain:${subdomain}`);
              return addresses(subdomain);
            },
            async addDomain() {
              return addresses("acme");
            },
            async removeDomain() {
              return addresses("acme");
            },
            async updateProfile() {
              calls.push("agent.profile");
            },
            async setStatus(_slug, status) {
              calls.push(`agent.status:${status}`);
            },
            async resetLoginPassword() {
              calls.push("agent.password");
              return { email: "dono@acme.test", temporaryPassword: "Abc123" };
            },
          },
    probe: null,
  };
  return { deps, calls };
}

test("cadastro: normaliza CNPJ e nomes", () => {
  const profile = validateClientProfile({
    legalName: "  Acme Transportes LTDA ",
    tradeName: " Acme ",
    cnpj: "11.222.333/0001-81",
    maxVehicles: 20,
  });
  assert.deepEqual(profile, {
    legalName: "Acme Transportes LTDA",
    tradeName: "Acme",
    cnpj: "11222333000181",
    maxVehicles: 20,
  });
});

test("cadastro: recusa CNPJ curto, nome vazio e limite inválido", () => {
  const base = { legalName: "Acme", tradeName: "", cnpj: "11222333000181", maxVehicles: 1 };
  assert.throws(() => validateClientProfile({ ...base, cnpj: "123" }), /CNPJ/);
  assert.throws(() => validateClientProfile({ ...base, legalName: "  " }), /razão social/);
  assert.throws(() => validateClientProfile({ ...base, maxVehicles: 0 }), /Limite/);
  assert.throws(() => validateClientProfile({ ...base, maxVehicles: 1.5 }), /Limite/);
});

test("subdomínio: sugestão a partir do nome", () => {
  assert.equal(toSubdomain("Transportes São João Ltda."), "transportes-sao-joao-ltda");
  assert.equal(toSubdomain("  --Acme--  "), "acme");
  assert.equal(toSubdomain("x".repeat(60)).length, 40);
  assert.equal(toSubdomain(`${"a".repeat(39)} b`), "a".repeat(39));
});

test("subdomínio: validação", () => {
  assert.equal(validateSubdomain("Acme"), "acme");
  assert.throws(() => validateSubdomain("-acme"), /hífen/);
  assert.throws(() => validateSubdomain("ac me"), /hífen/);
  assert.throws(() => validateSubdomain("a".repeat(41)), /40/);
});

test("domínio: aceita com protocolo e barra, recusa lixo", () => {
  assert.equal(normalizeDomain("https://TMS.Acme.com.br/login"), "tms.acme.com.br");
  assert.equal(normalizeDomain("tms.acme.com.br."), "tms.acme.com.br");
  assert.throws(() => normalizeDomain("acme"), /Domínio inválido/);
  assert.throws(() => normalizeDomain("tms acme.com"), /Domínio inválido/);
});

test("DNS: separa a zona em domínios .com.br e .com", () => {
  assert.deepEqual(splitDomain("tms.acme.com.br"), { zone: "acme.com.br", name: "tms" });
  assert.deepEqual(splitDomain("acme.com.br"), { zone: "acme.com.br", name: "@" });
  assert.deepEqual(splitDomain("app.tms.acme.com"), { zone: "acme.com", name: "app.tms" });
  assert.deepEqual(splitDomain("acme.com"), { zone: "acme.com", name: "@" });
});

test("DNS: subdomínio recomenda CNAME; domínio principal só A", () => {
  const sub = dnsRecordsFor("tms.acme.com.br", "acme.frotak.app", "203.0.113.10");
  assert.equal(sub[0].type, "CNAME");
  assert.equal(sub[0].value, "acme.frotak.app.");
  assert.equal(sub[0].recommended, true);
  assert.equal(sub[1].type, "A");
  assert.equal(sub[1].recommended, false);

  const apex = dnsRecordsFor("acme.com.br", "acme.frotak.app", "203.0.113.10");
  assert.equal(apex.length, 1);
  assert.equal(apex[0].type, "A");
  assert.equal(apex[0].name, "@");
  assert.equal(apex[0].recommended, true);
});

test("editar: banco do cliente primeiro, depois o Central", async () => {
  const { deps, calls } = fakeDeps();
  await updateClientProfile(operator, deps, "acme", {
    legalName: "Acme",
    tradeName: "",
    cnpj: "11222333000181",
    maxVehicles: 5,
  });
  assert.deepEqual(calls, ["locate:acme", "agent.profile", "catalog.profile"]);
});

test("editar: com banco único, só o Central", async () => {
  const { deps, calls } = fakeDeps({ multi: false });
  await updateClientProfile(operator, deps, "acme", {
    legalName: "Acme",
    tradeName: "",
    cnpj: "11222333000181",
    maxVehicles: 5,
  });
  assert.deepEqual(calls, ["locate:acme", "catalog.profile"]);
});

test("editar: dado inválido não chega a nenhum banco", async () => {
  const { deps, calls } = fakeDeps();
  await assert.rejects(
    updateClientProfile(operator, deps, "acme", {
      legalName: "",
      tradeName: "",
      cnpj: "1",
      maxVehicles: 1,
    }),
  );
  assert.deepEqual(calls, []);
});

test("papel de consulta não altera nada", async () => {
  const { deps, calls } = fakeDeps();
  await assert.rejects(setClientStatus(reader, deps, "acme", "suspended"), /consulta/);
  await assert.rejects(changeSubdomain(reader, deps, "acme", "nova"), /consulta/);
  assert.deepEqual(calls, []);
});

test("situação: valores aceitos e ordem", async () => {
  const { deps, calls } = fakeDeps();
  await assert.rejects(setClientStatus(operator, deps, "acme", "apagado"), /Situação/);
  await setClientStatus(operator, deps, "acme", "suspended");
  assert.deepEqual(calls, ["locate:acme", "agent.status:suspended", "catalog.status:suspended"]);
});

test("subdomínio: agente decide o roteamento e o Central guarda o resultado", async () => {
  const { deps, calls } = fakeDeps();
  const result = await changeSubdomain(operator, deps, "acme", "Acme-Nova");
  assert.equal(result.subdomain, "acme-nova");
  assert.deepEqual(calls, [
    "locate:acme",
    "agent.subdomain:acme-nova",
    "catalog.addresses:acme-nova",
  ]);
});

test("subdomínio: com banco único não existe", async () => {
  const { deps } = fakeDeps({ multi: false });
  await assert.rejects(changeSubdomain(operator, deps, "acme", "nova"), /banco por cliente/);
});

test("cliente inexistente: nada é feito", async () => {
  const { deps, calls } = fakeDeps();
  await assert.rejects(changeSubdomain(operator, deps, "outro", "nova"), /não encontrado/);
  assert.deepEqual(calls, ["locate:outro"]);
});

test("nova senha: auditoria antes da troca", async () => {
  const { deps, calls } = fakeDeps();
  const result = await resetClientLoginPassword(
    operator,
    deps,
    "acme",
    "00000000-0000-0000-0000-000000000001",
    "dono@acme.test",
  );
  assert.equal(result.temporaryPassword, "Abc123");
  assert.deepEqual(calls, ["locate:acme", "audit:dono@acme.test", "agent.password"]);
});
