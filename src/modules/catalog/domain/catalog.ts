/**
 * Catalogo de produtos e modulos que o Master libera por cliente.
 * Os codigos sao contrato com o banco (platform_products, modules) e com o app cliente,
 * que usa os mesmos codigos para montar o menu e bloquear rotas.
 */

export type ProductCode = "tms" | "view";

export type ModuleCode =
  "fleet_core" | "financial" | "cte_issuance" | "frotak_ai" | "driver_app" | "frotak_tracking";

export type ProductDefinition = {
  code: ProductCode;
  name: string;
  description: string;
};

export type ModuleDefinition = {
  code: ModuleCode;
  product: ProductCode;
  name: string;
  description: string;
  /** Modulo base do produto: fica ligado enquanto o produto estiver liberado. */
  core: boolean;
};

export const products: ProductDefinition[] = [
  {
    code: "tms",
    name: "TMS FrotaK",
    description: "Gestão de transporte: frota, fretes, financeiro, CT-e, IA e app do motorista.",
  },
  {
    code: "view",
    name: "FrotaK View",
    description: "Videotelemetria Hikvision: vídeo, gravações, alertas ADAS/DSM e GPS.",
  },
];

export const modules: ModuleDefinition[] = [
  {
    code: "fleet_core",
    product: "tms",
    name: "Gestão de Frota",
    description: "Frota, fretes, cadastros, documentos, abastecimentos, histórico e mapa.",
    core: true,
  },
  {
    code: "financial",
    product: "tms",
    name: "Financeiro",
    description: "Contas a pagar e receber, fluxo de caixa, DRE e rentabilidade.",
    core: false,
  },
  {
    code: "cte_issuance",
    product: "tms",
    name: "Emissão de CT-e",
    description: "Emissão e gerenciamento de CT-e e MDF-e.",
    core: false,
  },
  {
    code: "frotak_ai",
    product: "tms",
    name: "FrotaK IA",
    description: "Assistente por texto e voz, alertas e ações com confirmação.",
    core: false,
  },
  {
    code: "driver_app",
    product: "tms",
    name: "App Motorista",
    description: "Viagens, abastecimentos, despesas, documentos e prestação de contas.",
    core: false,
  },
  {
    code: "frotak_tracking",
    product: "tms",
    name: "Rastreadores",
    description: "Integração Sascar: posições e telemetria dos veículos.",
    core: false,
  },
];

const productCodes = new Set<string>(products.map((product) => product.code));
const moduleByCode = new Map<string, ModuleDefinition>(
  modules.map((module) => [module.code, module]),
);

export function isProductCode(value: string): value is ProductCode {
  return productCodes.has(value);
}

export function isModuleCode(value: string): value is ModuleCode {
  return moduleByCode.has(value);
}

export function findModule(code: ModuleCode): ModuleDefinition {
  const module = moduleByCode.get(code);
  if (!module) throw new Error(`Modulo desconhecido: ${code}`);
  return module;
}

export function modulesOf(product: ProductCode) {
  return modules.filter((module) => module.product === product);
}

export function coreModuleOf(product: ProductCode) {
  return modules.find((module) => module.product === product && module.core);
}
