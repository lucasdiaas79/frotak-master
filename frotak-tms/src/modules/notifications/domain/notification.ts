// Notificacoes do usuario: avisos gerados pelas regras que a equipe FrotaK cria no Master.
// O banco grava os avisos (supabase/migrations/202611260001_notifications.sql); aqui ficam so as
// regras de exibicao e de envio, sem banco nem rede.

export type AppNotification = {
  id: string;
  ruleId: string | null;
  title: string;
  body: string;
  linkPath: string | null;
  createdAt: string;
  readAt: string | null;
};

/** Regra que vale para a empresa do usuario, como aparece na tela de preferencias. */
export type NotificationRuleSummary = {
  id: string;
  name: string;
  description: string | null;
  pushDefault: boolean;
};

export type NotificationPreference = {
  ruleId: string;
  enabled: boolean;
  push: boolean;
};

export type EffectivePreference = NotificationRuleSummary & {
  enabled: boolean;
  push: boolean;
  customized: boolean;
};

/** O que o usuario recebe de cada regra: a escolha dele, ou o padrao da regra. */
export function effectivePreferences(
  rules: NotificationRuleSummary[],
  preferences: NotificationPreference[],
): EffectivePreference[] {
  const byRule = new Map(preferences.map((preference) => [preference.ruleId, preference]));
  return [...rules]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((rule) => {
      const chosen = byRule.get(rule.id);
      return {
        ...rule,
        enabled: chosen?.enabled ?? true,
        push: chosen?.push ?? rule.pushDefault,
        customized: Boolean(chosen),
      };
    });
}

export function unreadCount(items: AppNotification[]) {
  return items.reduce((total, item) => total + (item.readAt ? 0 : 1), 0);
}

/** Junta um aviso novo (Realtime) na lista: mais novo primeiro, sem repetir, com limite. */
export function mergeNotification(items: AppNotification[], next: AppNotification, limit = 50) {
  const rest = items.filter((item) => item.id !== next.id);
  return [next, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** Link interno seguro: so caminho do proprio sistema. */
export function safeLinkPath(linkPath: string | null | undefined) {
  if (!linkPath || !/^\/[A-Za-z0-9/_.=&%-]*$/.test(linkPath) || linkPath.startsWith("//")) {
    return "/notificacoes";
  }
  return linkPath;
}

/** "agora", "ha 5 min", "ha 2 h", "ontem 14:05" ou "24/11 08:30". */
export function relativeTimeLabel(iso: string, now: Date = new Date()) {
  const date = new Date(iso);
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) return `há ${Math.floor(diffMinutes / 60)} h`;
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  if (date >= startOfYesterday) return `ontem ${time}`;
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${day} ${time}`;
}

// ---------------------------------------------------------------- envio ao Windows (Web Push)

/** Tentativas por aviso antes de desistir do envio ao Windows (o aviso continua no sino). */
export const MAX_PUSH_ATTEMPTS = 3;

export type PushPayload = { title: string; body: string; url: string; tag: string; id: string };

export function pushPayloadOf(notification: {
  id: string;
  title: string;
  body: string;
  linkPath: string | null;
}): PushPayload {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    url: safeLinkPath(notification.linkPath),
    tag: `frotak-notificacao-${notification.id}`,
  };
}

export type PushOutcome = "sent" | "skipped" | "failed" | "pending";

/**
 * Resultado do envio de um aviso: entregou em algum aparelho, ninguem tem aparelho cadastrado,
 * ou falhou (tenta de novo ate o limite).
 */
export function pushOutcome(input: { devices: number; delivered: number; attempts: number }) {
  if (input.devices === 0) return "skipped" as const;
  if (input.delivered > 0) return "sent" as const;
  return input.attempts + 1 >= MAX_PUSH_ATTEMPTS ? ("failed" as const) : ("pending" as const);
}
