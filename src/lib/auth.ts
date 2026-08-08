import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { clients, type Client } from "@/lib/mock";

const PLATFORM_SESSION_CACHE_KEY = "frotak-master-platform-session-cache";
const AUTH_USERS_STORAGE_KEY = "frotak-master-users";
const AUTH_EVENT = "frotak-auth-change";
const CLIENT_TOKEN_TTL_MS = 10 * 60 * 1000;

type AuthProvider = "supabase";
type UserScope = "master" | "client";
type UserStatus = "Ativo" | "Suspenso";
type PlatformRole = "super_admin" | "operations" | "support" | "read_only";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  team: string;
  status: UserStatus;
  scope: UserScope;
  clientId?: string;
  tenantId?: string;
  clientName?: string;
  clientUrl?: string;
  provider: AuthProvider;
  createdAt: string;
};

export type AuthSession = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  scope: "master";
  provider: AuthProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
};

export type AuthResult = {
  session: AuthSession | null;
  redirectTo: string;
  external: boolean;
};

export type AuthGateState =
  | { status: "LOADING"; session: null; message?: string }
  | { status: "AUTHENTICATED_PLATFORM_USER"; session: AuthSession; message?: string }
  | { status: "UNAUTHENTICATED"; session: null; message?: string }
  | { status: "UNAUTHORIZED"; session: null; message: string };

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: string;
  team?: string;
  scope: UserScope;
  clientId?: string;
  tenantId?: string;
  status?: UserStatus;
};

export type CreateClientAccessInput = {
  clientId: string;
  tenantId?: string;
  clientName: string;
  email: string;
  password: string;
  clientUrl?: string;
};

export const masterEmail = "Definido no Supabase Auth";
export const loginAccounts: Array<{ email: string; name: string; role: string; password: string }> = [];

type PlatformUserRow = {
  platform_role: PlatformRole;
  active: boolean;
};

type ClientMembershipRow = {
  workspace_id: string;
  status: string;
  workspaces:
    | {
        id: string;
        tenant_id: string;
        name: string;
        slug: string;
        tenants:
          | {
              id: string;
              slug: string;
              legal_name: string;
              trade_name: string | null;
              settings: Record<string, unknown> | null;
            }
          | Array<{
              id: string;
              slug: string;
              legal_name: string;
              trade_name: string | null;
              settings: Record<string, unknown> | null;
            }>
          | null;
      }
    | Array<{
        id: string;
        tenant_id: string;
        name: string;
        slug: string;
        tenants:
          | {
              id: string;
              slug: string;
              legal_name: string;
              trade_name: string | null;
              settings: Record<string, unknown> | null;
            }
          | Array<{
              id: string;
              slug: string;
              legal_name: string;
              trade_name: string | null;
              settings: Record<string, unknown> | null;
            }>
          | null;
      }>
    | null;
};

let browserSupabase: SupabaseClient | null = null;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getPublicEnv(name: string) {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getSupabaseBrowser() {
  if (browserSupabase) return browserSupabase;

  const url = getPublicEnv("VITE_SUPABASE_URL");
  const key =
    getPublicEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    getPublicEnv("VITE_SUPABASE_ANON_KEY");

  if (!url || !key) {
    throw new Error("Supabase Auth publico nao configurado.");
  }

  browserSupabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserSupabase;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createToken(payload: Record<string, unknown>) {
  return base64Url(
    JSON.stringify({
      ...payload,
      nonce: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
    }),
  );
}

function getClientAppUrl() {
  const configuredUrl = import.meta.env.VITE_FROTAK_CLIENT_APP_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim()) return configuredUrl.trim();

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:5174";
  }

  return "https://cliente.frotak.log.br";
}

function buildClientUrl(client: Client) {
  if (import.meta.env.VITE_FROTAK_USE_CLIENT_DOMAIN === "true") {
    return `https://${client.domain}`;
  }

  return getClientAppUrl();
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getStoredUsers(): ManagedUser[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(AUTH_USERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as ManagedUser[];
  } catch {
    return [];
  }
}

function saveStoredUsers(users: ManagedUser[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function savePlatformSession(session: AuthSession) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PLATFORM_SESSION_CACHE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function clearPlatformSessionCache() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PLATFORM_SESSION_CACHE_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function sessionFromPlatformUser(session: Session, row: PlatformUserRow): AuthSession {
  const user = session.user;
  const fullName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : user.email ?? "Usuario Master";

  return {
    id: user.id,
    email: user.email ?? "",
    name: fullName,
    role: row.platform_role,
    scope: "master",
    provider: "supabase",
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  };
}

async function validatePlatformSession(session: Session | null): Promise<AuthGateState> {
  if (!session?.user) {
    clearPlatformSessionCache();
    return { status: "UNAUTHENTICATED", session: null };
  }

  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("platform_users")
    .select("platform_role, active")
    .eq("user_id", session.user.id)
    .maybeSingle<PlatformUserRow>();

  if (error) {
    clearPlatformSessionCache();
    return {
      status: "UNAUTHORIZED",
      session: null,
      message: "Erro temporario de autenticacao.",
    };
  }

  const allowedRoles: PlatformRole[] = ["super_admin", "operations", "support", "read_only"];
  if (!data?.active || !allowedRoles.includes(data.platform_role)) {
    await supabase.auth.signOut();
    clearPlatformSessionCache();
    return {
      status: "UNAUTHORIZED",
      session: null,
      message: "Usuario sem acesso ao Frotak Master.",
    };
  }

  const authSession = sessionFromPlatformUser(session, data);
  savePlatformSession(authSession);
  return { status: "AUTHENTICATED_PLATFORM_USER", session: authSession };
}

export async function getPlatformAuthState(): Promise<AuthGateState> {
  try {
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      clearPlatformSessionCache();
      return {
        status: "UNAUTHENTICATED",
        session: null,
        message: "Sessao expirada.",
      };
    }

    return validatePlatformSession(data.session);
  } catch {
    clearPlatformSessionCache();
    return {
      status: "UNAUTHENTICATED",
      session: null,
      message: "Erro temporario de autenticacao.",
    };
  }
}

export function getSession(): AuthSession | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AuthSession;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      clearPlatformSessionCache();
      return null;
    }
    return session;
  } catch {
    clearPlatformSessionCache();
    return null;
  }
}

export async function getCurrentAccessToken() {
  const state = await getPlatformAuthState();
  return state.status === "AUTHENTICATED_PLATFORM_USER" ? state.session.accessToken : null;
}

export async function authenticate(email: string, password: string, fallbackRedirect = "/") {
  const supabase = getSupabaseBrowser();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (error) {
    clearPlatformSessionCache();
    if (/invalid login credentials|invalid credentials/i.test(error.message)) {
      return null;
    }
    throw new Error("Erro temporario de autenticacao.");
  }

  const session = signInData.session;
  if (!session?.user) {
    throw new Error("Erro temporario de autenticacao.");
  }

  const { data: platformUser, error: platformError } = await supabase
    .from("platform_users")
    .select("platform_role, active")
    .eq("user_id", session.user.id)
    .maybeSingle<PlatformUserRow>();

  if (!platformError && platformUser?.active) {
    const state = await validatePlatformSession(session);
    if (state.status !== "AUTHENTICATED_PLATFORM_USER") {
      throw new Error(state.message || "Usuario sem acesso ao Frotak Master.");
    }

    return {
      session: state.session,
      redirectTo: fallbackRedirect || "/",
      external: false,
    } satisfies AuthResult;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select(
      "workspace_id, status, workspaces(id, tenant_id, name, slug, tenants(id, slug, legal_name, trade_name, settings))",
    )
    .eq("user_id", session.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ClientMembershipRow>();

  if (membershipError) {
    await supabase.auth.signOut();
    throw new Error("Erro temporario de autenticacao.");
  }

  const workspace = firstRelation(membership?.workspaces);
  const tenant = firstRelation(workspace?.tenants);

  if (!workspace || !tenant) {
    await supabase.auth.signOut();
    throw new Error("Usuario sem acesso ao Master.");
  }

  const settings = tenant.settings ?? {};
  const clientUrl =
    typeof settings.clientUrl === "string" && settings.clientUrl.trim()
      ? settings.clientUrl.trim()
      : undefined;

  return {
    session: null,
    redirectTo: buildClientAccessUrl({
      clientUrl,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      clientId: tenant.id,
      tenantId: tenant.id,
      clientName: tenant.trade_name || tenant.legal_name || workspace.name,
      email: session.user.email ?? normalizeEmail(email),
    }),
    external: true,
  } satisfies AuthResult;
}

export async function logout() {
  const supabase = getSupabaseBrowser();
  await supabase.auth.signOut();
  clearPlatformSessionCache();
}

export function clearSession() {
  clearPlatformSessionCache();
}

export function subscribeToAuth(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const supabase = getSupabaseBrowser();
  const { data } = supabase.auth.onAuthStateChange(() => {
    callback();
  });
  const storageHandler = () => callback();
  window.addEventListener("storage", storageHandler);

  return () => {
    data.subscription.unsubscribe();
    window.removeEventListener("storage", storageHandler);
  };
}

export function getManagedUsers() {
  return getStoredUsers();
}

export function createManagedUser(input: CreateUserInput) {
  const users = getStoredUsers();
  const email = normalizeEmail(input.email);
  const exists = users.some((user) => normalizeEmail(user.email) === email);

  if (exists) {
    throw new Error("Ja existe um usuario com este e-mail.");
  }

  const client = clients.find((item) => item.id === input.clientId);
  if (!client) {
    throw new Error("Selecione um cliente para este usuario.");
  }

  const user: ManagedUser = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email,
    password: input.password,
    role: input.role.trim(),
    team: client.name,
    status: input.status ?? "Ativo",
    scope: "client",
    clientId: client.id,
    tenantId: input.tenantId,
    clientName: client.name,
    clientUrl: buildClientUrl(client),
    provider: "supabase",
    createdAt: new Date().toISOString(),
  };

  saveStoredUsers([...users, user]);
  return user;
}

export function createClientAccess(input: CreateClientAccessInput) {
  const email = normalizeEmail(input.email);

  const user: ManagedUser = {
    id: input.clientId,
    name: `Admin ${input.clientName}`,
    email,
    password: input.password,
    role: "Cliente administrador",
    team: input.clientName,
    status: "Ativo",
    scope: "client",
    clientId: input.clientId,
    tenantId: input.tenantId,
    clientName: input.clientName,
    clientUrl: input.clientUrl,
    provider: "supabase",
    createdAt: new Date().toISOString(),
  };
  const storedUsers = getStoredUsers().filter(
    (storedUser) =>
      storedUser.clientId !== input.clientId && normalizeEmail(storedUser.email) !== email,
  );

  saveStoredUsers([...storedUsers, user]);
  return user;
}

export function buildClientAccessUrl(session: {
  clientUrl?: string;
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  tenantId?: string;
  clientName?: string;
  email: string;
}) {
  const baseUrl = session.clientUrl || getClientAppUrl();
  const url = new URL(baseUrl);
  url.pathname = "/";
  url.hash = "";
  url.search = "";

  const handoffParams = new URLSearchParams();
  handoffParams.set("sso_token", session.accessToken);
  if (session.refreshToken) handoffParams.set("refresh_token", session.refreshToken);
  handoffParams.set("client_id", session.clientId || "");
  handoffParams.set("tenant_id", session.tenantId || session.clientId || "");
  handoffParams.set("client_name", session.clientName || "");
  handoffParams.set("login_hint", session.email);
  handoffParams.set("source", "frotak-master");
  url.hash = handoffParams.toString();

  return url.toString();
}

export function createClientImpersonationUrl(
  client: Client & { tenantId?: string; loginEmail?: string },
) {
  const masterSession = getSession();
  const expiresAt = new Date(Date.now() + CLIENT_TOKEN_TTL_MS).toISOString();
  const tenantId = client.tenantId || client.id;
  const token = createToken({
    type: "impersonation",
    actorEmail: masterSession?.email,
    actorName: masterSession?.name,
    clientId: client.id,
    tenantId,
    clientName: client.name,
    exp: expiresAt,
  });
  const url = new URL(buildClientUrl(client));

  url.searchParams.set("sso_token", token);
  url.searchParams.set("client_id", client.id);
  url.searchParams.set("tenant_id", tenantId);
  url.searchParams.set("client_name", client.name);
  url.searchParams.set("login_hint", client.loginEmail || "");
  url.searchParams.set("source", "frotak-master");
  url.searchParams.set("mode", "impersonation");

  return url.toString();
}
