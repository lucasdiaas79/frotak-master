import assert from "node:assert/strict";
import test from "node:test";
import { isFrotakSupportQuestion, requiresFrotakTool } from "../src/lib/frotakAiIntent.ts";

test("recognizes support instructions before operational lookups", () => {
  assert.equal(isFrotakSupportQuestion("Como enviar um CT-e para o motorista?"), true);
  assert.equal(isFrotakSupportQuestion("Me explique o passo a passo para criar um frete"), true);
  assert.equal(isFrotakSupportQuestion("Por que uma cacamba aparece bloqueada?"), true);
  assert.equal(isFrotakSupportQuestion("Qual foi o ultimo frete?"), false);
});

test("requires grounded tools for tenant facts and support", () => {
  assert.equal(requiresFrotakTool("Quantos caminhoes existem na frota?"), true);
  assert.equal(requiresFrotakTool("Como enviar um CT-e para o motorista?"), true);
  assert.equal(requiresFrotakTool("Conte uma piada curta"), false);
});
