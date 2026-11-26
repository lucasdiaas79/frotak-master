// Roda a avaliacao da Frotak IA com dados reais (scripts/frotak-ai-eval-entry.ts).
//
// Uso, na pasta central-dias-main, com um .env que tenha VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, GEMINI_API_KEY, FROTAK_AI_EVAL_EMAIL e FROTAK_AI_EVAL_PASSWORD
// (opcional FROTAK_AI_EVAL_WORKSPACE):
//   node --env-file=.env scripts/frotak-ai-eval.mjs [--categoria frota] [--limite 10]
//        [--pausa-ms 1500] [--saida pasta] [--sem-continuacao]
//
// O arquivo de entrada importa telas .tsx, entao ele e empacotado com o esbuild do Vite antes.

import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "node_modules", ".cache", "frotak-ai-eval", "eval.mjs");

await build({
  entryPoints: [join(root, "scripts", "frotak-ai-eval-entry.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  jsx: "automatic",
  packages: "external",
  alias: { "@": join(root, "src") },
  loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".webp": "empty" },
  logLevel: "warning",
});

await import(pathToFileURL(outfile).href);
