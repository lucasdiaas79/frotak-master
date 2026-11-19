// Avaliacao da Frotak IA com dados reais: faz as perguntas de scripts/frotak-ai-v2-cases.ts (e
// algumas conversas de continuacao) a IA de texto, logado como um usuario de verdade, e grava um
// relatorio com ferramentas chamadas, erros, tempo e resposta. So le dados: as acoes ficam apenas
// preparadas (nada e gravado sem o botao Confirmar, que este script nunca chama).
//
// Rode pelo scripts/frotak-ai-eval.mjs, que empacota este arquivo (ele importa telas .tsx).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  sendFrotakAiChat,
  type FrotakAiMessage,
} from "@/modules/frotak-ai/application/frotakAiConversation";
import type { FrotakAiToolRunner } from "@/modules/frotak-ai/application/ports";
import type { FrotakAiContext } from "@/modules/frotak-ai/domain/frotakAiContext";
import {
  isFrotakAiTechnicalFailure,
  type FrotakAiToolName,
} from "@/modules/frotak-ai/domain/frotakAiToolCatalog";
import { resolveFrotakAiContext } from "@/modules/frotak-ai/infrastructure/frotakAiContext";
import { supabaseFrotakAiToolRunner } from "@/modules/frotak-ai/infrastructure/frotakAiTools";
import { GeminiAiModel } from "@/modules/frotak-ai/infrastructure/geminiAiModel";
import { FROTAK_AI_V2_EVALUATION_CASES, type FrotakAiEvaluationCase } from "./frotak-ai-v2-cases";

type FollowUpCase = {
  category: "continuacao";
  turns: { question: string; expectedTool?: FrotakAiToolName }[];
};

// Perguntas que dependem da anterior ("desse", "dele"): testam a memoria da conversa.
const FOLLOW_UP_CASES: FollowUpCase[] = [
  {
    category: "continuacao",
    turns: [
      { question: "Qual foi o ultimo frete?", expectedTool: "consultar_frete" },
      { question: "E quem foi o motorista dele?" },
      { question: "Quanto ele abasteceu este mes?", expectedTool: "consultar_abastecimentos" },
    ],
  },
  {
    category: "continuacao",
    turns: [
      { question: "Quais veiculos estao parados?", expectedTool: "veiculos_parados" },
      { question: "E onde esta o primeiro deles agora?", expectedTool: "consultar_posicao" },
    ],
  },
  {
    category: "continuacao",
    turns: [
      {
        question: "Qual caminhao deu mais lucro este mes?",
        expectedTool: "consultar_rentabilidade",
      },
      { question: "E qual deu menos?" },
    ],
  },
];

type ToolTrace = {
  name: string;
  args: Record<string, unknown>;
  ms: number;
  status: "ok" | "negocio" | "falha_tecnica" | "excecao";
  code?: string;
  error?: string;
};

type TurnResult = {
  id: string;
  category: string;
  question: string;
  expectedTool?: string;
  expectedDomain?: string;
  verdict: "ok" | "ferramenta_errada" | "sem_ferramenta" | "falha_tecnica" | "erro";
  tools: ToolTrace[];
  model?: string;
  answer?: string;
  error?: string;
  ms: number;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function classify(output: unknown): Pick<ToolTrace, "status" | "code" | "error"> {
  const record =
    output && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : {};
  const code = typeof record.code === "string" ? record.code : undefined;
  const error = typeof record.error === "string" ? record.error : undefined;
  if (isFrotakAiTechnicalFailure(output)) return { status: "falha_tecnica", code, error };
  if (record.ok === false) return { status: "negocio", code, error };
  return { status: "ok" };
}

function tracingRunner(traces: ToolTrace[]): FrotakAiToolRunner {
  return {
    tenantSnapshot: (context) => supabaseFrotakAiToolRunner.tenantSnapshot(context),
    async execute(context, name, args = {}) {
      const started = Date.now();
      try {
        const output = await supabaseFrotakAiToolRunner.execute(context, name, args);
        traces.push({ name, args, ms: Date.now() - started, ...classify(output) });
        return output;
      } catch (error) {
        traces.push({
          name,
          args,
          ms: Date.now() - started,
          status: "excecao",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}

function verdictFor(
  traces: ToolTrace[],
  expectedTool?: string,
  expectedDomain?: string,
): TurnResult["verdict"] {
  if (traces.some((trace) => trace.status === "falha_tecnica" || trace.status === "excecao")) {
    return "falha_tecnica";
  }
  if (!expectedTool) return "ok";
  if (traces.length === 0) return "sem_ferramenta";
  const hit = traces.some(
    (trace) =>
      trace.name === expectedTool &&
      (!expectedDomain || String(trace.args.dominio ?? "") === expectedDomain),
  );
  return hit ? "ok" : "ferramenta_errada";
}

async function signIn() {
  const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY") ?? env("VITE_SUPABASE_ANON_KEY");
  const email = env("FROTAK_AI_EVAL_EMAIL");
  const password = env("FROTAK_AI_EVAL_PASSWORD");
  const missing = [
    !url && "VITE_SUPABASE_URL",
    !anonKey && "VITE_SUPABASE_ANON_KEY",
    !env("GEMINI_API_KEY") && !env("GOOGLE_API_KEY") && "GEMINI_API_KEY",
    !email && "FROTAK_AI_EVAL_EMAIL",
    !password && "FROTAK_AI_EVAL_PASSWORD",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Faltam variaveis de ambiente: ${missing.join(", ")}`);

  const supabase = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (error || !data.session) throw new Error(`Login falhou: ${error?.message ?? "sem sessao"}`);

  let workspaceId = env("FROTAK_AI_EVAL_WORKSPACE");
  if (!workspaceId) {
    const { data: memberships, error: membershipError } = await supabase
      .from("workspace_memberships")
      .select("workspace_id, is_owner")
      .eq("user_id", data.user.id)
      .eq("status", "active")
      .order("is_owner", { ascending: false });
    if (membershipError) throw new Error(`Vinculos: ${membershipError.message}`);
    workspaceId = memberships?.[0]?.workspace_id;
    if ((memberships?.length ?? 0) > 1) {
      console.log(
        `Usuario tem ${memberships!.length} workspaces; usando ${workspaceId}. Defina FROTAK_AI_EVAL_WORKSPACE para escolher.`,
      );
    }
  }
  if (!workspaceId) throw new Error("Usuario sem workspace ativo.");
  return resolveFrotakAiContext(data.session.access_token, workspaceId);
}

async function runTurn(
  context: FrotakAiContext,
  id: string,
  category: string,
  question: string,
  history: FrotakAiMessage[],
  expectedTool?: string,
  expectedDomain?: string,
): Promise<TurnResult> {
  const traces: ToolTrace[] = [];
  const started = Date.now();
  const model = new GeminiAiModel((error, stage) =>
    console.warn(`  [gemini ${stage}]`, error instanceof Error ? error.message : error),
  );
  try {
    const result = await sendFrotakAiChat(
      { model, tools: tracingRunner(traces) },
      { context, message: question, history },
    );
    return {
      id,
      category,
      question,
      expectedTool,
      expectedDomain,
      verdict: verdictFor(traces, expectedTool, expectedDomain),
      tools: traces,
      model: result.model,
      answer: result.text,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      id,
      category,
      question,
      expectedTool,
      expectedDomain,
      verdict: "erro",
      tools: traces,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function oneLine(value: string | undefined, max = 400) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function markdownReport(context: FrotakAiContext, results: TurnResult[]) {
  const count = (verdict: TurnResult["verdict"]) =>
    results.filter((item) => item.verdict === verdict).length;
  const sorted = [...results.map((item) => item.ms)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const lines = [
    `# Avaliacao da Frotak IA`,
    "",
    `Data: ${new Date().toISOString()}  `,
    `Tenant: ${context.tenantName} (workspace ${context.workspaceName}, dono: ${context.isOwner ? "sim" : "nao"})`,
    "",
    `| Resultado | Perguntas |`,
    `|---|---|`,
    `| Certo | ${count("ok")} |`,
    `| Ferramenta errada | ${count("ferramenta_errada")} |`,
    `| Respondeu sem consultar | ${count("sem_ferramenta")} |`,
    `| Falha tecnica de ferramenta | ${count("falha_tecnica")} |`,
    `| Erro da IA | ${count("erro")} |`,
    `| Total | ${results.length} |`,
    "",
    `Tempo por resposta: mediana ${(median / 1000).toFixed(1)} s, 90% abaixo de ${(p90 / 1000).toFixed(1)} s.`,
    "",
    `## Detalhe`,
    "",
  ];
  for (const item of results) {
    lines.push(
      `### ${item.id} [${item.verdict}] ${item.question}`,
      "",
      `- Categoria: ${item.category}. Esperado: ${item.expectedTool ?? "-"}${item.expectedDomain ? ` (${item.expectedDomain})` : ""}. Modelo: ${item.model ?? "-"}. Tempo: ${(item.ms / 1000).toFixed(1)} s.`,
      `- Ferramentas: ${
        item.tools.length
          ? item.tools
              .map(
                (trace) =>
                  `${trace.name}(${oneLine(JSON.stringify(trace.args), 160)}) -> ${trace.status}${trace.code ? ` ${trace.code}` : ""}${trace.error ? ` "${oneLine(trace.error, 120)}"` : ""}`,
              )
              .join("; ")
          : "nenhuma"
      }`,
      item.error ? `- Erro: ${oneLine(item.error)}` : `- Resposta: ${oneLine(item.answer, 600)}`,
      "",
    );
  }
  return lines.join("\n");
}

async function main() {
  const only = argValue("--categoria");
  const limit = Number(argValue("--limite") ?? 0) || undefined;
  const delayMs = Number(argValue("--pausa-ms") ?? 1500);
  const outDir = resolve(
    argValue("--saida") ?? join("frotak-ai-eval", new Date().toISOString().replace(/[:.]/g, "-")),
  );
  const skipFollowUps = process.argv.includes("--sem-continuacao");

  const context = await signIn();
  console.log(
    `Logado em ${context.tenantName} / ${context.workspaceName} (dono: ${context.isOwner}).`,
  );

  const singles: FrotakAiEvaluationCase[] = FROTAK_AI_V2_EVALUATION_CASES.filter(
    (item) => !only || item.category === only,
  ).slice(0, limit);
  const results: TurnResult[] = [];

  for (const [index, item] of singles.entries()) {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    process.stdout.write(`${id} ${item.question} ... `);
    const result = await runTurn(
      context,
      id,
      item.category,
      item.question,
      [],
      item.expectedTool,
      item.domain,
    );
    results.push(result);
    console.log(
      `${result.verdict} (${result.tools.map((t) => t.name).join(",") || "-"}, ${(result.ms / 1000).toFixed(1)} s)`,
    );
    await sleep(delayMs);
  }

  if (!skipFollowUps && (!only || only === "continuacao")) {
    for (const [index, conversation] of FOLLOW_UP_CASES.entries()) {
      const history: FrotakAiMessage[] = [];
      for (const [turnIndex, turn] of conversation.turns.entries()) {
        const id = `C${index + 1}.${turnIndex + 1}`;
        process.stdout.write(`${id} ${turn.question} ... `);
        const result = await runTurn(
          context,
          id,
          conversation.category,
          turn.question,
          [...history],
          turn.expectedTool,
        );
        results.push(result);
        console.log(`${result.verdict} (${result.tools.map((t) => t.name).join(",") || "-"})`);
        history.push({ role: "user", text: turn.question });
        if (result.answer) history.push({ role: "assistant", text: result.answer });
        await sleep(delayMs);
      }
    }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "resultado.json"),
    JSON.stringify({ tenant: context.tenantName, results }, null, 2),
  );
  writeFileSync(join(outDir, "relatorio.md"), markdownReport(context, results));
  const ok = results.filter((item) => item.verdict === "ok").length;
  console.log(`\n${ok} de ${results.length} certas. Relatorio em ${join(outDir, "relatorio.md")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
