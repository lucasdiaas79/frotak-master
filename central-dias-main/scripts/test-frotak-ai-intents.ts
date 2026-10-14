import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadFinancial, type FrotakAiContext } from "../src/lib/frotakAiContext.ts";
import { isFrotakSupportQuestion, requiresFrotakTool } from "../src/lib/frotakAiIntent.ts";
import {
  FROTAK_AI_FINANCIAL_TOOL_NAMES,
  FROTAK_AI_TOOL_NAMES,
  isFrotakAiTechnicalFailure,
} from "../src/lib/frotakAiToolCatalog.ts";
import { FROTAK_AI_V2_EVALUATION_CASES } from "./frotak-ai-v2-cases.ts";

test("recognizes support instructions before operational lookups", () => {
  assert.equal(isFrotakSupportQuestion("Como enviar um CT-e para o motorista?"), true);
  assert.equal(isFrotakSupportQuestion("Me explique o passo a passo para criar um frete"), true);
  assert.equal(isFrotakSupportQuestion("Por que uma cacamba aparece bloqueada?"), true);
  assert.equal(isFrotakSupportQuestion("Qual foi o ultimo frete?"), false);
});

test("requires grounded tools for tenant facts and support", () => {
  assert.equal(requiresFrotakTool("Quantos caminhoes existem na frota?"), true);
  assert.equal(requiresFrotakTool("Como enviar um CT-e para o motorista?"), true);
  assert.equal(requiresFrotakTool("Onde esta a TNX6J30?"), true);
  assert.equal(requiresFrotakTool("Conte uma piada curta"), false);
});

test("financial data is exclusive to the workspace owner", () => {
  const context = {
    isOwner: false,
    permissions: ["financial.transactions.manage"],
  } as FrotakAiContext;
  assert.equal(canReadFinancial(context), false);
  assert.equal(canReadFinancial({ ...context, isOwner: true }), true);
});

test("v2 evaluation suite has at least 50 unique real questions", () => {
  assert.ok(FROTAK_AI_V2_EVALUATION_CASES.length >= 50);
  assert.equal(
    new Set(FROTAK_AI_V2_EVALUATION_CASES.map((item) => item.question)).size,
    FROTAK_AI_V2_EVALUATION_CASES.length,
  );
  assert.deepEqual(
    [...new Set(FROTAK_AI_V2_EVALUATION_CASES.map((item) => item.category))].sort(),
    [
      "abastecimento",
      "dre",
      "financeiro",
      "fretes",
      "frota",
      "motoristas",
      "posicao",
      "rentabilidade",
    ],
  );
});

test("every v2 question is grounded and points to a declared tool", () => {
  const declared = new Set<string>(FROTAK_AI_TOOL_NAMES);
  FROTAK_AI_V2_EVALUATION_CASES.forEach((item) => {
    assert.equal(requiresFrotakTool(item.question), true, item.question);
    assert.equal(declared.has(item.expectedTool), true, item.expectedTool);
  });
});

test("all financial evaluation questions are owner-only", () => {
  const financial = new Set<string>(FROTAK_AI_FINANCIAL_TOOL_NAMES);
  FROTAK_AI_V2_EVALUATION_CASES.forEach((item) => {
    if (financial.has(item.expectedTool)) assert.equal(item.ownerOnly, true, item.question);
    if (item.ownerOnly) assert.equal(financial.has(item.expectedTool), true, item.question);
  });
});

test("v2 tool executor remains read-only and removes the generic query", () => {
  const source = readFileSync(new URL("../src/lib/frotakAiTools.ts", import.meta.url), "utf8");
  assert.equal(source.includes("consultar_frotak"), false);
  assert.equal(/\.(insert|update|upsert|delete)\s*\(/.test(source), false);
  FROTAK_AI_TOOL_NAMES.forEach((name) => {
    assert.ok(source.includes(`name: "${name}"`), name);
  });
  assert.ok(source.includes("FROTAK_AI_FINANCIAL_TOOLS.has(name) && !canReadFinancial(context)"));
  assert.ok(source.includes('.eq("tenant_id", context.tenantId)'));
  assert.ok(source.includes("workspaceId: context.workspaceId"));
});

test("business answers do not count as technical tool failures", () => {
  assert.equal(
    isFrotakAiTechnicalFailure({ ok: true, data: { rows: [{ error: "campo" }] } }),
    false,
  );
  assert.equal(
    isFrotakAiTechnicalFailure({
      ok: false,
      error: "Veiculo nao encontrado",
      code: "VEHICLE_NOT_FOUND",
    }),
    false,
  );
  assert.equal(
    isFrotakAiTechnicalFailure({ ok: false, error: "x", code: "OWNER_REQUIRED" }),
    false,
  );
  assert.equal(isFrotakAiTechnicalFailure({ ok: false, error: "timeout", code: "57014" }), true);
  assert.equal(isFrotakAiTechnicalFailure({ error: "Sessao indisponivel" }), true);
  assert.equal(isFrotakAiTechnicalFailure(null), true);
});
