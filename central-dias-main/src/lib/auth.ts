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
  name?: string | null;
  full_name?: string | null;
  email: string | null;
  role?: Profile["role"] | null;
  active: boolean | null;
  created_at?: string;
  updated_at?: string;
}

interface MembershipProfileRow {
  workspace_id?: string;
  is_owner?: boolean;
  status: string;
  workspaces:
    | {
        tenant_id: string;
        name: string | null;
        tenants:
          | {
              legal_name: string | null;
              trade_name: string | null;
            }
          | Array<{
              legal_name: string | null;
              trade_name: string | null;
            }>
          | null;
      }
    | Array<{
        tenant_id: string;
        name: string | null;
        tenants:
          | {
              legal_name: string | null;
              trade_name: string | null;
            }
          | Array<{
              legal_name: string | null;
              trade_name: string | null;
            }>
          | null;
      }>
    | null;
}

function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? "00000000-0000-0000-0000-000000000001",
    name: row.name ?? row.full_name ?? "",
    email: row.email ?? "",
    role: row.role ?? "operador",
    active: row.active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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
  return !hasSupabaseConfig();
}

export function getActiveTenantId() {
  if (!canUseStorage()) return DEFAULT_TENANT_ID;
  const localSession = readLocalSession();

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
      isOwner: false,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function acceptMasterSsoFromUrl(search: string) {
  if (!canUseStorage()) return null;
  const params = new URLSearchParams(search);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  for (const [key, value] of hashParams.entries()) {
    if (!params.has(key)) params.set(key, value);
  }
  const token = params.get("sso_token");
  const refreshToken = params.get("refresh_token");
  const source = params.get("source");

  if (!token || source !== "frotak-master") return readLocalSession();

  const tenantId = params.get("tenant_id") || DEFAULT_TENANT_ID;
  const clientName = params.get("client_name") || "Central Transportes";
  const email = params.get("login_hint") || CENTRAL_DEMO_EMAIL;
  let userId: string | undefined;

  if (hasSupabaseConfig() && refreshToken) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      userId = data.session?.user.id;
    } catch {
      console.warn("Master SSO Supabase session was not persisted; using tenant session.");
    }
  }

  const session = createLocalSession({ email, name: clientName, tenantId, userId });

  saveLocalSession(session);
  window.localStorage.setItem("frotak-sso-source", MASTER_SSO_SOURCE);
  window.history.replaceState(null, "", window.location.pathname);
  return session;
}

export function getMasterLoginUrl() {
  const configuredUrl = import.meta.env.VITE_FROTAK_MASTER_LOGIN_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim()) return configuredUrl.trim();

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${window.location.protocol}//${hostname}:5173/login`;
    }
  }

  return "https://login.frotak.log.br";
}

export async function getSession(): Promise<Session | null> {
  if (hasSupabaseConfig()) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;
  }

  const local = readLocalSession();
  return local ? localSessionToSupabaseSession(local) : null;
}

export async function getCurrentAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
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
  if (!hasSupabaseConfig()) {
    const local = readLocalSession();
    if (local && local.user.id === userId) return local.profile;
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select(
      "workspace_id, status, is_owner, workspaces(tenant_id, name, tenants(legal_name, trade_name))",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle<MembershipProfileRow>();
  if (membershipError) throw membershipError;

  const workspace = firstRelation(membership?.workspaces);
  const tenant = firstRelation(workspace?.tenants);
  const tenantId = workspace?.tenant_id;
  const tenantName =
    tenant?.trade_name || tenant?.legal_name || workspace?.name || profile.full_name;
  const baseProfile = profileFromRow({
    ...profile,
    tenant_id: tenantId,
    name: tenantName,
  });

  return {
    ...baseProfile,
    workspaceId: membership?.workspace_id,
    isOwner: membership?.is_owner === true,
  };
}

export async function getCurrentUser(): Promise<User | null> {
  if (hasSupabaseConfig()) {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return data.user;
  }

  const local = readLocalSession();

  if (local) return local.user;
  return null;
}

function localSessionToSupabaseSession(local: LocalSession): Session {
  return {
    access_token: "frotak-master-sso-token",
    token_type: "bearer",
    expires_in: 28800,
    expires_at: Math.floor(Date.now() / 1000) + 28800,
    refresh_token: "frotak-master-sso-refresh",
    user: local.user,
  } as Session;
}
