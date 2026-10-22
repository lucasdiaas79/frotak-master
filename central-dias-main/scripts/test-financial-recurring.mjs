import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/financial/phase5.ts", import.meta.url), "utf8");

function service(error = null) {
  const calls = [];
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id) => {
      assert.equal(id, "@/lib/supabase");
      return {
        supabase: {
          rpc: async (name, payload) => {
            calls.push({ name, payload });
            return { data: { generated: 2, skipped: 1, documentIds: ["document"] }, error };
          },
        },
      };
    },
  });
  return { api: exports, calls };
}

for (const [method, rpc, key] of [
  [
    "generateDueFinancialRecurringDocuments",
    "generate_due_financial_recurring_documents",
    "p_until_month",
  ],
  [
    "generateFinancialRecurringDocuments",
    "generate_financial_recurring_documents",
    "p_competence_month",
  ],
]) {
  for (const input of ["2026-10", "2026-10-01"]) {
    test(`${method} sends a complete date for ${input}`, async () => {
      const { api, calls } = service();
      const result = await api[method]("workspace", input, "rule");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, rpc);
      assert.equal(calls[0].payload[key], "2026-10-01");
      assert.equal(calls[0].payload.p_workspace_id, "workspace");
      if (method === "generateFinancialRecurringDocuments") {
        assert.equal(calls[0].payload.p_rule_id, "rule");
      }
      assert.equal(result.generated, 2);
      assert.equal(result.skipped, 1);
    });
  }
  test(`${method} preserves backend failures`, async () => {
    const { api } = service({ message: "permission denied" });
    await assert.rejects(api[method]("workspace", "2026-10"), /permission denied/);
  });
}
