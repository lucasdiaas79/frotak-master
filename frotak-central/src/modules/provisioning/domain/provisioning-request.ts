import { DomainError } from "@/core/domain/domain-error";
import {
  coreModuleOf,
  findModule,
  isModuleCode,
  isProductCode,
  type ModuleCode,
  type ProductCode,
} from "@/modules/catalog/domain/catalog";

export type ProvisionTenantRequest = {
  legalName: string;
  tradeName?: string;
  cnpj: string;
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
  planCode?: string;
  subscriptionPeriod: string;
  maxVehicles: number;
  products: string[];
  modules: string[];
  /** Banco por cliente: subdomínio escolhido. Vazio: sai do nome. Vira também o identificador. */
  subdomain?: string;
};

export type ValidatedProvisioning = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
  planCode: string;
  subscriptionPeriod: string;
  maxVehicles: number;
  tenantSlug: string;
  workspaceName: string;
  workspaceSlug: string;
  products: ProductCode[];
  modules: ModuleCode[];
};

export const subscriptionPeriods = ["Mensal", "12 meses"];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-");
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function subscriptionEndDate(period: string, startsAt: Date) {
  const normalized = slugify(period);
  if (normalized.includes("12-mes") || normalized.includes("anual")) return addMonths(startsAt, 12);
  if (normalized.includes("semes")) return addMonths(startsAt, 6);
  if (normalized.includes("trimes")) return addMonths(startsAt, 3);
  return addMonths(startsAt, 1);
}

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

/**
 * Regras do cadastro de um cliente novo. Os modulos pedidos precisam ser de um produto
 * escolhido, e o modulo base de cada produto entra sempre.
 */
export function validateProvisioning(request: ProvisionTenantRequest): ValidatedProvisioning {
  const legalName = normalizeText(request.legalName);
  const tradeName = normalizeText(request.tradeName);
  const ownerName = normalizeText(request.ownerName);
  const ownerEmail = normalizeText(request.ownerEmail).toLowerCase();
  const temporaryPassword = normalizeText(request.temporaryPassword);
  const cnpj = normalizeText(request.cnpj).replace(/\D/g, "");
  const maxVehicles = Number(request.maxVehicles);
  const requestedSubdomain = normalizeText(request.subdomain).toLowerCase();
  // Até 40 caracteres: o identificador nomeia o banco e os containers do cliente.
  const tenantSlug =
    requestedSubdomain ||
    slugify(tradeName || legalName)
      .slice(0, 40)
      .replace(/-+$/, "");

  if (!legalName) invalid("Informe o nome da empresa.");
  if (!tenantSlug) invalid("Não foi possível gerar o endereço do cliente a partir do nome.");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(tenantSlug)) {
    invalid(
      "Endereço inválido: use até 40 letras minúsculas, números e hífen, sem hífen nas pontas.",
    );
  }
  if (cnpj.length !== 14) invalid("CNPJ inválido.");
  if (!ownerName) invalid("Informe o nome do administrador inicial.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    invalid("Informe um e-mail válido para o administrador inicial.");
  }
  if (temporaryPassword.length < 8) invalid("A senha temporária deve ter pelo menos 8 caracteres.");
  if (!Number.isInteger(maxVehicles) || maxVehicles < 1) invalid("Limite de veículos inválido.");

  const products = Array.from(new Set((request.products ?? []).map(normalizeText)));
  if (!products.length) invalid("Escolha ao menos um produto.");
  const unknownProduct = products.find((code) => !isProductCode(code));
  if (unknownProduct) invalid(`Produto desconhecido: ${unknownProduct}.`);
  const productCodes = products as ProductCode[];

  const requestedModules = Array.from(new Set((request.modules ?? []).map(normalizeText)));
  const unknownModule = requestedModules.find((code) => !isModuleCode(code));
  if (unknownModule) invalid(`Módulo desconhecido: ${unknownModule}.`);

  const modules = new Set<ModuleCode>(requestedModules as ModuleCode[]);
  for (const module of modules) {
    if (!productCodes.includes(findModule(module).product)) {
      invalid(`${findModule(module).name} exige o produto dele liberado.`);
    }
  }
  // O provisionamento atual cria o workspace do TMS; o modulo base entra sempre.
  const tmsCore = coreModuleOf("tms");
  if (tmsCore) modules.add(tmsCore.code);

  return {
    legalName,
    tradeName,
    cnpj,
    ownerName,
    ownerEmail,
    temporaryPassword,
    planCode: normalizeText(request.planCode || "BASIC").toUpperCase(),
    subscriptionPeriod: normalizeText(request.subscriptionPeriod) || "Mensal",
    maxVehicles,
    tenantSlug,
    workspaceName: tradeName || legalName,
    workspaceSlug: tenantSlug,
    products: productCodes,
    modules: [...modules],
  };
}
