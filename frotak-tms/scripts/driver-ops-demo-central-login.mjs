// Cria o login de dono da central para o tenant de demonstracao da operacao com embarcador
// (operacao-embarcador-demo). So cria perfil e vinculo nesse workspace.
//
// Uso (na pasta frotak-tms, com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no env):
//   node --env-file=<.env> scripts/driver-ops-demo-central-login.mjs <senha (8+)>

import { createClient } from "@supabase/supabase-js";

const TENANT_SLUG = "operacao-embarcador-demo";
const EMAIL = "central.demo@frotak.local";
const NAME = "Central Demo";

const [password] = process.argv.slice(2);
if (!password || password.length < 8) {
  console.error(
    "Uso: node --env-file=<.env> scripts/driver-ops-demo-central-login.mjs <senha (8+)>",
  );
  process.exit(1);
}
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Faltam SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no ambiente.",
  );
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(email) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertUser(email, password, extra) {
  const existing = await findUser(email);
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      ...extra,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...extra,
  });
  if (error) throw error;
  return data.user.id;
}

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const tenant = must(
  await db.from("tenants").select("id").eq("slug", TENANT_SLUG).single(),
  "tenant",
);
const workspace = must(
  await db
    .from("workspaces")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("is_default", true)
    .single(),
  "workspace",
);
const userId = await upsertUser(EMAIL, password, { user_metadata: { full_name: NAME } });
must(
  await db.from("profiles").upsert({
    id: userId,
    full_name: NAME,
    email: EMAIL,
    active: true,
    must_change_password: false,
  }),
  "perfil",
);
must(
  await db.from("workspace_memberships").upsert(
    {
      workspace_id: workspace.id,
      user_id: userId,
      status: "active",
      is_owner: true,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,user_id" },
  ),
  "vinculo com o workspace",
);
console.log(JSON.stringify({ tenant: tenant.id, workspace: workspace.id, email: EMAIL }, null, 2));
