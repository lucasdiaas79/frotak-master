import { DomainError } from "@/core/domain/domain-error";
import {
  audienceRoles,
  changeOps,
  fieldOf,
  opsFor,
  sourceOf,
  triggerWatchesChanges,
  valuelessOps,
  type CatalogSource,
  type ConditionOp,
  type NotificationSource,
  type TriggerKind,
} from "@/modules/notifications/domain/catalog";

export type ConditionValue = string | number | boolean | string[];

export type NotificationCondition = {
  field: string;
  op: ConditionOp;
  value?: ConditionValue;
};

/** Regra como fica no banco (Central e, no banco por cliente, copiada para cada cliente). */
export type NotificationRule = {
  id: string;
  /** null: vale para todos os clientes. */
  tenantId: string | null;
  name: string;
  description: string | null;
  source: NotificationSource;
  triggerKind: TriggerKind;
  watchFields: string[];
  conditions: NotificationCondition[];
  titleTemplate: string;
  bodyTemplate: string;
  linkPath: string | null;
  audienceRoles: string[];
  pushDefault: boolean;
  active: boolean;
  updatedAt: string | null;
};

export type NotificationRuleDraft = Omit<NotificationRule, "id" | "updatedAt"> & { id?: string };

/** Cliente para escolher o alcance de uma regra. */
export type TenantOption = { id: string; name: string };

export type DistributionReport = {
  /** Quantos bancos de cliente receberam a copia (0 no banco unico: nao ha copia a fazer). */
  clients: number;
  /** Clientes que nao receberam (fora do ar, por exemplo). A proxima gravacao tenta de novo. */
  failures: Array<{ client: string; message: string }>;
};

const LINK_PATH = /^\/[A-Za-z0-9/_.=&%-]*$/;
const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;
const ROLE_CODES = new Set(audienceRoles.map((role) => role.value));

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

export function placeholdersOf(template: string) {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCondition(
  source: CatalogSource,
  trigger: TriggerKind,
  condition: NotificationCondition,
  index: number,
): NotificationCondition {
  const position = `Condição ${index + 1}`;
  const field = fieldOf(source, condition?.field);
  if (!field) invalid(`${position}: escolha um campo de ${source.label}.`);
  if (!opsFor(field, trigger).includes(condition.op)) {
    if (changeOps.includes(condition.op)) {
      invalid(`${position}: "mudou" só existe quando a regra observa alterações.`);
    }
    invalid(`${position}: comparação inválida para ${field.label}.`);
  }
  if (valuelessOps.includes(condition.op)) return { field: field.key, op: condition.op };

  const value = condition.value;
  if (condition.op === "in" || condition.op === "not_in") {
    const list = (Array.isArray(value) ? value : []).map(String).filter(Boolean);
    if (list.length === 0) invalid(`${position}: escolha ao menos uma opção de ${field.label}.`);
    if (
      field.options &&
      list.some((item) => !field.options?.some((option) => option.value === item))
    ) {
      invalid(`${position}: opção desconhecida em ${field.label}.`);
    }
    return { field: field.key, op: condition.op, value: [...new Set(list)] };
  }
  if (condition.op === "within_days") {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      invalid(`${position}: informe de 1 a 365 dias.`);
    }
    return { field: field.key, op: condition.op, value: days };
  }
  if (field.type === "number") {
    const number = Number(value);
    if (value === "" || value === undefined || value === null || !Number.isFinite(number)) {
      invalid(`${position}: informe um número em ${field.label}.`);
    }
    return { field: field.key, op: condition.op, value: number };
  }
  if (field.type === "boolean") {
    const flag =
      value === true || value === "true"
        ? "true"
        : value === false || value === "false"
          ? "false"
          : "";
    if (!flag) invalid(`${position}: escolha Sim ou Não.`);
    return { field: field.key, op: condition.op, value: flag };
  }
  const text = cleanText(value);
  if (!text) invalid(`${position}: informe o valor de ${field.label}.`);
  if (field.options && !field.options.some((option) => option.value === text)) {
    invalid(`${position}: opção desconhecida em ${field.label}.`);
  }
  if (text.length > 120) invalid(`${position}: valor longo demais.`);
  return { field: field.key, op: condition.op, value: text };
}

/**
 * Confere e normaliza uma regra antes de gravar. A mensagem diz o primeiro problema, do jeito que
 * o operador do Master entende. O banco tem as mesmas travas basicas (check constraints).
 */
export function validateRule(input: NotificationRuleDraft): NotificationRuleDraft {
  const name = cleanText(input?.name);
  if (name.length < 3 || name.length > 120) invalid("Dê um nome à regra (3 a 120 letras).");

  const source = sourceOf(input.source);
  if (!source) invalid("Escolha o que a regra observa.");
  if (!source.triggers.includes(input.triggerKind)) {
    invalid(`${source.label}: escolha quando a regra dispara.`);
  }

  const watchFields = triggerWatchesChanges(input.triggerKind)
    ? [...new Set((input.watchFields ?? []).filter(Boolean))]
    : [];
  const unknownWatch = watchFields.find((key) => !fieldOf(source, key));
  if (unknownWatch) invalid(`Campo observado desconhecido: ${unknownWatch}.`);

  const conditions = (input.conditions ?? []).map((condition, index) =>
    normalizeCondition(source, input.triggerKind, condition, index),
  );
  if (input.triggerKind === "schedule" && conditions.length === 0) {
    invalid("Regra sobre o dado do banco precisa de ao menos uma condição (senão avisa tudo).");
  }
  if (conditions.length > 10) invalid("Use no máximo 10 condições.");

  const titleTemplate = cleanText(input.titleTemplate);
  const bodyTemplate = cleanText(input.bodyTemplate);
  if (!titleTemplate || titleTemplate.length > 140)
    invalid("Escreva o título do aviso (até 140 letras).");
  if (bodyTemplate.length > 500) invalid("O texto do aviso pode ter até 500 letras.");
  const unknownPlaceholder = [
    ...placeholdersOf(titleTemplate),
    ...placeholdersOf(bodyTemplate),
  ].find((key) => !fieldOf(source, key));
  if (unknownPlaceholder) {
    invalid(`O campo {{${unknownPlaceholder}}} não existe em ${source.label}.`);
  }

  const linkPath = cleanText(input.linkPath) || null;
  if (linkPath && (!LINK_PATH.test(linkPath) || linkPath.startsWith("//"))) {
    invalid("O destino do aviso precisa ser uma tela do sistema, como /operacao.");
  }

  const roles = [...new Set(input.audienceRoles ?? [])];
  if (roles.some((role) => !ROLE_CODES.has(role))) invalid("Papel desconhecido em quem recebe.");

  const description = cleanText(input.description) || null;
  if (description && description.length > 300) invalid("A descrição pode ter até 300 letras.");

  return {
    ...(input.id ? { id: input.id } : {}),
    tenantId: input.tenantId || null,
    name,
    description,
    source: source.key,
    triggerKind: input.triggerKind,
    watchFields,
    conditions,
    titleTemplate,
    bodyTemplate,
    linkPath,
    audienceRoles: roles,
    pushDefault: input.pushDefault !== false,
    active: input.active !== false,
  };
}

/**
 * Previa do aviso com os valores de exemplo, igual ao que o banco monta
 * (private.notification_render): {{campo}} vira o valor; [[ ... ]] some se algum campo de dentro
 * estiver vazio.
 */
export function renderPreview(template: string, values: Record<string, string>) {
  const valueOf = (key: string) => (values[key] ?? "").trim();
  const withOptional = template.replace(/\[\[(.*?)\]\]/g, (_, inner: string) =>
    placeholdersOf(inner).some((key) => !valueOf(key)) ? "" : inner,
  );
  return withOptional
    .replace(PLACEHOLDER, (_, key: string) => valueOf(key))
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyRuleDraft(): NotificationRuleDraft {
  return {
    tenantId: null,
    name: "",
    description: null,
    source: "freights",
    triggerKind: "update",
    watchFields: ["etapa"],
    conditions: [],
    titleTemplate: "Frete {{placa}}: {{etapa}}",
    bodyTemplate: "[[Motorista {{motorista}}.]]",
    linkPath: "/operacao",
    audienceRoles: [],
    pushDefault: true,
    active: true,
  };
}

/** Regras que vao para o banco de um cliente: as gerais e as dele. */
export function rulesForTenant(rules: NotificationRule[], tenantId: string) {
  return rules.filter((rule) => rule.tenantId === null || rule.tenantId === tenantId);
}
