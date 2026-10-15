import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ArrowUp,
  AudioLines,
  Bot,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FrotakOrb, type FrotakOrbState } from "@/components/frotak/FrotakOrb";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentAccessToken, getCurrentUser, getProfile } from "@/lib/auth";
import {
  confirmFrotakAiAction,
  createFrotakLiveToken,
  executeFrotakAiToolCall,
  sendFrotakAiChatMessage,
} from "@/lib/frotakAi";
import {
  extractFrotakAiPendingAction,
  FROTAK_AI_BRIEFING_TRIGGER,
  stripFrotakAiActionToken,
  type FrotakAiPendingAction,
} from "@/lib/frotakAiToolCatalog";
import {
  FrotakLiveSession,
  requestFrotakLiveMicrophone,
  type FrotakLiveStatus,
} from "@/lib/frotakLive";
import { speakPortuguese } from "@/lib/frotakVoice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/frotak-ia")({
  head: () => ({
    meta: [
      { title: "Frotak IA - Central Transportes" },
      {
        name: "description",
        content: "Assistente inteligente operacional da Frotak.",
      },
    ],
  }),
  component: FrotakIaPage,
});

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  pending?: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Ola. Eu sou a Frotak IA. Como posso ajudar na operacao agora?",
  },
];

const LIVE_MICROPHONE_TIMEOUT_MS = 20_000;
const LIVE_TOKEN_TIMEOUT_MS = 20_000;
const LIVE_CONNECTION_TIMEOUT_MS = 30_000;

// O briefing abre a voz so na primeira conversa do dia em cada workspace.
function claimDailyBriefing(workspaceId: string) {
  const key = `frotak-ia-briefing:${workspaceId}`;
  const today = new Date().toLocaleDateString("sv-SE");
  try {
    if (window.localStorage.getItem(key) === today) return false;
    window.localStorage.setItem(key, today);
    return true;
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function cleanAssistantText(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Segura trocas rapidas de estado (ex.: entre um pedaco de audio e outro) para a esfera nao piscar.
function useStableLiveStatus(status: FrotakLiveStatus) {
  const [stable, setStable] = useState(status);
  useEffect(() => {
    if (["speaking", "error", "idle", "connecting"].includes(status)) {
      setStable(status);
      return;
    }
    const delay = status === "ready" || status === "interrupted" ? 900 : 350;
    const timer = window.setTimeout(() => setStable(status), delay);
    return () => window.clearTimeout(timer);
  }, [status]);
  return stable;
}

function liveStatusLabel(status: FrotakLiveStatus) {
  if (status === "connecting") return "Conectando ao Frotak Live";
  if (status === "reconnecting") return "Reconectando";
  if (status === "ready") return "Pode falar";
  if (status === "muted") return "Microfone pausado";
  if (status === "listening") return "Ouvindo";
  if (status === "thinking") return "Pensando";
  if (status === "speaking") return "Respondendo";
  if (status === "interrupted") return "Interrompido";
  if (status === "error") return "Voz indisponivel";
  return "Frotak Live";
}

async function requireAccessToken() {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw new Error("Sessao expirada. Entre novamente para usar a Frotak IA.");
  return accessToken;
}

async function requireWorkspaceId() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessao expirada. Entre novamente para usar a Frotak IA.");

  const profile = await getProfile(user.id);
  const workspaceId = profile?.workspaceId?.trim();
  if (!workspaceId) throw new Error("Workspace atual indisponivel para a Frotak IA.");
  return workspaceId;
}

function FrotakIaPage() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"text" | "live">("text");
  const [liveStatus, setLiveStatus] = useState<FrotakLiveStatus>("idle");
  const [, setLastLiveText] = useState("");
  const [, setLastUserTranscript] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [pendingAction, setPendingAction] = useState<FrotakAiPendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const liveSessionRef = useRef<FrotakLiveSession | null>(null);
  const liveStartAttemptRef = useRef(0);

  useEffect(
    () => () => {
      void stopLive();
    },
    [],
  );

  const updateMessage = (id: string, text: string, pending = false) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, text, pending } : message)),
    );
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    if (mode === "live" && liveSessionRef.current) {
      liveSessionRef.current.sendText(text);
      setDraft("");
      setLastUserTranscript(text);
      setLastLiveText("");
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };
    const pendingId = `assistant-${Date.now()}`;
    const pendingMessage: ChatMessage = {
      id: pendingId,
      role: "assistant",
      text: "Respondendo...",
      pending: true,
    };

    setDraft("");
    setSending(true);
    setMessages((current) => [...current, userMessage, pendingMessage]);

    try {
      const history = messages
        .filter((message) => !message.pending)
        .map((message) => ({ role: message.role, text: message.text }));
      const [accessToken, workspaceId] = await Promise.all([
        requireAccessToken(),
        requireWorkspaceId(),
      ]);
      const response = await sendFrotakAiChatMessage({
        data: { accessToken, workspaceId, message: text, history },
      });

      updateMessage(pendingId, cleanAssistantText(response.text), false);
      const action = response.pendingActions?.at(-1);
      if (action) setPendingAction(action);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel falar com a Frotak IA.";
      updateMessage(pendingId, message, false);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const startLive = async () => {
    if (liveSessionRef.current) return;

    const attempt = liveStartAttemptRef.current + 1;
    liveStartAttemptRef.current = attempt;
    let stream: MediaStream | null = null;
    try {
      setMode("live");
      setLiveStatus("connecting");
      setMicrophoneEnabled(true);
      setLastLiveText("");
      setLastUserTranscript("");

      const streamRequest = requestFrotakLiveMicrophone();
      void streamRequest.then((requestedStream) => {
        if (liveStartAttemptRef.current !== attempt) {
          requestedStream.getTracks().forEach((track) => track.stop());
        }
      });
      stream = await withTimeout(
        streamRequest,
        LIVE_MICROPHONE_TIMEOUT_MS,
        "O navegador nao respondeu ao pedido de microfone. Verifique a permissao e tente novamente.",
      );
      if (liveStartAttemptRef.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const workspaceId = await requireWorkspaceId();
      const fetchLiveToken = async () =>
        withTimeout(
          createFrotakLiveToken({
            data: { accessToken: await requireAccessToken(), workspaceId },
          }),
          LIVE_TOKEN_TIMEOUT_MS,
          "Nao foi possivel autorizar o Frotak Live a tempo. Tente novamente em instantes.",
        );
      const liveToken = await fetchLiveToken();
      const session = new FrotakLiveSession({
        token: liveToken.token,
        model: liveToken.model,
        setupConfig: liveToken.setupConfig,
        stream,
        onStatus: setLiveStatus,
        onText: (text) => {
          if (text) setLastLiveText(text);
        },
        onPartialText: (text) => {
          if (text) setLastLiveText(text);
        },
        onInputText: (text) => {
          if (text) setLastUserTranscript(text);
        },
        refreshToken: fetchLiveToken,
        onToolCall: async (call) => {
          const result = await executeFrotakAiToolCall({
            data: {
              accessToken: await requireAccessToken(),
              workspaceId,
              name: call.name,
              args: call.args ?? {},
            },
          });
          const action = extractFrotakAiPendingAction(result);
          if (action) setPendingAction(action);
          return stripFrotakAiActionToken(result);
        },
        onDeterministicAnswer: async (text) => {
          await speakPortuguese(text);
        },
        onError: (message) => {
          toast.error(message);
          const failedSession = liveSessionRef.current;
          liveSessionRef.current = null;
          void failedSession?.stop().finally(() => setLiveStatus("error"));
        },
      });

      liveSessionRef.current = session;
      await withTimeout(
        session.start(),
        LIVE_CONNECTION_TIMEOUT_MS,
        "O Frotak Live demorou para conectar. Tente novamente em instantes.",
      );
      if (liveSessionRef.current === session && claimDailyBriefing(workspaceId)) {
        session.sendText(FROTAK_AI_BRIEFING_TRIGGER);
      }
    } catch (error) {
      const cancelled = liveStartAttemptRef.current !== attempt;
      const failedSession = liveSessionRef.current;
      liveSessionRef.current = null;
      await failedSession?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (cancelled) return;
      liveStartAttemptRef.current += 1;
      setLiveStatus("error");
      setMode("text");
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel iniciar o Frotak Live.",
      );
    }
  };

  const stopLive = async () => {
    liveStartAttemptRef.current += 1;
    const session = liveSessionRef.current;
    liveSessionRef.current = null;
    if (session) await session.stop();
    setMicrophoneEnabled(true);
    setLiveStatus("idle");
  };

  const toggleMicrophone = () => {
    const next = !microphoneEnabled;
    setMicrophoneEnabled(next);
    liveSessionRef.current?.setMicrophoneEnabled(next);
  };

  const resolvePendingAction = async (confirmed: boolean) => {
    const action = pendingAction;
    if (!action || confirming) return;
    if (!confirmed) {
      setPendingAction(null);
      liveSessionRef.current?.sendText("O usuario cancelou a acao na tela. Nada foi gravado.");
      return;
    }
    setConfirming(true);
    try {
      const [accessToken, workspaceId] = await Promise.all([
        requireAccessToken(),
        requireWorkspaceId(),
      ]);
      const result = await confirmFrotakAiAction({
        data: { accessToken, workspaceId, token: action.token },
      });
      const text = result.ok
        ? (result.message ?? "Acao confirmada.")
        : (result.error ?? "Nao foi possivel concluir a acao.");
      if (!result.ok) toast.error(text);
      setPendingAction(null);
      if (liveSessionRef.current) {
        liveSessionRef.current.sendText(
          result.ok
            ? `O usuario confirmou na tela e a acao foi gravada: ${text} Avise em uma frase.`
            : `A acao nao foi gravada: ${text} Avise em uma frase.`,
        );
      } else {
        setMessages((current) => [
          ...current,
          { id: `assistant-${Date.now()}`, role: "assistant", text },
        ]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel concluir a acao.");
    } finally {
      setConfirming(false);
    }
  };

  const actionCard = pendingAction ? (
    <PendingActionCard
      action={pendingAction}
      confirming={confirming}
      dark={mode === "live"}
      onResolve={resolvePendingAction}
    />
  ) : null;

  const exitLiveMode = async () => {
    await stopLive();
    setMode("text");
  };

  if (mode === "live") {
    return (
      <FrotakLiveView
        draft={draft}
        liveStatus={liveStatus}
        microphoneEnabled={microphoneEnabled}
        setDraft={setDraft}
        startLive={startLive}
        exitLiveMode={exitLiveMode}
        sendMessage={sendMessage}
        toggleMicrophone={toggleMicrophone}
        actionCard={actionCard}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-[calc(100dvh-112px)] flex-col overflow-hidden bg-background px-0 pb-0 md:min-h-[calc(100dvh-7rem)] md:gap-4 md:px-0 md:pb-4">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:premium-card">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/70 bg-background/94 px-4 py-3 backdrop-blur md:px-5">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-foreground md:hidden"
            aria-label="Voltar"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <span className="text-sm font-black">F</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary md:text-muted-foreground">
              Assistente operacional
            </p>
            <h1 className="truncate text-[20px] font-extrabold text-foreground md:text-[24px]">
              Frotak IA
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            className="hidden h-10 gap-2 rounded-full px-4 md:inline-flex"
            onClick={() => void startLive()}
          >
            <AudioLines className="size-4" />
            Frotak Live
          </Button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-foreground md:hidden"
            aria-label="Configuracoes"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 pb-32 md:px-6 md:pb-5">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {actionCard}
          </div>
        </div>

        <ChatComposer
          draft={draft}
          sending={sending}
          setDraft={setDraft}
          sendMessage={sendMessage}
          startLive={startLive}
        />
      </section>
    </div>
  );
}

function FrotakLiveView({
  draft,
  liveStatus: rawLiveStatus,
  microphoneEnabled,
  setDraft,
  startLive,
  exitLiveMode,
  sendMessage,
  toggleMicrophone,
  actionCard,
}: {
  actionCard: ReactNode;
  draft: string;
  liveStatus: FrotakLiveStatus;
  microphoneEnabled: boolean;
  setDraft: (value: string) => void;
  startLive: () => Promise<void>;
  exitLiveMode: () => Promise<void>;
  sendMessage: () => Promise<void>;
  toggleMicrophone: () => void;
}) {
  const liveStatus = useStableLiveStatus(rawLiveStatus);
  const active = liveStatus !== "idle" && liveStatus !== "error";
  const speaking = liveStatus === "speaking";
  const listening = liveStatus === "listening";
  const thinking = liveStatus === "thinking" || liveStatus === "reconnecting";
  const orbState: FrotakOrbState = speaking
    ? "speaking"
    : listening
      ? "listening"
      : thinking
        ? "thinking"
        : "idle";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white md:absolute md:inset-0 md:rounded-[28px]">
      <div className="flex items-center justify-between px-6 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => void exitLiveMode()}
          className="inline-flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur"
          aria-label="Sair do Frotak Live"
        >
          <X className="size-7" />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Frotak</p>
          <h1 className="text-[20px] font-extrabold">Frotak Live</h1>
        </div>
        <div className="size-14" aria-hidden="true" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        <div
          role="img"
          aria-label={`Frotak Live: ${liveStatusLabel(liveStatus)}`}
          className="relative aspect-square w-[78vw] min-w-[250px] max-w-[360px]"
        >
          <FrotakOrb state={orbState} />
        </div>

        <p className="mt-8 text-[15px] font-bold text-white/72" aria-live="polite">
          {liveStatusLabel(liveStatus)}
        </p>
      </div>

      {actionCard ? <div className="mx-auto mb-4 w-full max-w-md px-5">{actionCard}</div> : null}

      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex h-16 min-w-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.08] px-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Pergunte a Frotak IA..."
            className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-white outline-none placeholder:text-white/38"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!active) void startLive();
            else toggleMicrophone();
          }}
          className={cn(
            "inline-flex size-16 items-center justify-center rounded-full border border-white/10 text-white shadow-lg transition",
            active && microphoneEnabled ? "bg-primary" : "bg-white/10",
          )}
          aria-label={
            !active ? "Iniciar voz" : microphoneEnabled ? "Pausar microfone" : "Ativar microfone"
          }
        >
          {active && !microphoneEnabled ? (
            <MicOff className="size-7" />
          ) : (
            <Mic className="size-7" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void exitLiveMode()}
          className="inline-flex size-16 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105"
          aria-label="Desativar modo Live"
        >
          <X className="size-8" />
        </button>
      </div>
    </div>
  );
}

function PendingActionCard({
  action,
  confirming,
  dark,
  onResolve,
}: {
  action: FrotakAiPendingAction;
  confirming: boolean;
  dark: boolean;
  onResolve: (confirmed: boolean) => Promise<void>;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Confirmar acao da Frotak IA"
      className={cn(
        "rounded-2xl border p-4 text-left shadow-lg",
        dark ? "border-white/15 bg-white/[0.08] text-white" : "border-primary/30 bg-primary/5",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
        Confirmar acao
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-snug">{action.resumo}</p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          className="h-10 flex-1 gap-2 rounded-full"
          disabled={confirming}
          onClick={() => void onResolve(true)}
        >
          {confirming ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Confirmar
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 flex-1 rounded-full",
            dark && "border-white/20 bg-transparent text-white",
          )}
          disabled={confirming}
          onClick={() => void onResolve(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ChatComposer({
  draft,
  sending,
  setDraft,
  sendMessage,
  startLive,
}: {
  draft: string;
  sending: boolean;
  setDraft: (value: string) => void;
  sendMessage: () => Promise<void>;
  startLive: () => Promise<void>;
}) {
  return (
    <>
      <div className="fixed inset-x-0 bottom-[74px] z-20 bg-transparent px-2.5 pb-[calc(0.7rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="mx-auto flex h-[58px] w-full max-w-[460px] items-center gap-2 rounded-full border border-white/10 bg-[#171717] px-2 shadow-[0_18px_70px_rgba(0,0,0,0.55)]">
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-primary/15"
            aria-label="Adicionar"
          >
            <Plus className="size-6" />
          </button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Pergunte a Frotak IA..."
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[16px] font-semibold text-white outline-none placeholder:text-white/38"
          />
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-primary/20"
            onClick={() => void startLive()}
            aria-label="Abrir Frotak Live"
          >
            <AudioLines className="size-5" />
          </button>
          <button
            type="button"
            disabled={sending || !draft.trim()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:bg-white/10 disabled:text-white/45"
            onClick={() => void sendMessage()}
            aria-label="Enviar"
          >
            {sending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </button>
        </div>
      </div>

      <div className="hidden border-t border-border/70 bg-background/95 p-4 backdrop-blur md:block">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[26px] border border-border bg-surface-2/80 p-2 shadow-[0_18px_70px_rgba(0,0,0,0.48)]">
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-black/35 text-white transition hover:bg-primary/10 hover:text-primary md:bg-background md:text-foreground"
            aria-label="Adicionar"
          >
            <Plus className="size-6" />
          </button>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Pergunte a Frotak IA..."
            className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-transparent px-1 py-3 text-[16px] font-semibold text-white shadow-none outline-none placeholder:text-white/38 focus-visible:ring-0 md:text-foreground md:placeholder:text-muted-foreground"
          />
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-black/35 text-white transition hover:bg-primary/20 hover:text-primary md:bg-background md:text-foreground"
            onClick={() => void startLive()}
            aria-label="Abrir Frotak Live"
          >
            <AudioLines className="size-5" />
          </button>
          <button
            type="button"
            disabled={sending || !draft.trim()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            onClick={() => void sendMessage()}
            aria-label="Enviar"
          >
            {sending ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <ArrowUp className="size-5" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const assistant = message.role === "assistant";
  return (
    <div className={cn("flex gap-3", assistant ? "justify-start" : "justify-end")}>
      {assistant ? (
        <div className="mt-1 hidden size-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary md:flex">
          <Bot className="size-4" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[88%] whitespace-pre-wrap text-[16px] font-semibold leading-relaxed md:max-w-[78%] md:rounded-2xl md:border md:px-4 md:py-3 md:text-[14px]",
          assistant
            ? "text-foreground md:border-border md:bg-surface-2"
            : "rounded-[24px] bg-primary px-4 py-3 text-primary-foreground md:border-primary/20",
        )}
      >
        {message.pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            {message.text}
          </span>
        ) : (
          message.text
        )}
      </div>
      {!assistant ? (
        <div className="mt-1 hidden size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground md:flex">
          <User className="size-4" />
        </div>
      ) : null}
    </div>
  );
}
