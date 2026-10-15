import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadFinancial, type FrotakAiContext } from "../src/lib/frotakAiContext.ts";
import { isFrotakSupportQuestion, requiresFrotakTool } from "../src/lib/frotakAiIntent.ts";
import {
  createDeterministicFrotakAnswer,
  deterministicAnswerFromToolResult,
} from "../src/lib/frotakAiDeterministic.ts";
import {
  FROTAK_AI_FINANCIAL_TOOL_NAMES,
  FROTAK_AI_TOOL_NAMES,
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

test("critical fuel values are rendered deterministically by the server", () => {
  const answer = createDeterministicFrotakAnswer("consultar_abastecimentos", {
    period: { startDate: "2026-09-15", endDate: "2026-10-15" },
    totalCount: 3,
    totals: { liters: 650, amount: 3900, averagePricePerLiter: 6 },
  });
  assert.equal(
    answer,
    "Periodo: 2026-09-15 a 2026-10-15. 3 abastecimentos.\nLitros: 650. Valor: R$ 3.900,00. Preco medio: R$ 6,00/L.",
  );
});

test("DRE values are copied from backend fields without model calculation", () => {
  const answer = createDeterministicFrotakAnswer("consultar_dre", {
    period: { startDate: "2026-10-01", endDate: "2026-10-15" },
    totals: {
      netRevenue: 61175,
      grossResult: 60000,
      operatingResult: 59325,
      managerial_result: 59325,
      managerialMargin: 97,
    },
  });
  assert.ok(answer?.includes("Resultado gerencial: R$ 59.325,00"));
  assert.ok(answer?.includes("Margem gerencial: 97%"));
});

test("tool result exposes the exact server answer to text and voice flows", () => {
  const answer = deterministicAnswerFromToolResult({
    ok: true,
    deterministicAnswer: "Total confirmado pelo servidor: 44.",
  });
  assert.equal(answer, "Total confirmado pelo servidor: 44.");
});

test("every tenant data tool has a deterministic renderer", () => {
  FROTAK_AI_TOOL_NAMES.filter((name) => name !== "consultar_suporte").forEach((name) => {
    assert.equal(typeof createDeterministicFrotakAnswer(name, {}), "string", name);
  });
  assert.equal(createDeterministicFrotakAnswer("consultar_suporte", {}), null);
});
