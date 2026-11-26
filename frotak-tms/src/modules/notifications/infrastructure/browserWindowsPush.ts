import type { WindowsPushPort, WindowsPushState } from "@/modules/notifications/application/ports";

// Notificacao do navegador (no Windows, aparece no canto da tela mesmo com o sistema fechado):
// service worker /sw.js + Web Push. O cadastro do aparelho e feito pelo servidor; as funcoes de
// servidor entram por parametro (quem liga e o container).

export type WindowsPushServer = {
  publicKey(): Promise<string | null>;
  save(subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string;
  }): Promise<void>;
  remove(endpoint: string): Promise<void>;
};

function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(base64Url: string) {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register("/sw.js"))
  );
}

async function currentSubscription() {
  const existing = await navigator.serviceWorker.getRegistration();
  return (await existing?.pushManager.getSubscription()) ?? null;
}

export function browserWindowsPush(server: WindowsPushServer): WindowsPushPort {
  async function state(): Promise<WindowsPushState> {
    if (!supported()) return "unsupported";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission !== "granted") return "off";
    try {
      return (await currentSubscription()) ? "on" : "off";
    } catch {
      return "off";
    }
  }

  return {
    state,

    async enable() {
      if (!supported()) {
        throw new Error(
          "Este navegador não mostra notificações. Use o Chrome ou o Edge no computador; no iPhone, adicione a Frotak à tela inicial.",
        );
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          "As notificações foram bloqueadas. Libere em: cadeado ao lado do endereço > Notificações > Permitir.",
        );
      }
      const publicKey = await server.publicKey();
      if (!publicKey)
        throw new Error("O servidor ainda não está configurado para enviar notificações.");
      const worker = await registration();
      await navigator.serviceWorker.ready;
      const subscription =
        (await worker.pushManager.getSubscription()) ??
        (await worker.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const json = subscription.toJSON();
      await server.save({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      return state();
    },

    async disable() {
      if (!supported()) return "unsupported";
      const subscription = await currentSubscription();
      if (subscription) {
        await server.remove(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe();
      }
      return state();
    },
  };
}
