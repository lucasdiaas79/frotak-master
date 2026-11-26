import { getCurrentAccessToken, getCurrentUser, getProfile } from "@/lib/auth";

// Sessao da transportadora (Frotak normal) para as telas de convite de embarcador.

export const PENDING_INVITE_KEY = "frotak-convite-embarcador";

export async function carrierCredentials() {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getProfile(user.id);
  const workspaceId = profile?.workspaceId?.trim();
  if (!workspaceId) return null;
  return { accessToken, workspaceId };
}

export function savePendingInvite(token: string) {
  try {
    window.localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // sem storage, a transportadora aceita pela lista de convites
  }
}

export function takePendingInvite() {
  try {
    const token = window.localStorage.getItem(PENDING_INVITE_KEY);
    window.localStorage.removeItem(PENDING_INVITE_KEY);
    return token;
  } catch {
    return null;
  }
}
