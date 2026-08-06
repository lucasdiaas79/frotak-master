import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, type Auth as FirebaseAuth } from "firebase/auth";
import { clients, type Client } from "@/lib/mock";

const AUTH_STORAGE_KEY = "frotak-master-session";
const AUTH_USERS_STORAGE_KEY = "frotak-master-users";
const AUTH_EVENT = "frotak-auth-change";
const CLIENT_TOKEN_TTL_MS = 10 * 60 * 1000;

type AuthProvider = "local" | "firebase";
type UserScope = "master" | "client";
type UserStatus = "Ativo" | "Suspenso";

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
  role: string;
  scope: UserScope;
  provider: AuthProvider;
  clientId?: string;
  tenantId?: string;
  clientName?: string;
  clientUrl?: string;
  accessToken: string;
  expiresAt: string;
};

export type AuthResult = {
  session: AuthSession;
  redirectTo: string;
  external: boolean;
};

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

export const demoPassword = "123456";
export const masterEmail = "master@frotak.log.br";
export const masterPassword = "casadamoeda2026";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getAuthProvider(): AuthProvider {
  return import.meta.env.VITE_FROTAK_AUTH_PROVIDER === "firebase" ? "firebase" : "local";
}

function getClientAppUrl() {
  return import.meta.env.VITE_FROTAK_CLIENT_APP_URL || "http://localhost:5174";
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

function buildClientUrl(client: Client) {
  if (import.meta.env.VITE_FROTAK_USE_CLIENT_DOMAIN === "true") {
    return `https://${client.domain}`;
  }

  return getClientAppUrl();
}

function createBaseMasterUsers(): ManagedUser[] {
  return [
    {
      id: "master-root",
      name: "FrotaK Master",
      email: masterEmail,
      password: masterPassword,
      role: "Master",
      team: "Administracao",
      status: "Ativo",
      scope: "master",
      provider: "local",
      createdAt: "2026-08-06T00:00:00.000Z",
    },
  ];
}

function createBaseClientUsers(): ManagedUser[] {
  return clients.slice(0, 8).map((client, index) => {
    const slug = slugify(client.name).replace(/^transportadora-/, "");

    return {
      id: `client-${index + 1}`,
      name: `Admin ${client.name}`,
      email: `admin@${slug}.com.br`,
      password: demoPassword,
      role: "Cliente administrador",
      team: client.name,
      status: client.status === "Suspenso" || client.status === "Cancelado" ? "Suspenso" : "Ativo",
      scope: "client",
      clientId: client.id,
      tenantId: slug === "central-transportes" ? "00000000-0000-0000-0000-000000000001" : undefined,
      clientName: client.name,
      clientUrl: buildClientUrl(client),
      provider: "local",
      createdAt: "2026-08-06T00:00:00.000Z",
    } satisfies ManagedUser;
  });
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

export function getManagedUsers() {
  const storedUsers = getStoredUsers().filter((user) => user.scope === "client");
  const usersByEmail = new Map<string, ManagedUser>();

  [...createBaseMasterUsers(), ...createBaseClientUsers(), ...storedUsers].forEach((user) => {
    usersByEmail.set(normalizeEmail(user.email), user);
  });

  return Array.from(usersByEmail.values());
}

export const loginAccounts = getManagedUsers().map((user) => ({
  email: user.email,
  name: user.name,
  role: user.role,
  password: user.password,
}));

export function createManagedUser(input: CreateUserInput) {
  const users = getManagedUsers();
  const email = normalizeEmail(input.email);
  const exists = users.some((user) => normalizeEmail(user.email) === email);

  if (email === masterEmail) {
    throw new Error("Este e-mail e reservado para o acesso master.");
  }

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
    provider: "local",
    createdAt: new Date().toISOString(),
  };

  saveStoredUsers([...getStoredUsers(), user]);
  return user;
}

export function createClientAccess(input: CreateClientAccessInput) {
  const email = normalizeEmail(input.email);

  if (email === masterEmail) {
    throw new Error("Este e-mail e reservado para o acesso master.");
  }

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
    provider: "local",
    createdAt: new Date().toISOString(),
  };
  const storedUsers = getStoredUsers().filter(
    (storedUser) =>
      storedUser.clientId !== input.clientId && normalizeEmail(storedUser.email) !== email,
  );

  saveStoredUsers([...storedUsers, user]);
  return user;
}

function createSession(user: ManagedUser): AuthSession {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scope: user.scope,
    provider: user.provider,
    clientId: user.clientId,
    tenantId: user.tenantId,
    clientName: user.clientName,
    clientUrl: user.clientUrl,
    accessToken: createToken({
      sub: user.id,
      email: user.email,
      scope: user.scope,
      clientId: user.clientId,
      tenantId: user.tenantId,
      clientName: user.clientName,
      exp: expiresAt,
    }),
    expiresAt,
  };
}

export function getSession(): AuthSession | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AuthSession;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearSession() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function buildClientAccessUrl(session: AuthSession) {
  const baseUrl = session.clientUrl || getClientAppUrl();
  const url = new URL(baseUrl);

  url.searchParams.set("sso_token", session.accessToken);
  url.searchParams.set("client_id", session.clientId || "");
  url.searchParams.set("tenant_id", session.tenantId || session.clientId || "");
  url.searchParams.set("client_name", session.clientName || "");
  url.searchParams.set("login_hint", session.email);
  url.searchParams.set("source", "frotak-master");

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

function resultFromSession(session: AuthSession, fallbackRedirect: string): AuthResult {
  const external = session.scope === "client";
  return {
    session,
    external,
    redirectTo: external ? buildClientAccessUrl(session) : fallbackRedirect || "/",
  };
}

function localAuthenticate(email: string, password: string, fallbackRedirect: string) {
  const normalizedEmail = normalizeEmail(email);
  const account = getManagedUsers().find((item) => normalizeEmail(item.email) === normalizedEmail);

  if (!account || password !== account.password || account.status !== "Ativo") {
    return null;
  }

  const session = createSession(account);
  setSession(session);
  return resultFromSession(session, fallbackRedirect);
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: FirebaseAuth | null = null;

function getFirebaseAuth() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("Configure as variaveis VITE_FIREBASE_* para usar Firebase.");
  }

  if (!firebaseApp) {
    firebaseApp = initializeApp(config);
    firebaseAuth = getAuth(firebaseApp);
  }

  return firebaseAuth!;
}

async function firebaseAuthenticate(email: string, password: string, fallbackRedirect: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  const tokenResult = await credential.user.getIdTokenResult();
  const claims = tokenResult.claims as Record<string, unknown>;
  const scope = claims.scope === "client" ? "client" : "master";
  const clientId = typeof claims.clientId === "string" ? claims.clientId : undefined;
  const tenantId =
    typeof claims.tenantId === "string"
      ? claims.tenantId
      : typeof claims.tenant_id === "string"
        ? claims.tenant_id
        : clientId;
  const client = clientId ? clients.find((item) => item.id === clientId) : undefined;
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const session: AuthSession = {
    id: credential.user.uid,
    email: credential.user.email || normalizeEmail(email),
    name: credential.user.displayName || credential.user.email || "Usuario",
    role: typeof claims.role === "string" ? claims.role : scope === "client" ? "Cliente" : "Master",
    scope,
    provider: "firebase",
    clientId,
    tenantId,
    clientName:
      client?.name || (typeof claims.clientName === "string" ? claims.clientName : undefined),
    clientUrl: client ? buildClientUrl(client) : undefined,
    accessToken: token,
    expiresAt,
  };

  setSession(session);
  return resultFromSession(session, fallbackRedirect);
}

export async function authenticate(email: string, password: string, fallbackRedirect = "/") {
  if (getAuthProvider() === "firebase") {
    return firebaseAuthenticate(email, password, fallbackRedirect);
  }

  return localAuthenticate(email, password, fallbackRedirect);
}

export function subscribeToAuth(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
