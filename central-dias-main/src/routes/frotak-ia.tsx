import { createFileRoute } from "@tanstack/react-router";
import { Bot, LoaderCircle, Send, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendFrotakAiChatMessage } from "@/lib/frotakAi";
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
    text: "Ola. Eu sou a Frotak IA. Estou em modo simples de texto.",
  },
];

function cleanAssistantText(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function FrotakIaPage() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);

  const updateMessage = (id: string, text: string, pending = false) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, text, pending } : message)),
    );
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;

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

  return (
    <div className="flex h-full min-h-[calc(100dvh-112px)] flex-col gap-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Frotak IA"
        subtitle="Assistente operacional em modo simples"
        className="mx-0 mt-3 md:mt-0"
      />

      <section className="premium-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border/80 px-4 py-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-extrabold text-foreground">
              Central de conversa
            </h2>
            <p className="truncate text-[12px] font-semibold text-muted-foreground">
              Bate-papo por texto
            </p>
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
          <div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Digite uma pergunta para a Frotak IA..."
              className="min-h-12 resize-none"
            />
            <Button
              type="button"
              className="h-12 gap-2"
              onClick={() => void sendMessage()}
              disabled={sending || !draft.trim()}
            >
              {sending ? <LoaderCircle className="size-4 animate-spin" /> : "Enviar"}
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
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Bot className="size-4" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[78%] whitespace-pre-wrap rounded-2xl border px-4 py-3 text-[13.5px] font-semibold leading-relaxed",
          assistant
            ? "border-border bg-surface-2 text-foreground"
            : "border-primary/20 bg-primary text-primary-foreground",
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
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground">
          <User className="size-4" />
        </div>
      ) : null}
    </div>
  );
}
