// Hooks de resolucao do Node para os testes de modulos: entende o alias "@/" do
// tsconfig e imports sem extensao (".ts", ".tsx", "/index.ts"), como o Vite.
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function findFile(base) {
  for (const suffix of CANDIDATES) {
    const path = base + suffix;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = resolvePath(SRC, specifier.slice(2));
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  }

  const file = base ? findFile(base) : null;
  return nextResolve(file ? pathToFileURL(file).href : specifier, context);
}
