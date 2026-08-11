import { createFileRoute } from "@tanstack/react-router";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getServerSupabaseProjectRef() {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL") || "";
  return url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;
}

export const Route = createFileRoute("/api/workspace-users-diagnostics")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          serverSupabaseProjectRef: getServerSupabaseProjectRef(),
          hasServiceRole: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
        });
      },
    },
  },
});
