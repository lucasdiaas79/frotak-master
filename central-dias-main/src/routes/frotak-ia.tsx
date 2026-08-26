import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUp,
  AudioLines,
  Bot,
  LoaderCircle,
  Mic,
  Plus,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createFrotakLiveToken, sendFrotakAiChatMessage } from "@/lib/frotakAi";
import {
  FrotakLiveSession,
  requestFrotakLiveMicrophone,
  type FrotakLiveStatus,
} from "@/lib/frotakLive";
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

function cleanAssistantText(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function liveStatusLabel(status: FrotakLiveStatus) {
  if (status === "connecting") return "Conectando ao Frotak Live";
  if (status === "ready") return "Pode falar";
  if (status === "listening") return "Ouvindo";
  if (status === "speaking") return "Respondendo";
  if (status === "error") return "Voz indisponivel";
  return "Frotak Live";
}

function FrotakIaPage() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"text" | "live">("text");
  const [liveStatus, setLiveStatus] = useState<FrotakLiveStatus>("idle");
  const [lastLiveText, setLastLiveText] = useState("");
  const liveSessionRef = useRef<FrotakLiveSession | null>(null);

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
      setLastLiveText(text);
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
      const response = await sendFrotakAiChatMessage({
        data: { message: text, history },
      });

      updateMessage(pendingId, cleanAssistantText(response.text), false);
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

    let stream: MediaStream | null = null;
    try {
      setMode("live");
      setLiveStatus("connecting");
      setLastLiveText("");

      stream = await requestFrotakLiveMicrophone();
      const liveToken = await createFrotakLiveToken();
      const session = new FrotakLiveSession({
        token: liveToken.token,
        model: liveToken.model,
        stream,
        onStatus: setLiveStatus,
        onText: (text) => {
          if (text) setLastLiveText(text);
        },
        onError: (message) => {
          toast.error(message);
          setLiveStatus("error");
        },
      });

      liveSessionRef.current = session;
      await session.start();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      liveSessionRef.current = null;
      setLiveStatus("error");
      setMode("text");
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel iniciar o Frotak Live.",
      );
    }
  };

  const stopLive = async () => {
    const session = liveSessionRef.current;
    liveSessionRef.current = null;
    if (session) await session.stop();
    setLiveStatus("idle");
  };

  const exitLiveMode = async () => {
    await stopLive();
    setMode("text");
  };

  if (mode === "live") {
    return (
      <FrotakLiveView
        draft={draft}
        liveStatus={liveStatus}
        lastLiveText={lastLiveText}
        setDraft={setDraft}
        startLive={startLive}
        stopLive={stopLive}
        exitLiveMode={exitLiveMode}
        sendMessage={sendMessage}
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
  liveStatus,
  lastLiveText,
  setDraft,
  startLive,
  stopLive,
  exitLiveMode,
  sendMessage,
}: {
  draft: string;
  liveStatus: FrotakLiveStatus;
  lastLiveText: string;
  setDraft: (value: string) => void;
  startLive: () => Promise<void>;
  stopLive: () => Promise<void>;
  exitLiveMode: () => Promise<void>;
  sendMessage: () => Promise<void>;
}) {
  const active = liveStatus !== "idle" && liveStatus !== "error";
  const speaking = liveStatus === "speaking";
  const listening = liveStatus === "listening";

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
        <button
          type="button"
          className="inline-flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg backdrop-blur"
          aria-label="Ajustes de voz"
        >
          <SlidersHorizontal className="size-7" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        <div
          className={cn(
            "relative flex aspect-square w-[52vw] max-w-[260px] min-w-[190px] items-center justify-center rounded-full transition duration-500",
            "bg-[radial-gradient(circle_at_68%_34%,rgba(255,255,255,0.95),rgba(96,165,250,0.76)_34%,rgba(34,197,94,0.68)_68%,rgba(12,19,15,0.98)_100%)]",
            "shadow-[0_0_90px_rgba(34,197,94,0.25)]",
            speaking && "scale-105 animate-pulse shadow-[0_0_120px_rgba(34,197,94,0.42)]",
            listening && "scale-95 shadow-[0_0_110px_rgba(59,130,246,0.36)]",
          )}
        >
          <div
            className={cn(
              "absolute -inset-7 rounded-full border border-primary/0 transition",
              listening && "animate-ping border-primary/25",
              speaking && "animate-pulse border-sky-300/25",
            )}
          />
          <div
            className={cn(
              "absolute inset-4 rounded-full bg-white/8 blur-xl transition",
              listening && "scale-110 bg-primary/20",
              speaking && "scale-125 bg-sky-200/20",
            )}
          />
          <span className="relative text-[56px] font-black tracking-[-0.08em] text-white/88">
            F
          </span>
        </div>

        <p className="mt-8 text-[15px] font-bold text-white/72">{liveStatusLabel(liveStatus)}</p>
        {lastLiveText ? (
          <p className="mt-4 max-w-md whitespace-pre-wrap text-[17px] font-semibold leading-relaxed text-white">
            {lastLiveText}
          </p>
        ) : (
          <p className="mt-4 max-w-sm text-[15px] font-medium leading-relaxed text-white/54">
            Converse por voz com a assistente operacional da Frotak.
          </p>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex h-16 min-w-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.08] px-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
          <Plus className="size-7 shrink-0 text-white" />
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
          onClick={() => (active ? void stopLive() : void startLive())}
          className={cn(
            "inline-flex size-16 items-center justify-center rounded-full border border-white/10 text-white shadow-lg transition",
            active ? "bg-primary" : "bg-white/10",
          )}
          aria-label={active ? "Pausar voz" : "Iniciar voz"}
        >
          <Mic className="size-7" />
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
