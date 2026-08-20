import { createFileRoute } from "@tanstack/react-router";
import { Bot, Mic, MicOff, Send, Sparkles, User, Volume2, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

type ChatMode = "text" | "voice";
type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  voice?: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Olá. Eu sou a Frotak IA. Na próxima etapa vou ser conectada aos dados operacionais para ajudar no acompanhamento da frota.",
  },
];

function FrotakIaPage() {
  const [mode, setMode] = useState<ChatMode>("text");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const voiceEnabled = mode === "voice";

  const statusLabel = useMemo(() => {
    if (voiceEnabled) return "Microfone captando continuamente";
    return "Bate-papo por texto";
  }, [voiceEnabled]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text: "Interface pronta. A resposta real da IA será conectada na próxima etapa, incluindo retorno em texto e voz.",
      voice: voiceEnabled,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-[calc(100dvh-112px)] flex-col gap-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Frotak IA"
        subtitle="Assistente operacional em texto e voz"
        actions={
          <div className="inline-flex rounded-2xl border border-border bg-surface-2/70 p-1">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={cn(
                "rounded-xl px-3 py-2 text-[12px] font-bold transition",
                mode === "text"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              Texto
            </button>
            <button
              type="button"
              onClick={() => setMode("voice")}
              className={cn(
                "rounded-xl px-3 py-2 text-[12px] font-bold transition",
                mode === "voice"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              Voz
            </button>
          </div>
        }
        className="mx-0 mt-3 md:mt-0"
      />

      <section className="premium-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "relative flex size-11 shrink-0 items-center justify-center rounded-2xl border",
                voiceEnabled
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-primary/20 bg-primary/10 text-primary",
              )}
            >
              {voiceEnabled ? <Mic className="size-5" /> : <Bot className="size-5" />}
              {voiceEnabled ? (
                <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-success">
                  <span className="absolute inset-0 animate-ping rounded-full bg-success/70" />
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-extrabold text-foreground">
                Central de conversa
              </h2>
              <p className="truncate text-[12px] font-semibold text-muted-foreground">
                {statusLabel}
              </p>
            </div>
          </div>
          <div
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-2xl border px-3 text-[12px] font-bold",
              voiceEnabled
                ? "border-success/25 bg-success/10 text-success"
                : "border-border bg-surface-2/70 text-muted-foreground",
            )}
          >
            {voiceEnabled ? <Waves className="size-4" /> : <Sparkles className="size-4" />}
            {voiceEnabled ? "Voz ativa" : "IA pendente"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface/25 px-4 py-5">
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>
        </div>

        <div className="border-t border-border/80 bg-surface/65 p-3">
          <div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
            <Button
              type="button"
              variant={voiceEnabled ? "default" : "outline"}
              className="h-12 gap-2"
              onClick={() => setMode((current) => (current === "voice" ? "text" : "voice"))}
            >
              {voiceEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {voiceEnabled ? "Captando" : "Ativar voz"}
            </Button>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                voiceEnabled
                  ? "O microfone ficará captando. Digite também se quiser..."
                  : "Digite uma pergunta para a Frotak IA..."
              }
              className="min-h-12 resize-none"
            />
            <Button type="button" className="h-12 gap-2" onClick={sendMessage}>
              Enviar
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const assistant = message.role === "assistant";

  return (
    <div className={cn("flex gap-3", assistant ? "justify-start" : "justify-end")}>
      {assistant ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Bot className="size-4" />
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[min(760px,85%)] rounded-2xl border px-4 py-3 text-[13px] font-semibold leading-relaxed shadow-sm",
          assistant
            ? "border-border bg-surface text-foreground"
            : "border-primary/35 bg-primary text-primary-foreground",
        )}
      >
        <p>{message.text}</p>
        {message.voice ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
            <Volume2 className="size-3.5" />
            Resposta em voz preparada
          </div>
        ) : null}
      </div>
      {!assistant ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2/70 text-muted-foreground">
          <User className="size-4" />
        </span>
      ) : null}
    </div>
  );
}
