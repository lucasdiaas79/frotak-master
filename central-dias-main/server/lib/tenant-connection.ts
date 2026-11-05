import { AsyncLocalStorage } from "node:async_hooks";

// Banco por cliente: o endereço diz quem é o cliente, e o agente da VPS de banco diz como chegar
// nele. Cada requisição roda com a conexão do seu cliente. Sem FROTAK_AGENT_URL, vale o banco único
// das variáveis de ambiente, como na produção atual.

export type TenantConnection = {
  slug: string;
  name: string | null;
  internalUrl: string;
  publicUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const HIT_TTL_MS = 30_000;
const MISS_TTL_MS = 5_000;

const currentRequest = new AsyncLocalStorage<TenantConnection>();
const cache = new Map<string, { connection: TenantConnection | null; expiresAt: number }>();

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isClientDatabaseMode() {
  return Boolean(readEnv("FROTAK_AGENT_URL"));
}

export function runWithConnection<T>(connection: TenantConnection, work: () => T) {
  return currentRequest.run(connection, work);
}

export function serverSupabaseUrl() {
  return (
    currentRequest.getStore()?.internalUrl ??
    readEnv("SUPABASE_URL") ??
    readEnv("VITE_SUPABASE_URL")
  );
}

export function serverAnonKey() {
  return (
    currentRequest.getStore()?.anonKey ??
    readEnv("SUPABASE_ANON_KEY") ??
    readEnv("VITE_SUPABASE_ANON_KEY")
  );
}

export function serverServiceRoleKey() {
  return currentRequest.getStore()?.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/** `acme.frotak.log.br` vira `acme`. Subnível e endereço de fora do domínio não são cliente. */
export function slugFromHost(host: string | null | undefined) {
  const base = readEnv("FROTAK_CLIENT_BASE_DOMAIN")?.toLowerCase();
  if (!base || !host) return null;
  const name = host.toLowerCase().split(":")[0];
  if (!name.endsWith(`.${base}`)) return null;
  const label = name.slice(0, -(base.length + 1));
  return SLUG_PATTERN.test(label) ? label : null;
}

/** null: não existe cliente com esse endereço. Lança erro: o agente está fora do ar. */
export async function connectionForSlug(slug: string) {
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;

  let response: Response;
  try {
    response = await fetch(`${readEnv("FROTAK_AGENT_URL")}/clients/${slug}/connection`, {
      headers: { Authorization: `Bearer ${readEnv("FROTAK_AGENT_TOKEN")}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    // Agente fora do ar não derruba quem já estava conectado.
    if (cached?.connection) return cached.connection;
    throw error;
  }

  if (response.status === 400 || response.status === 404) {
    cache.set(slug, { connection: null, expiresAt: Date.now() + MISS_TTL_MS });
    return null;
  }
  if (!response.ok) {
    if (cached?.connection) return cached.connection;
    throw new Error(`Agente respondeu ${response.status}`);
  }

  const connection = (await response.json()) as TenantConnection;
  cache.set(slug, { connection, expiresAt: Date.now() + HIT_TTL_MS });
  return connection;
}

/** Script que o navegador carrega antes do app: só o que já é público de cada cliente. */
export function browserConfigScript(connection: TenantConnection) {
  const config = JSON.stringify({
    slug: connection.slug,
    name: connection.name,
    supabaseUrl: connection.publicUrl,
    anonKey: connection.anonKey,
  }).replace(/</g, "\\u003c");
  return `window.__FROTAK_CLIENT__=${config};`;
}
