import { createClient } from "@supabase/supabase-js";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function hasSupabaseAdminConfig() {
  return Boolean(
    (readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL")) &&
      readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function getSupabaseAdmin() {
  return createClient(
    readEnv("SUPABASE_URL") || requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
