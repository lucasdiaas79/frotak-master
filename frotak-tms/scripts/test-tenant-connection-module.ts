// Endereço -> cliente no TMS com banco por cliente. Sem rede.
// node --experimental-strip-types --import ./scripts/alias-loader.mjs --test scripts/test-tenant-connection.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHost } from "../server/lib/tenant-connection.ts";

test("endereço de cliente passa inteiro", () => {
  assert.equal(normalizeHost("teste.203-0-113-20.sslip.io"), "teste.203-0-113-20.sslip.io");
  assert.equal(normalizeHost("tms.empresa.com.br"), "tms.empresa.com.br");
  assert.equal(normalizeHost("acme.frotak.log.br"), "acme.frotak.log.br");
});

test("porta, maiúsculas e ponto final saem", () => {
  assert.equal(normalizeHost("Acme.Frotak.Log.BR:443"), "acme.frotak.log.br");
  assert.equal(normalizeHost("acme.frotak.log.br."), "acme.frotak.log.br");
  assert.equal(normalizeHost(" acme.frotak.log.br "), "acme.frotak.log.br");
});

test("o que não é domínio vira null", () => {
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost(""), null);
  assert.equal(normalizeHost("localhost"), null);
  assert.equal(normalizeHost("127.0.0.1:3002"), null);
  assert.equal(normalizeHost("acme_frotak.log.br"), null);
  assert.equal(normalizeHost("acme frotak.log.br"), null);
});
