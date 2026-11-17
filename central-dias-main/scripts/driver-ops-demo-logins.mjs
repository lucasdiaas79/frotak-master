// Cria os logins da demonstracao da operacao com embarcador, depois do
// supabase/scripts/driver_ops_demo_tenant.sql:
//   - motorista "Motorista Demo" (telefone (00) 00000-0001) no app do motorista;
//   - usuario do portal do embarcador "Cervejaria Exemplo".
//
// Uso (na pasta central-dias-main, com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env):
//   node --env-file=.env scripts/driver-ops-demo-logins.mjs <senha-motorista> <senha-embarcador>
//
// Idempotente: se o login existe, so atualiza a senha e o vinculo. Nao mexe em outro tenant.

import { createClient } from "@supabase/supabase-js";

const TENANT_SLUG = "operacao-embarcador-demo";
const DRIVER_PHONE = "+5500000000001";
const DRIVER_EMAIL = "5500000000001@driver.frotak.local";
const SHIPPER_CNPJ = "11222333000181";
const SHIPPER_EMAIL = "embarcador.demo@frotak.local";

const [driverPassword, shipperPassword] = process.argv.slice(2);
if (
  !driverPassword ||
  driverPassword.length < 6 ||
  !shipperPassword ||
  shipperPassword.length < 8
) {
  console.error(
    "Uso: node --env-file=.env scripts/driver-ops-demo-logins.mjs <senha-motorista (6+)> <senha-embarcador (8+)>",
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
  "tenant (rode antes o driver_ops_demo_tenant.sql)",
);
const driver = must(
  await db
    .from("drivers")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .eq("name", "Motorista Demo")
    .single(),
  "motorista",
);

const driverUserId = await upsertUser(DRIVER_EMAIL, driverPassword, {
  phone: DRIVER_PHONE,
  phone_confirm: true,
  user_metadata: { full_name: driver.name, role: "driver", tenant_id: tenant.id },
});
must(
  await db.from("profiles").upsert({
    id: driverUserId,
    full_name: driver.name,
    phone: DRIVER_PHONE,
    email: DRIVER_EMAIL,
    active: true,
    must_change_password: false,
  }),
  "perfil do motorista",
);
must(
  await db
    .from("drivers")
    .update({ auth_user_id: driverUserId, phone: DRIVER_PHONE })
    .eq("id", driver.id),
  "vinculo do motorista",
);

const shipper = must(
  await db.from("shippers").select("id, trade_name").eq("cnpj", SHIPPER_CNPJ).single(),
  "embarcador",
);
const shipperUserId = await upsertUser(SHIPPER_EMAIL, shipperPassword, {
  user_metadata: { full_name: "Embarcador Demo" },
});
must(
  await db.from("shipper_members").upsert(
    {
      shipper_id: shipper.id,
      user_id: shipperUserId,
      full_name: "Embarcador Demo",
      role: "admin",
      status: "active",
    },
    { onConflict: "user_id" },
  ),
  "membro do embarcador",
);

console.log(
  JSON.stringify(
    {
      tenant: tenant.id,
      motorista: { login_telefone: "(00) 00000-0001", email_interno: DRIVER_EMAIL },
      embarcador: { email: SHIPPER_EMAIL, empresa: shipper.trade_name },
    },
    null,
    2,
  ),
);
