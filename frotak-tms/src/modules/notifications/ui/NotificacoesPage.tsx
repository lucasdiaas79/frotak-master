import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  LoaderCircle,
  MonitorSmartphone,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FrotakEmptyState,
  FrotakPage,
  FrotakPageHeader,
  FrotakSection,
} from "@/components/frotak/FrotakPage";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  notificationPreferences,
  windowsPush,
  type EffectivePreference,
  type WindowsPushState,
} from "@/modules/notifications/container";
import {
  effectivePreferences,
  relativeTimeLabel,
} from "@/modules/notifications/domain/notification";
import { useNotificationCenter } from "@/modules/notifications/ui/NotificationCenter";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function NotificacoesPage() {
  const [tab, setTab] = useState("historico");
  return (
    <FrotakPage>
      <FrotakPageHeader
        eyebrow="Avisos"
        title="Notificações"
        description="Avisos da operação, como frete que mudou de etapa. Aparecem no sino, em um aviso na tela e, se você ligar, no canto da tela do Windows mesmo com o sistema fechado."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>
        <TabsContent value="historico" className="mt-4">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="preferencias" className="mt-4 flex flex-col gap-4">
          <WindowsPushSection />
          <PreferencesSection />
        </TabsContent>
      </Tabs>
    </FrotakPage>
  );
}

function HistoryTab() {
  const center = useNotificationCenter();
  return (
    <FrotakSection
      title="Histórico"
      description="Os últimos 50 avisos. Avisos com mais de 90 dias saem sozinhos."
      actions={
        center.unread > 0 ? (
          <Button variant="outline" size="sm" onClick={() => void center.markAllRead()}>
            <CheckCheck />
            Marcar todas como lidas
          </Button>
        ) : null
      }
      contentClassName="p-0"
    >
      {center.loading && center.items.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
      ) : center.error && center.items.length === 0 ? (
        <FrotakEmptyState
          title="Não foi possível carregar"
          description={center.error}
          actionLabel="Tentar de novo"
          onAction={() => void center.reload()}
        />
      ) : center.items.length === 0 ? (
        <FrotakEmptyState
          icon={<Bell className="size-5" />}
          title="Nenhuma notificação ainda"
          description="Quando um frete mudar de etapa ou outra regra for atendida, o aviso aparece aqui."
        />
      ) : (
        <ul className="divide-y divide-border">
          {center.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex min-w-0 items-start gap-3 px-5 py-3.5",
                !item.readAt && "bg-primary/[0.04]",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  item.readAt ? "bg-transparent" : "bg-primary",
                )}
                aria-label={item.readAt ? undefined : "Não lida"}
              />
              <button
                type="button"
                onClick={() => center.open(item)}
                className="min-w-0 flex-1 rounded-[12px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                <span className="block break-words text-[13px] font-semibold leading-snug text-foreground">
                  {item.title}
                </span>
                {item.body ? (
                  <span className="mt-0.5 block break-words text-xs leading-[1.6] text-muted-foreground">
                    {item.body}
                  </span>
                ) : null}
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {relativeTimeLabel(item.createdAt)}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 md:size-9"
                aria-label="Apagar notificação"
                onClick={() => void center.remove(item.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </FrotakSection>
  );
}

const PUSH_STATE_TEXT: Record<WindowsPushState, { title: string; description: string }> = {
  on: {
    title: "Ligado neste computador",
    description: "Os avisos aparecem no canto da tela, mesmo com o sistema fechado.",
  },
  off: {
    title: "Desligado neste computador",
    description:
      "Ligue para receber os avisos no canto da tela do Windows, mesmo com o sistema fechado. O navegador vai pedir permissão.",
  },
  blocked: {
    title: "Bloqueado pelo navegador",
    description:
      "Para liberar: clique no cadeado ao lado do endereço do site, abra Notificações e escolha Permitir. Depois volte aqui.",
  },
  unsupported: {
    title: "Este navegador não mostra notificações",
    description:
      "Use o Chrome ou o Edge no computador. No iPhone, adicione a Frotak à tela inicial e abra por lá.",
  },
};

function WindowsPushSection() {
  const [state, setState] = useState<WindowsPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void windowsPush
      .state()
      .then(setState)
      .catch(() => setState("off"));
  }, []);

  async function toggle() {
    if (busy || !state) return;
    setBusy(true);
    try {
      if (state === "on") {
        setState(await windowsPush.disable());
        toast.success("Avisos do Windows desligados neste computador.");
      } else {
        setState(await windowsPush.enable());
        toast.success("Pronto: os avisos vão aparecer no canto da tela deste computador.");
      }
    } catch (error) {
      toast.error(messageOf(error, "Não foi possível mudar o aviso do Windows."));
      setState(await windowsPush.state().catch(() => "off" as const));
    } finally {
      setBusy(false);
    }
  }

  const text = state ? PUSH_STATE_TEXT[state] : null;
  const Icon = state === "on" ? BellRing : state === "off" ? Bell : BellOff;

  return (
    <FrotakSection
      title="Aviso do Windows"
      description="Vale para este navegador neste computador. Em outro computador, ligue lá também."
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              state === "on" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {state ? <Icon className="size-5" /> : <MonitorSmartphone className="size-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{text?.title ?? "Verificando…"}</p>
            {text ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {text.description}
              </p>
            ) : null}
          </div>
        </div>
        {state === "on" || state === "off" ? (
          <Button
            variant={state === "on" ? "outline" : "default"}
            onClick={() => void toggle()}
            disabled={busy}
            className="w-full shrink-0 sm:w-auto"
          >
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : state === "on" ? (
              <BellOff />
            ) : (
              <BellRing />
            )}
            {state === "on" ? "Desligar" : "Ligar aviso do Windows"}
          </Button>
        ) : null}
      </div>
    </FrotakSection>
  );
}

function PreferencesSection() {
  const center = useNotificationCenter();
  const [rows, setRows] = useState<EffectivePreference[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rules, preferences] = await Promise.all([
        notificationPreferences.listRules(),
        notificationPreferences.listPreferences(),
      ]);
      setRows(effectivePreferences(rules, preferences));
      setError(null);
    } catch (reason) {
      setError(messageOf(reason, "Não foi possível carregar as preferências."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(row: EffectivePreference, next: { enabled: boolean; push: boolean }) {
    if (!center.userId) return;
    setSaving(row.id);
    setRows(
      (current) =>
        current?.map((item) =>
          item.id === row.id ? { ...item, ...next, customized: true } : item,
        ) ?? null,
    );
    try {
      await notificationPreferences.save(center.userId, { ruleId: row.id, ...next });
    } catch (reason) {
      toast.error(messageOf(reason, "Não foi possível salvar a preferência."));
      await load();
    } finally {
      setSaving(null);
    }
  }

  const sorted = useMemo(() => rows ?? [], [rows]);

  return (
    <FrotakSection
      title="O que você quer receber"
      description="Os tipos de aviso são criados pela equipe FrotaK. Escolha quais quer receber e quais também aparecem no Windows."
      contentClassName="p-0"
    >
      {error ? (
        <FrotakEmptyState
          title="Não foi possível carregar"
          description={error}
          actionLabel="Tentar de novo"
          onAction={() => void load()}
        />
      ) : rows === null ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
      ) : sorted.length === 0 ? (
        <FrotakEmptyState
          icon={<Bell className="size-5" />}
          title="Nenhum tipo de aviso ativo"
          description="Quando a equipe FrotaK ativar um tipo de aviso para a sua empresa, ele aparece aqui."
        />
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((row) => (
            <li
              key={row.id}
              className="flex min-w-0 flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words text-[13px] font-semibold text-foreground">{row.name}</p>
                {row.description ? (
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                    {row.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-foreground md:min-h-0">
                  <Switch
                    checked={row.enabled}
                    disabled={saving === row.id}
                    onCheckedChange={(enabled) => void change(row, { enabled, push: row.push })}
                    aria-label={`Receber: ${row.name}`}
                  />
                  Receber
                </label>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 text-xs text-foreground md:min-h-0",
                    !row.enabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Switch
                    checked={row.enabled && row.push}
                    disabled={!row.enabled || saving === row.id}
                    onCheckedChange={(push) => void change(row, { enabled: row.enabled, push })}
                    aria-label={`Aviso do Windows: ${row.name}`}
                  />
                  No Windows
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FrotakSection>
  );
}
