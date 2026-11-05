import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { clients, type Client } from "@/lib/mock";

const PLATFORM_SESSION_CACHE_KEY = "frotak-master-platform-session-cache";
const AUTH_USERS_STORAGE_KEY = "frotak-master-users";
const AUTH_EVENT = "frotak-auth-change";

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

export type MfaStep = { kind: "enroll" } | { kind: "verify"; factorId: string };

export type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export type AuthResult = {
  session: AuthSession | null;
  redirectTo: string;
  external: boolean;
  /** Equipe FrotaK: a senha passou, mas ainda falta o segundo fator. */
  mfa?: MfaStep;
};

export type AuthGateState =
  | { status: "LOADING"; session: null; message?: string }
  | { status: "AUTHENTICATED_PLATFORM_USER"; session: AuthSession; message?: string }
  | { status: "UNAUTHENTICATED"; session: null; message?: string }
  | { status: "MFA_REQUIRED"; session: null; message?: string }
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

export const masterEmail = "Definido no Supabase Auth";
export const loginAccounts: Array<{ email: string; name: string; role: string; password: string }> =
  [];

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
    getPublicEnv("VITE_SUPABASE_PUBLISHABLE_KEY") || getPublicEnv("VITE_SUPABASE_ANON_KEY");

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

function getClientAppUrl() {
  const configuredUrl = import.meta.env.VITE_FROTAK_CLIENT_APP_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim()) return configuredUrl.trim();

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:5174";
  }

  return "https://cliente.frotak.log.br";
}

function isLocalMasterHost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
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
      : (user.email ?? "Usuario Master");

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

  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal2") {
    clearPlatformSessionCache();
    return { status: "MFA_REQUIRED", session: null };
  }

  const authSession = sessionFromPlatformUser(session, data);
  savePlatformSession(authSession);
  return { status: "AUTHENTICATED_PLATFORM_USER", session: authSession };
}

/** O que falta para a sessão atual da equipe chegar ao segundo fator; null se nada falta. */
async function getPendingMfaStep(): Promise<MfaStep | null> {
  const supabase = getSupabaseBrowser();
  const { data: level, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error("Erro temporario de autenticacao.");
  if (level.currentLevel === "aal2") return null;

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new Error("Erro temporario de autenticacao.");

  const verified = factors.totp[0];
  return verified ? { kind: "verify", factorId: verified.id } : { kind: "enroll" };
}

/** Quem voltou ao login com a senha já confirmada retoma direto no segundo fator. */
export async function resumePendingMfa(): Promise<MfaStep | null> {
  try {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return null;

    const { data: platformUser } = await supabase
      .from("platform_users")
      .select("platform_role, active")
      .eq("user_id", data.session.user.id)
      .maybeSingle<PlatformUserRow>();
    if (!platformUser?.active) return null;

    return await getPendingMfaStep();
  } catch {
    return null;
  }
}

export async function startMfaEnrollment(): Promise<MfaEnrollment> {
  const supabase = getSupabaseBrowser();

  // Cadastro abandonado no meio impediria um novo com o mesmo nome.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "FrotaK Master",
    issuer: "FrotaK Master",
  });
  if (error) throw new Error("Erro temporario de autenticacao.");

  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** true se o código confere; false se está errado ou vencido; erro nos demais casos. */
export async function confirmMfaCode(factorId: string, code: string) {
  const { error } = await getSupabaseBrowser().auth.mfa.challengeAndVerify({ factorId, code });
  if (!error) return true;
  if (error.code === "mfa_verification_failed" || /invalid.*code/i.test(error.message)) {
    return false;
  }
  throw new Error("Erro temporario de autenticacao.");
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

/** Token da sessao atual para chamadas ao servidor; quem valida o acesso e o servidor. */
export async function getAccessToken() {
  try {
    const { data } = await getSupabaseBrowser().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
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

  const authenticatedSupabase = supabase;

  const { data: platformUser, error: platformError } = await authenticatedSupabase
    .from("platform_users")
    .select("platform_role, active")
    .eq("user_id", session.user.id)
    .maybeSingle<PlatformUserRow>();

  if (!platformError && platformUser?.active) {
    const mfa = await getPendingMfaStep();
    if (mfa) {
      return {
        session: null,
        redirectTo: fallbackRedirect || "/",
        external: false,
        mfa,
      } satisfies AuthResult;
    }

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

  const { data: membership, error: membershipError } = await authenticatedSupabase
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
    !isLocalMasterHost() && typeof settings.clientUrl === "string" && settings.clientUrl.trim()
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
    // Esta tela ainda não cria login de verdade; senha não fica guardada no navegador.
    password: "",
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

/** Abre o TMS com a credencial de uso único gerada no servidor. Vai no fragmento da URL, fora dos logs. */
export function buildClientSupportUrl(access: {
  tokenHash: string;
  tenantId: string;
  clientName: string;
}) {
  const url = new URL(getClientAppUrl());
  url.pathname = "/";
  url.search = "";

  const params = new URLSearchParams();
  params.set("support_token", access.tokenHash);
  params.set("tenant_id", access.tenantId);
  params.set("client_name", access.clientName);
  params.set("source", "frotak-master");
  url.hash = params.toString();

  return url.toString();
}
