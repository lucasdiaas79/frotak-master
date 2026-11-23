// Avaliacao da Frotak IA pela tela, no sistema em producao: entra com um login de verdade, faz as
// perguntas de scripts/frotak-ai-v2-cases.ts (e conversas de continuacao) no chat de texto da
// Frotak IA e grava um relatorio com ferramentas chamadas, tempo e resposta. Nao precisa de
// nenhuma chave: usa a IA e o banco do proprio sistema. So le dados: nunca toca em Confirmar.
//
// Uso (Node 22+, com o pacote playwright disponivel, por exemplo via `npm i -D playwright`
// ou `npx -y -p playwright@1.49.1 node ...`):
//   set FROTAK_AI_EVAL_EMAIL=... & set FROTAK_AI_EVAL_PASSWORD=...
//   node --experimental-strip-types scripts/frotak-ai-eval-ui.mjs [--url https://frotak.log.br]
//        [--categoria frota] [--limite 10] [--saida pasta] [--sem-continuacao] [--ver]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { FROTAK_AI_V2_EVALUATION_CASES } from "./frotak-ai-v2-cases.ts";

const TOOL_NAMES = [
  "consultar_tenant",
  "buscar_veiculo",
  "buscar_implemento",
  "consultar_posicao",
  "listar_fretes_ativos",
  "consultar_frete",
  "consultar_motorista",
  "buscar_parceiro",
  "buscar_produto",
  "consultar_abastecimentos",
  "consultar_financeiro",
  "consultar_dre",
  "consultar_rentabilidade",
  "consultar_suporte",
  "consultar",
  "resumir",
  "buscar",
  "alertas",
  "veiculos_parados",
  "rendimento_frota",
  "lancar_despesa_frete",
  "atualizar_situacao_veiculo",
  "registrar_ocorrencia",
  "registrar_motivo_parado",
  "pesquisar_web",
];

const FOLLOW_UPS = [
  [
    { question: "Qual foi o ultimo frete?", expectedTool: "consultar_frete" },
    { question: "E quem foi o motorista dele?" },
    { question: "Quanto ele abasteceu este mes?", expectedTool: "consultar_abastecimentos" },
  ],
  [
    { question: "Quais veiculos estao parados?", expectedTool: "veiculos_parados" },
    { question: "E onde esta o primeiro deles agora?", expectedTool: "consultar_posicao" },
  ],
  [
    { question: "Qual caminhao deu mais lucro este mes?", expectedTool: "consultar_rentabilidade" },
    { question: "E qual deu menos?" },
  ],
];

const arg = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const baseUrl = (arg("--url") ?? "https://frotak.log.br").replace(/\/$/, "");
const only = arg("--categoria");
const limit = Number(arg("--limite") ?? 0) || undefined;
const outDir = resolve(
  arg("--saida") ?? join("frotak-ai-eval", `ui-${new Date().toISOString().replace(/[:.]/g, "-")}`),
);
const email = process.env.FROTAK_AI_EVAL_EMAIL;
const password = process.env.FROTAK_AI_EVAL_PASSWORD;
if (!email || !password) {
  console.error("Defina FROTAK_AI_EVAL_EMAIL e FROTAK_AI_EVAL_PASSWORD.");
  process.exit(1);
}

// Nomes de ferramenta que aparecem na resposta do servidor (campo tools), em ordem.
function toolsFromBody(body) {
  const match = body.match(/tools[^[]{0,20}\[([^\]]*)\]/);
  const scope = match ? match[1] : body;
  const found = [];
  for (const token of scope.match(/[a-z_]{4,}/g) ?? []) {
    if (TOOL_NAMES.includes(token)) found.push(token);
  }
  return found;
}

async function login(page) {
  await page.goto(`${baseUrl}/frotak-ia`, { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[type="email"]');
  const chatInput = page.getByPlaceholder("Pergunte a Frotak IA...").first();
  await Promise.race([
    emailInput.waitFor({ timeout: 30_000 }),
    chatInput.waitFor({ timeout: 30_000 }),
  ]).catch(() => {});
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !/login/.test(url.href), { timeout: 60_000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    if (!page.url().includes("/frotak-ia")) {
      await page.goto(`${baseUrl}/frotak-ia`, { waitUntil: "domcontentloaded" });
    }
  }
  await chatInput.waitFor({ timeout: 60_000 });
}

async function openFreshChat(page) {
  await page.goto(`${baseUrl}/frotak-ia`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Pergunte a Frotak IA...").first().waitFor({ timeout: 60_000 });
}

async function ask(page, question) {
  const input = page.locator('input[placeholder="Pergunte a Frotak IA..."]:visible').first();
  const started = Date.now();
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        (response.request().postData() ?? "").includes(question.slice(0, 30)),
      { timeout: 120_000 },
    )
    .catch(() => null);
  await input.fill(question);
  await input.press("Enter");
  const response = await responsePromise;
  const ms = Date.now() - started;
  const body = response ? await response.text().catch(() => "") : "";
  await page.waitForTimeout(800);
  const pageText = await page.locator("body").innerText();
  const at = pageText.lastIndexOf(question);
  const answer = (at >= 0 ? pageText.slice(at + question.length) : "")
    .replace(/Pergunte a Frotak IA\.\.\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
  return {
    ms,
    status: response?.status() ?? 0,
    tools: toolsFromBody(body),
    serverError: response && !response.ok() ? body.slice(0, 300) : undefined,
    answer,
  };
}

function verdict(result, expectedTool, expectedDomain) {
  if (!result.status || result.serverError) return "erro";
  if (/nao foi possivel|não foi possível|instavel|limite temporario/i.test(result.answer)) {
    return "erro";
  }
  if (!expectedTool) return "ok";
  if (result.tools.length === 0) return "sem_ferramenta";
  if (!result.tools.includes(expectedTool)) return "ferramenta_errada";
  void expectedDomain; // pela tela nao da para ver o dominio pedido; conferir na resposta.
  return "ok";
}

function report(results) {
  const count = (v) => results.filter((item) => item.verdict === v).length;
  const times = results.map((item) => item.ms).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? 0;
  const p90 = times[Math.floor(times.length * 0.9)] ?? 0;
  const lines = [
    "# Avaliacao da Frotak IA (pela tela)",
    "",
    `Data: ${new Date().toISOString()}  `,
    `Endereco: ${baseUrl}. Login: ${email}.`,
    "",
    "| Resultado | Perguntas |",
    "|---|---|",
    `| Certo | ${count("ok")} |`,
    `| Ferramenta errada | ${count("ferramenta_errada")} |`,
    `| Respondeu sem consultar | ${count("sem_ferramenta")} |`,
    `| Erro | ${count("erro")} |`,
    `| Total | ${results.length} |`,
    "",
    `Tempo por resposta: mediana ${(median / 1000).toFixed(1)} s, 90% abaixo de ${(p90 / 1000).toFixed(1)} s.`,
    "",
    "## Detalhe",
    "",
  ];
  for (const item of results) {
    lines.push(
      `### ${item.id} [${item.verdict}] ${item.question}`,
      "",
      `- Categoria: ${item.category}. Esperado: ${item.expectedTool ?? "-"}${item.expectedDomain ? ` (${item.expectedDomain})` : ""}. Tempo: ${(item.ms / 1000).toFixed(1)} s.`,
      `- Ferramentas: ${item.tools.join(", ") || "nenhuma"}`,
      item.serverError ? `- Erro do servidor: ${item.serverError}` : `- Resposta: ${item.answer}`,
      "",
    );
  }
  return lines.join("\n");
}

const browser = await chromium.launch({ headless: !process.argv.includes("--ver") });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
const results = [];
const save = () => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "resultado.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(outDir, "relatorio.md"), report(results));
};

try {
  await login(page);
  console.log(`Logado. Abrindo ${page.url()}`);

  const singles = FROTAK_AI_V2_EVALUATION_CASES.filter(
    (item) => !only || item.category === only,
  ).slice(0, limit);
  for (const [index, item] of singles.entries()) {
    const id = `P${String(index + 1).padStart(2, "0")}`;
    await openFreshChat(page);
    const result = await ask(page, item.question);
    const row = {
      id,
      category: item.category,
      question: item.question,
      expectedTool: item.expectedTool,
      expectedDomain: item.domain,
      ...result,
    };
    row.verdict = verdict(row, item.expectedTool, item.domain);
    results.push(row);
    console.log(
      `${id} ${row.verdict} ${row.tools.join(",") || "-"} ${(row.ms / 1000).toFixed(1)}s  ${item.question}`,
    );
    save();
  }

  if (!process.argv.includes("--sem-continuacao") && (!only || only === "continuacao")) {
    for (const [index, turns] of FOLLOW_UPS.entries()) {
      await openFreshChat(page);
      for (const [turnIndex, turn] of turns.entries()) {
        const id = `C${index + 1}.${turnIndex + 1}`;
        const result = await ask(page, turn.question);
        const row = { id, category: "continuacao", ...turn, ...result };
        row.verdict = verdict(row, turn.expectedTool);
        results.push(row);
        console.log(`${id} ${row.verdict} ${row.tools.join(",") || "-"}  ${turn.question}`);
        save();
      }
    }
  }
} finally {
  save();
  await browser.close();
}
const ok = results.filter((item) => item.verdict === "ok").length;
console.log(`\n${ok} de ${results.length} certas. Relatorio em ${join(outDir, "relatorio.md")}`);
