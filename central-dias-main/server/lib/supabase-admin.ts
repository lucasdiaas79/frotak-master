import { createClient } from "@supabase/supabase-js";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = readEnv("SUPABASE_URL");
const viteSupabaseUrl = readEnv("VITE_SUPABASE_URL");
const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

export function getSupabaseAdmin() {
  return createClient(
    supabaseUrl ?? requiredEnv("VITE_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

if ((!supabaseUrl && !viteSupabaseUrl) || !supabaseServiceRoleKey) {
  console.warn(
    "Supabase admin env vars are not fully configured. Set SUPABASE_URL or VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}
