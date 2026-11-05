// Banco por cliente: o endereço diz quem é o cliente, e o agente da VPS de banco diz de quem ele é
// e como chegar no banco. Vale o subdomínio da FrotaK e o domínio próprio do cliente. Cada requisição roda com a conexão do seu cliente. Sem FROTAK_AGENT_URL, vale o banco único
// das variáveis de ambiente, como na produção atual.

export type TenantConnection = {
  slug: string;
  name: string | null;
  internalUrl: string;
  publicUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

const HOST_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HIT_TTL_MS = 30_000;
const MISS_TTL_MS = 5_000;

// O armazenamento por requisição nasce em src/server.ts, a entrada do servidor. Este arquivo chega
// ao pacote do navegador por tabela e não pode importar nada de Node.
type RequestStore = { getStore(): TenantConnection | undefined };
const STORE_KEY = "__FROTAK_TENANT_STORE__";

export function setRequestStore(store: RequestStore) {
  (globalThis as Record<string, unknown>)[STORE_KEY] = store;
}

function currentConnection() {
  return (
    (globalThis as Record<string, unknown>)[STORE_KEY] as RequestStore | undefined
  )?.getStore();
}

const cache = new Map<string, { connection: TenantConnection | null; expiresAt: number }>();

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isClientDatabaseMode() {
  return Boolean(readEnv("FROTAK_AGENT_URL"));
}

export function serverSupabaseUrl() {
  return (
    currentConnection()?.internalUrl ?? readEnv("SUPABASE_URL") ?? readEnv("VITE_SUPABASE_URL")
  );
}

export function serverAnonKey() {
  return (
    currentConnection()?.anonKey ??
    readEnv("SUPABASE_ANON_KEY") ??
    readEnv("VITE_SUPABASE_ANON_KEY")
  );
}

export function serverServiceRoleKey() {
  return currentConnection()?.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/** Nome do host sem porta e sem ponto final; null quando não parece um domínio. */
export function normalizeHost(host: string | null | undefined) {
  if (!host) return null;
  const name = host.trim().toLowerCase().split(":")[0].replace(/\.$/, "");
  return HOST_PATTERN.test(name) ? name : null;
}

/** null: nenhum cliente usa esse endereço. Lança erro: o agente está fora do ar. */
export async function connectionForHost(host: string) {
  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;

  let response: Response;
  try {
    response = await fetch(
      `${readEnv("FROTAK_AGENT_URL")}/resolve?host=${encodeURIComponent(host)}`,
      {
        headers: { Authorization: `Bearer ${readEnv("FROTAK_AGENT_TOKEN")}` },
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch (error) {
    // Agente fora do ar não derruba quem já estava conectado.
    if (cached?.connection) return cached.connection;
    throw error;
  }

  if (response.status === 400 || response.status === 404) {
    cache.set(host, { connection: null, expiresAt: Date.now() + MISS_TTL_MS });
    return null;
  }
  if (!response.ok) {
    if (cached?.connection) return cached.connection;
    throw new Error(`Agente respondeu ${response.status}`);
  }

  const connection = (await response.json()) as TenantConnection;
  cache.set(host, { connection, expiresAt: Date.now() + HIT_TTL_MS });
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
