// Regra de dependencia da clean architecture nos modulos do TMS (src/modules/<modulo>).
//
//   domain          regras puras: nao conhece banco, rede, framework nem outras camadas
//   application     casos de uso e portas: depende do domain e das proprias portas
//   infrastructure  adaptadores (Supabase, Sascar, Gemini...): implementam as portas
//   api             server functions e handlers HTTP: montam caso de uso + adaptador
//   ui              telas: usam o container do modulo, nunca o adaptador direto
//   container.ts    composicao no navegador: unico lugar que liga ui ao adaptador
//
// Um modulo entra na lista quando ja respeita a regra; dali em diante o lint impede regressao.
export const cleanModules = ["driver-app", "frotak-tracking", "financial"];

const external = {
  supabase: "^@supabase/",
  supabaseClient: "^@/lib/supabase$",
  gemini: "^@google/genai$",
  react: "^react(-dom)?(/|$)",
  router: "^@tanstack/",
};
const layer = (...names) => `(^|/)(${names.join("|")})(/|$)`;
const container = "(^|/)container$";

const erasableOnly = {
  // domain e application rodam nos testes pelo Node, que so remove tipos (sem transformar).
  "@typescript-eslint/parameter-properties": "error",
  "no-restricted-syntax": [
    "error",
    { selector: "TSEnumDeclaration", message: "Use uniao de strings em vez de enum." },
  ],
};

function restrict(patterns, message) {
  return ["error", { patterns: patterns.map((regex) => ({ regex, message })) }];
}

function filesOf(modules, layerName) {
  return modules.map((module) => `src/modules/${module}/${layerName}/**/*.{ts,tsx}`);
}

export function architectureConfig(modules = cleanModules) {
  if (!modules.length) return [];
  return [
    {
      files: filesOf(modules, "domain"),
      rules: {
        ...erasableOnly,
        "no-restricted-imports": restrict(
          [
            external.supabase,
            external.supabaseClient,
            external.gemini,
            external.react,
            external.router,
            layer("application", "infrastructure", "api", "ui"),
            container,
          ],
          "domain e puro: so regras e tipos do proprio dominio.",
        ),
      },
    },
    {
      files: filesOf(modules, "application"),
      rules: {
        ...erasableOnly,
        "no-restricted-imports": restrict(
          [
            external.supabase,
            external.supabaseClient,
            external.gemini,
            external.react,
            layer("infrastructure", "api", "ui"),
            container,
          ],
          "application depende so do domain e das portas; adaptadores entram pelo container ou pela api.",
        ),
      },
    },
    {
      files: filesOf(modules, "infrastructure"),
      rules: {
        "no-restricted-imports": restrict(
          [layer("api", "ui"), container],
          "infrastructure implementa portas; nao conhece telas nem a composicao.",
        ),
      },
    },
    {
      files: filesOf(modules, "ui"),
      rules: {
        "no-restricted-imports": restrict(
          [external.supabase, external.supabaseClient, external.gemini, layer("infrastructure")],
          "ui usa o container ou a api do modulo, nunca o adaptador direto.",
        ),
      },
    },
  ];
}
