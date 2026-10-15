import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadFinancial, type FrotakAiContext } from "../src/lib/frotakAiContext.ts";
import { isFrotakSupportQuestion, requiresFrotakTool } from "../src/lib/frotakAiIntent.ts";
import {
  extractFrotakAiPendingAction,
  FROTAK_AI_FINANCIAL_TOOL_NAMES,
  FROTAK_AI_TOOL_NAMES,
  isFrotakAiTechnicalFailure,
  stripFrotakAiActionToken,
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
      "acoes",
      "dre",
      "financeiro",
      "fretes",
      "frota",
      "motoristas",
      "posicao",
      "proativa",
      "rentabilidade",
      "tenant_inteiro",
      "web",
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
    if (item.ownerOnly) {
      assert.equal(financial.has(item.expectedTool) || Boolean(item.domain), true, item.question);
    }
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

test("generic domains, alerts and the action preview never write", () => {
  for (const file of ["frotakAiDomains.ts", "frotakAiAlerts.ts"]) {
    const source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
    assert.equal(/\.(insert|update|upsert|delete|rpc)\s*\(/.test(source), false, file);
    assert.ok(source.includes('.eq("tenant_id", context.tenantId)'), file);
  }
  const actions = readFileSync(new URL("../src/lib/frotakAiActions.ts", import.meta.url), "utf8");
  const prepare = actions.slice(
    actions.indexOf("export async function prepareFrotakAiAction"),
    actions.indexOf("async function alreadyExecuted"),
  );
  assert.ok(prepare.length > 0);
  assert.equal(/\.(insert|update|upsert|delete|rpc)\s*\(/.test(prepare), false);
  assert.ok(actions.includes("action.userId !== context.userId"));
  assert.ok(actions.includes("if (await alreadyExecuted(action.nonce))"));
});

test("financial domains in the catalog are owner-only", () => {
  const source = readFileSync(new URL("../src/lib/frotakAiDomains.ts", import.meta.url), "utf8");
  for (const domain of [
    "folha",
    "adiantamentos_funcionarios",
    "lancamentos_financeiros",
    "parcelas_financeiras",
  ]) {
    const block = source.slice(source.indexOf(`${domain}: {`));
    const end = block.indexOf("\n  },\n");
    assert.ok(block.slice(0, end).includes("financial: true"), domain);
  }
  assert.ok(source.includes("domain.spec.financial && !canReadFinancial(context)"));
});

test("the confirmation token reaches the screen but not the model", () => {
  const result = {
    ok: true,
    tool: "lancar_despesa_frete",
    data: {
      status: "aguardando_confirmacao",
      resumo: "Lancar",
      confirmacao: { token: "t.s", resumo: "Lancar" },
    },
  };
  assert.deepEqual(extractFrotakAiPendingAction(result), { token: "t.s", resumo: "Lancar" });
  const stripped = stripFrotakAiActionToken(result) as { data: Record<string, unknown> };
  assert.equal("confirmacao" in stripped.data, false);
  assert.equal(stripped.data.resumo, "Lancar");
  assert.equal(extractFrotakAiPendingAction({ ok: true, data: {} }), null);
});

test("new business answers do not mute the voice", () => {
  for (const code of ["INVALID_FILTER", "INVALID_DOMAIN", "NO_ACTIVE_FREIGHT", "ACTIVE_FREIGHT"]) {
    assert.equal(isFrotakAiTechnicalFailure({ ok: false, error: "x", code }), false, code);
  }
  assert.equal(isFrotakAiTechnicalFailure({ ok: false, error: "x", code: "TOOL_FAILED" }), true);
});
