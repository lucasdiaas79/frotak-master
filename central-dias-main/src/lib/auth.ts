import type { Session, User } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

const LOCAL_AUTH_KEY = "central-client-local-session";
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const CENTRAL_DEMO_EMAIL = "admin@central.com.br";
const CENTRAL_DEMO_PASSWORD = "123456";
const MASTER_SSO_SOURCE = "frotak-master";

interface ProfileRow {
  id: string;
  tenant_id?: string | null;
  name: string | null;
  email: string | null;
  role: Profile["role"] | null;
  active: boolean | null;
  created_at?: string;
  updated_at?: string;
}

function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? "00000000-0000-0000-0000-000000000001",
    name: row.name ?? "",
    email: row.email ?? "",
    role: row.role ?? "operador",
    active: row.active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type LocalSession = {
  user: User;
  profile: Profile;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLocalSession(): LocalSession | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(LOCAL_AUTH_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LocalSession;
  } catch {
    return null;
  }
}

function saveLocalSession(session: LocalSession) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(session));
  window.localStorage.setItem("frotak-active-tenant-id", session.profile.tenantId);
  window.localStorage.setItem("frotak-active-tenant-name", session.profile.name);
}

export function shouldUseLocalTenantData() {
  if (!canUseStorage()) return !hasSupabaseConfig();

  const session = readLocalSession();
  if (!session) return !hasSupabaseConfig();

  const tenantId = session.profile.tenantId || DEFAULT_TENANT_ID;
  const tenantName = session.profile.name.toLowerCase();

  return tenantId !== DEFAULT_TENANT_ID && !tenantName.includes("central");
}

export function getActiveTenantId() {
  if (!canUseStorage()) return DEFAULT_TENANT_ID;
  const localSession = readLocalSession();
  if (localSession?.profile.name.toLowerCase().includes("central")) {
    return DEFAULT_TENANT_ID;
  }

  return (
    localSession?.profile.tenantId ||
    window.localStorage.getItem("frotak-active-tenant-id") ||
    DEFAULT_TENANT_ID
  );
}

function createLocalSession(input: {
  email: string;
  name: string;
  tenantId: string;
  userId?: string;
}): LocalSession {
  const id = input.userId || input.tenantId || DEFAULT_TENANT_ID;
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: input.email,
    app_metadata: {},
    user_metadata: {
      tenant_id: input.tenantId,
      tenant_name: input.name,
      role: "admin",
    },
    created_at: new Date().toISOString(),
  } as User;

  return {
    user,
    profile: {
      id,
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      role: "admin",
      active: true,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function acceptMasterSsoFromUrl(search: string) {
  if (!canUseStorage()) return null;
  const params = new URLSearchParams(search);
  const token = params.get("sso_token");
  const refreshToken = params.get("refresh_token");
  const source = params.get("source");

  if (!token || source !== "frotak-master") return readLocalSession();

  const tenantId = params.get("tenant_id") || DEFAULT_TENANT_ID;
  const clientName = params.get("client_name") || "Central Transportes";
  const email = params.get("login_hint") || CENTRAL_DEMO_EMAIL;
  let userId: string | undefined;

  if (hasSupabaseConfig() && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: token,
      refresh_token: refreshToken,
    });
    if (error || !data.session?.user) throw error ?? new Error("Sessao SSO invalida.");
    userId = data.session.user.id;
  }

  const session = createLocalSession({ email, name: clientName, tenantId, userId });

  saveLocalSession(session);
  window.localStorage.setItem("frotak-sso-source", MASTER_SSO_SOURCE);
  window.history.replaceState(null, "", window.location.pathname);
  return session;
}

export async function getSession(): Promise<Session | null> {
  const local = readLocalSession();
  if (local) {
    return {
      access_token: "local-dev-token",
      token_type: "bearer",
      expires_in: 28800,
      expires_at: Math.floor(Date.now() / 1000) + 28800,
      refresh_token: "local-dev-refresh",
      user: local.user,
    } as Session;
  }

  if (!hasSupabaseConfig()) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function isAuthed(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session?.user);
}

export async function signIn(email: string, password: string) {
  if (!hasSupabaseConfig()) {
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== CENTRAL_DEMO_EMAIL || password !== CENTRAL_DEMO_PASSWORD) {
      throw new Error("Credenciais invalidas.");
    }

    const session = createLocalSession({
      email: CENTRAL_DEMO_EMAIL,
      name: "Central Transportes",
      tenantId: DEFAULT_TENANT_ID,
    });
    saveLocalSession(session);
    return { user: session.user, session: await getSession() };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (canUseStorage()) {
    window.localStorage.removeItem(LOCAL_AUTH_KEY);
    window.localStorage.removeItem("frotak-sso-source");
  }

  if (!hasSupabaseConfig() || shouldUseLocalTenantData()) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const local = readLocalSession();
  if (local && local.user.id === userId) return local.profile;
  if (!hasSupabaseConfig()) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? profileFromRow(data) : null;
}

export async function getCurrentUser(): Promise<User | null> {
  const local = readLocalSession();
  if (local) return local.user;
  if (!hasSupabaseConfig()) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}
