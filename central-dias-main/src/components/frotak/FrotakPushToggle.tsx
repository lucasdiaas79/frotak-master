import { Bell, BellOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getFrotakPushPublicKey,
  removeFrotakPushSubscription,
  saveFrotakPushSubscription,
} from "@/lib/frotakPush";
import { cn } from "@/lib/utils";

type Props = {
  getAccessToken: () => Promise<string>;
  getWorkspaceId: () => Promise<string>;
  className?: string;
};

function pushSupported() {
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

async function serviceWorker() {
  return (
    (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js")
  );
}

// Liga ou desliga o aviso no celular de veiculos sem viagem (push do navegador).
export function FrotakPushToggle({ getAccessToken, getWorkspaceId, className }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported() || Notification.permission !== "granted") return;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setEnabled(!!subscription))
      .catch(() => undefined);
  }, []);

  async function enable() {
    if (!pushSupported()) {
      toast.error(
        "Este aparelho nao recebe avisos pelo navegador. No iPhone, adicione a Frotak a tela inicial e abra por la.",
      );
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast.error("Os avisos foram bloqueados. Libere as notificacoes da Frotak no navegador.");
      return;
    }
    const { publicKey } = await getFrotakPushPublicKey();
    if (!publicKey) {
      toast.error("Avisos ainda nao configurados no servidor.");
      return;
    }
    const registration = await serviceWorker();
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const json = subscription.toJSON();
    const [accessToken, workspaceId] = await Promise.all([getAccessToken(), getWorkspaceId()]);
    const result = await saveFrotakPushSubscription({
      data: {
        accessToken,
        workspaceId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        userAgent: navigator.userAgent,
      },
    });
    if (!result.ok) throw new Error(result.error);
    setEnabled(true);
    toast.success("Pronto: voce vai receber aviso de veiculos parados neste aparelho.");
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const [accessToken, workspaceId] = await Promise.all([getAccessToken(), getWorkspaceId()]);
      await removeFrotakPushSubscription({
        data: { accessToken, workspaceId, endpoint: subscription.endpoint },
      });
      await subscription.unsubscribe();
    }
    setEnabled(false);
    toast.success("Avisos desligados neste aparelho.");
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await (enabled ? disable() : enable());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar os avisos.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? LoaderCircle : enabled ? Bell : BellOff;
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground",
        enabled && "bg-primary/10 text-primary",
        className,
      )}
      aria-label={enabled ? "Desligar avisos no celular" : "Ligar avisos no celular"}
      title={enabled ? "Avisos ligados neste aparelho" : "Receber aviso de veiculos parados"}
    >
      <Icon className={cn("size-5", busy && "animate-spin")} />
    </button>
  );
}
