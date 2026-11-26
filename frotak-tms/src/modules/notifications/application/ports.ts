import type {
  AppNotification,
  NotificationPreference,
  NotificationRuleSummary,
  PushOutcome,
  PushPayload,
} from "@/modules/notifications/domain/notification";

/** Avisos do usuario logado (o banco so devolve os dele). */
export interface NotificationStore {
  list(limit: number): Promise<AppNotification[]>;
  markRead(ids: string[]): Promise<void>;
  markAllRead(): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Aviso novo chegando enquanto a tela esta aberta. Devolve a funcao que para de escutar. */
export interface NotificationFeed {
  subscribe(
    userId: string,
    handlers: {
      onInsert: (notification: AppNotification) => void;
      onStatus?: (live: boolean) => void;
    },
  ): () => void;
}

export interface NotificationPreferenceStore {
  listRules(): Promise<NotificationRuleSummary[]>;
  listPreferences(): Promise<NotificationPreference[]>;
  save(userId: string, preference: NotificationPreference): Promise<void>;
}

/** Aviso do Windows neste aparelho (notificacao do navegador, mesmo com o sistema fechado). */
export type WindowsPushState = "unsupported" | "blocked" | "off" | "on";

export interface WindowsPushPort {
  state(): Promise<WindowsPushState>;
  /** Pede permissao e cadastra o aparelho. Erro com mensagem pronta para o usuario. */
  enable(): Promise<WindowsPushState>;
  disable(): Promise<WindowsPushState>;
}

// ---------------------------------------------------------------- servidor: envio ao Windows

export type PendingNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  linkPath: string | null;
  attempts: number;
};

export type PushDevice = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export interface NotificationPushPorts {
  listPending(limit: number): Promise<PendingNotification[]>;
  listDevices(userIds: string[]): Promise<PushDevice[]>;
  send(device: PushDevice, payload: PushPayload): Promise<{ ok: boolean; gone: boolean }>;
  removeDevice(id: string): Promise<void>;
  mark(results: Array<{ id: string; status: PushOutcome; attempts: number }>): Promise<void>;
}
