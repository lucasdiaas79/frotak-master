// Administração de um cliente: cadastro, situação, endereço e o que foi criado para ele.
// Regras puras, sem I/O; testadas em Node puro (npm run test:client-admin).
import { DomainError } from "@/core/domain/domain-error";

export type ClientProfileInput = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  maxVehicles: number;
};

export type ClientStatusValue = "active" | "trial" | "suspended" | "cancelled";

export type CustomDomain = { host: string; addedAt: string };

export type ClientAddresses = {
  slug: string;
  subdomain: string;
  baseDomain: string;
  primaryHost: string;
  clientUrl: string;
  domains: CustomDomain[];
  serviceIp: string;
  apiUrl: string;
};

export type SubdomainCheck = {
  subdomain: string;
  host: string;
  baseDomain: string;
  serviceIp: string;
  available: boolean;
  reason: string;
};

export type AddressSettings = { baseDomain: string; serviceIp: string };

export type ProbeResult = { ok: boolean; detail: string };

export type AddressStatus = {
  host: string;
  kind: "subdomain" | "custom";
  dns: ProbeResult & { addresses: string[] };
  https: ProbeResult & { expiresAt: number | null };
  app: ProbeResult;
};

export type ClientLogin = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  system: boolean;
  owner: boolean;
  member: boolean;
  banned: boolean;
};

export type DatabaseRole = {
  name: string;
  canLogin: boolean;
  inherits: boolean;
  sessions: number;
  ownDatabase: boolean;
  otherDatabases: string[];
};

export type ClientResources = {
  slug: string;
  createdAt: string | null;
  tenantId: string | null;
  workspaceId: string | null;
  addresses: ClientAddresses;
  database: {
    name: string;
    sizeBytes: number;
    connections: number;
    publicCanConnect: boolean;
    roles: DatabaseRole[];
    slot: { name: string; active: boolean; lagBytes: number | null } | null;
    tenant: {
      name: string;
      legalName: string;
      tradeName: string | null;
      cnpj: string;
      status: string;
    } | null;
    publicTables: number;
    migrations: number;
    lastMigration: string | null;
    storageBuckets: number;
    storageObjects: number;
  };
  logins: ClientLogin[];
  containers: {
    name: string;
    state: string;
    health: string | null;
    startedAt: string | null;
    image: string | null;
  }[];
  gateway: { routes: string[]; consumers: string[] };
  probes: {
    auth: { status: number | null; ms: number };
    rest: { status: number | null; ms: number };
    storage: { status: number | null; ms: number };
    realtimeRegistered: boolean;
  };
  storage: { path: string; bytes: number };
  jobs: {
    name: string;
    schedule: string;
    active: boolean;
    lastStatus: string | null;
    lastRunAt: string | null;
  }[];
  backup: {
    copy: string;
    at: number;
    databaseBytes: number;
    filesBytes: number;
    copies: number;
  } | null;
  keys: { ownJwtSecret: boolean; anonKey: boolean; serviceRoleKey: boolean };
};

export type DnsRecord = {
  type: "A" | "CNAME";
  name: string;
  value: string;
  recommended: boolean;
  note: string;
};

export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const DOMAIN_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

export function validateClientProfile(input: ClientProfileInput): ClientProfileInput {
  const legalName = typeof input.legalName === "string" ? input.legalName.trim() : "";
  const tradeName = typeof input.tradeName === "string" ? input.tradeName.trim() : "";
  const cnpj = String(input.cnpj ?? "").replace(/\D/g, "");
  const maxVehicles = Number(input.maxVehicles);
  if (!legalName) invalid("Informe a razão social.");
  if (legalName.length > 200 || tradeName.length > 200)
    invalid("Use até 200 caracteres nos nomes.");
  if (cnpj.length !== 14) invalid("CNPJ inválido.");
  if (!Number.isInteger(maxVehicles) || maxVehicles < 1 || maxVehicles > 100_000) {
    invalid("Limite de veículos inválido.");
  }
  return { legalName, tradeName, cnpj, maxVehicles };
}

/** Texto livre vira um subdomínio válido: "Transportes São João" -> "transportes-sao-joao". */
export function toSubdomain(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function validateSubdomain(value: string) {
  const subdomain = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    invalid("Use de 1 a 40 letras minúsculas, números e hífen, sem hífen nas pontas.");
  }
  return subdomain;
}

export function normalizeDomain(value: string) {
  const host = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");
  if (!DOMAIN_PATTERN.test(host)) invalid("Domínio inválido. Exemplo: tms.suaempresa.com.br");
  return host;
}

export function isClientStatus(value: unknown): value is ClientStatusValue {
  return value === "active" || value === "trial" || value === "suspended" || value === "cancelled";
}

// Sufixos de dois níveis mais comuns para clientes no Brasil. Fora deles, o domínio registrado
// são os dois últimos rótulos.
const TWO_LEVEL_SUFFIXES = new Set([
  "com.br",
  "net.br",
  "org.br",
  "log.br",
  "ind.br",
  "eng.br",
  "app.br",
  "tec.br",
  "emp.br",
  "eco.br",
  "art.br",
  "agr.br",
  "srv.br",
  "inf.br",
  "tur.br",
  "adv.br",
  "gov.br",
  "edu.br",
  "co.uk",
  "com.ar",
  "com.mx",
  "com.pt",
  "com.co",
]);

/** Separa o domínio registrado (a zona do DNS) do nome a criar nela. */
export function splitDomain(host: string) {
  const labels = host.split(".");
  const suffix = labels.slice(-2).join(".");
  const zoneSize = TWO_LEVEL_SUFFIXES.has(suffix) ? 3 : 2;
  const zone = labels.slice(-zoneSize).join(".");
  const name = labels.slice(0, -zoneSize).join(".");
  return { zone, name: name || "@" };
}

/**
 * O que o cliente cria no DNS dele. Subdomínio: CNAME para o endereço da FrotaK, que segue
 * sozinho se o servidor mudar. Domínio principal (sem nada antes) não aceita CNAME: registro A.
 */
export function dnsRecordsFor(host: string, primaryHost: string, serviceIp: string): DnsRecord[] {
  const { name } = splitDomain(host);
  const apex = name === "@";
  const records: DnsRecord[] = [];
  if (!apex) {
    records.push({
      type: "CNAME",
      name,
      value: `${primaryHost}.`,
      recommended: true,
      note: "Acompanha a FrotaK se o servidor mudar de IP.",
    });
  }
  if (serviceIp) {
    records.push({
      type: "A",
      name,
      value: serviceIp,
      recommended: apex,
      note: apex
        ? "Domínio principal não aceita CNAME."
        : "Use só se o seu provedor não aceitar CNAME.",
    });
  }
  return records;
}

export type ResourceCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

const BACKUP_MAX_AGE_SECONDS = 26 * 3600;

/** O que foi criado para o cliente, item por item, com o que prova que está de pé. */
export function resourceChecklist(
  resources: ClientResources,
  nowSeconds = Date.now() / 1000,
): ResourceCheck[] {
  const { database, containers, gateway, probes, jobs, backup, logins } = resources;
  const createdAt = resources.createdAt ? Date.parse(resources.createdAt) / 1000 : 0;
  // Cliente com menos de um dia ainda não passou por um backup diário: não é falha.
  const backupDue = nowSeconds - createdAt > BACKUP_MAX_AGE_SECONDS;
  const backupRecent = Boolean(backup) && nowSeconds - (backup?.at ?? 0) < BACKUP_MAX_AGE_SECONDS;
  const isolated =
    database.roles.length === 3 &&
    database.roles.every((role) => role.ownDatabase && role.otherDatabases.length === 0);
  const leaking = database.roles.flatMap((role) => role.otherDatabases);
  const running = containers.filter(
    (container) => container.state === "running" && container.health !== "unhealthy",
  ).length;
  const owner = logins.find((login) => login.owner);
  const reachable = [probes.auth, probes.rest, probes.storage].every(
    (probe) => probe.status !== null && probe.status < 500,
  );
  return [
    {
      key: "database",
      label: "Banco de dados próprio",
      ok: database.publicTables > 0 && !database.publicCanConnect,
      detail: `${database.name}, ${database.publicTables} tabelas, ${database.migrations} migrations`,
    },
    {
      key: "roles",
      label: "Logins do banco",
      ok: isolated,
      detail: isolated
        ? "3 logins, cada um entra só neste banco"
        : leaking.length
          ? `Também entram em: ${[...new Set(leaking)].join(", ")}`
          : "Faltam logins ou acesso ao próprio banco",
    },
    {
      key: "services",
      label: "Serviços de login, API e arquivos",
      ok: running === containers.length && containers.length === 3,
      detail: `${running} de ${containers.length} rodando`,
    },
    {
      key: "gateway",
      label: "Rotas no portão (Kong)",
      ok: gateway.routes.length > 0 && gateway.consumers.length === 2 && reachable,
      detail: `${gateway.routes.length} rotas em /c/${resources.slug}, ${gateway.consumers.length} chaves de acesso`,
    },
    {
      key: "realtime",
      label: "Tempo real",
      // A leitura do banco só começa quando alguém abre o TMS; sem ninguém, ela não existe.
      ok: probes.realtimeRegistered,
      detail: probes.realtimeRegistered
        ? database.slot?.active
          ? "Registrado e lendo o banco"
          : "Registrado; começa a ler o banco quando alguém abre o TMS"
        : "Não registrado",
    },
    {
      key: "storage",
      label: "Pasta de arquivos",
      ok: database.storageBuckets >= 0 && Boolean(resources.storage.path),
      detail: `${database.storageObjects} arquivos em ${database.storageBuckets} pastas`,
    },
    {
      key: "jobs",
      label: "Agendamentos",
      ok: jobs.length === 3 && jobs.every((job) => job.active && job.lastStatus !== "failed"),
      detail: `${jobs.length} agendamentos${jobs.some((job) => job.lastStatus === "failed") ? ", com falha" : ""}`,
    },
    {
      key: "owner",
      label: "Login do administrador",
      ok: Boolean(owner),
      detail: owner ? owner.email : "Sem administrador ativo",
    },
    {
      key: "backup",
      label: "Backup",
      ok: backupRecent || (!backup && !backupDue),
      detail: backup
        ? backupRecent
          ? `Cópia ${backup.copy}`
          : `Última cópia ${backup.copy}, com mais de 26 h`
        : backupDue
          ? "Sem cópia, e o cliente já devia ter entrado no backup diário"
          : "Ainda sem cópia: entra no próximo backup diário, às 06:30 UTC",
    },
  ];
}
