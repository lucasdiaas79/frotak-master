import { createClient } from "@supabase/supabase-js";

type RuntimeClient = { slug: string; name: string | null; supabaseUrl: string; anonKey: string };

declare global {
  interface Window {
    __FROTAK_CLIENT__?: RuntimeClient;
  }
}

/** Banco por cliente: as chaves vêm do servidor, por endereço (/frotak-client.js), antes do app. */
export const isClientDatabaseBuild = import.meta.env.VITE_FROTAK_MULTI_DB === "true";

export function runtimeClient() {
  return typeof window === "undefined" ? undefined : window.__FROTAK_CLIENT__;
}

const client = runtimeClient();
// Sem as chaves do cliente, não há banco nenhum para conectar. Nunca cai no banco de outro.
const supabaseUrl = isClientDatabaseBuild
  ? (client?.supabaseUrl ?? "http://127.0.0.1:9")
  : (import.meta.env.VITE_SUPABASE_URL as string | undefined) || undefined;
const supabaseAnonKey = isClientDatabaseBuild
  ? (client?.anonKey ?? "sem-cliente")
  : (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || undefined;
const fallbackSupabaseUrl = "http://127.0.0.1:54321";
const fallbackSupabaseAnonKey = "local-dev-anon-key";

function authStorageKey(url: string) {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "frotak-supabase-auth-token";
  }
}

export const supabaseAuthStorageKey = authStorageKey(supabaseUrl ?? fallbackSupabaseUrl);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(
  supabaseUrl ?? fallbackSupabaseUrl,
  supabaseAnonKey ?? fallbackSupabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: supabaseAuthStorageKey,
    },
  },
);

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
