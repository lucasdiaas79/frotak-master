import { useRouter } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  notificationFeed,
  notificationStore,
  type AppNotification,
} from "@/modules/notifications/container";
import {
  mergeNotification,
  safeLinkPath,
  unreadCount,
} from "@/modules/notifications/domain/notification";

const LIST_LIMIT = 50;
// Sem Realtime (rede instavel), a lista se atualiza sozinha neste intervalo.
const FALLBACK_REFRESH_MS = 60_000;

type NotificationCenterValue = {
  userId: string | null;
  items: AppNotification[];
  unread: number;
  loading: boolean;
  error: string | null;
  open: (item: AppNotification) => void;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
};

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível carregar as notificações.";
}

/**
 * Notificacoes do usuario logado: lista, contador, popup quando chega aviso novo com o sistema
 * aberto e as acoes de marcar como lida. Fica em volta da area logada (AppLayout).
 */
export function NotificationCenterProvider({
  userId,
  children,
}: {
  userId: string | null | undefined;
  children: ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      setItems(await notificationStore.list(LIST_LIMIT));
      setError(null);
    } catch (reason) {
      setError(messageOf(reason));
    }
  }, [userId]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) =>
        ids.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item,
      ),
    );
    try {
      await notificationStore.markRead(ids);
    } catch (reason) {
      toast.error(messageOf(reason));
    }
  }, []);

  const open = useCallback(
    (item: AppNotification) => {
      void markRead([item.id]);
      router.history.push(safeLinkPath(item.linkPath));
    },
    [markRead, router],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    try {
      await notificationStore.markAllRead();
    } catch (reason) {
      toast.error(messageOf(reason));
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await notificationStore.remove(id);
    } catch (reason) {
      toast.error(messageOf(reason));
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    let active = true;
    setLoading(true);
    void reload().finally(() => {
      if (active) setLoading(false);
    });

    const stop = notificationFeed.subscribe(userId, {
      onInsert: (item) => {
        setItems((current) => mergeNotification(current, item, LIST_LIMIT));
        // Com a aba escondida quem avisa e o Windows (push); aqui so o popup da tela aberta.
        if (document.visibilityState === "visible") {
          toast(item.title, {
            description: item.body || undefined,
            action: { label: "Abrir", onClick: () => open(item) },
            duration: 8000,
          });
        }
      },
      onStatus: (connected) => {
        live.current = connected;
      },
    });

    const timer = window.setInterval(() => {
      if (!live.current) void reload();
    }, FALLBACK_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      stop();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, reload, open]);

  const value = useMemo<NotificationCenterValue>(
    () => ({
      userId: userId ?? null,
      items,
      unread: unreadCount(items),
      loading,
      error,
      open,
      markRead,
      markAllRead,
      remove,
      reload,
    }),
    [userId, items, loading, error, open, markRead, markAllRead, remove, reload],
  );

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const value = useContext(NotificationCenterContext);
  if (!value) throw new Error("useNotificationCenter fora do NotificationCenterProvider.");
  return value;
}
