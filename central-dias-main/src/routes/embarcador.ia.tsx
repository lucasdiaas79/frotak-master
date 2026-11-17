import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowUp, Bot, Sparkles, User } from "lucide-react";
import { PageTitle } from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { answerLocally } from "@/lib/shipper/analytics";
import { useShipperPortal } from "@/lib/shipper/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/ia")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: ShipperAiPage,
});

type Message = { id: string; role: "user" | "assistant"; text: string; pending?: boolean };

const SUGGESTIONS = [
  "Resumo de hoje",
  "Quais cargas estão com problema?",
  "Qual transportadora mais demora para mandar canhoto?",
  "Quanto tempo os caminhões esperaram na doca?",
  "Ranking das transportadoras",
  "Quanto CO₂ minhas cargas emitiram?",
];

function ShipperAiPage() {
  const { data, askAi } = useShipperPortal();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!data || startedRef.current) return;
    startedRef.current = true;
    const first = data.profile.userName.split(/[\s@]/)[0];
    setMessages([
      {
        id: "intro",
        role: "assistant",
        text: `Olá, ${first}! Sou a Frotak IA da ${data.profile.companyName}. ${answerLocally("resumo", data)}`,
      },
    ]);
    if (search.q) {
      void send(search.q);
      void navigate({ search: { q: undefined }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setDraft("");
    setBusy(true);
    const pendingId = `a-${Date.now()}`;
    const history = messages
      .filter((m) => !m.pending && m.id !== "intro")
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", text: question },
      { id: pendingId, role: "assistant", text: "Pensando...", pending: true },
    ]);
    try {
      const answer = await askAi(question, history);
      setMessages((current) =>
        current.map((m) => (m.id === pendingId ? { ...m, text: answer, pending: false } : m)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não consegui responder agora.";
      setMessages((current) =>
        current.map((m) => (m.id === pendingId ? { ...m, text: message, pending: false } : m)),
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <div className="flex h-[calc(100dvh-150px)] flex-col gap-4 md:h-[calc(100dvh-120px)]">
      <PageTitle
        eyebrow="Frotak IA"
        title="Pergunte sobre suas cargas"
        subtitle="Ela responde com os dados das suas cargas e transportadoras. Não tem acesso a valores de frete."
      />

      <div className="premium-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-3", message.role === "user" && "flex-row-reverse")}
            >
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                  message.role === "user"
                    ? "bg-surface-2 text-muted-foreground"
                    : "bg-primary/12 text-primary",
                )}
              >
                {message.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
              </span>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-line rounded-[20px] px-4 py-3 text-[14px] leading-relaxed",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card",
                  message.pending && "animate-pulse text-muted-foreground",
                )}
              >
                {message.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                disabled={busy}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-[12px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <Sparkles className="size-3 text-primary" /> {suggestion}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ex.: onde está o caminhão da Transportes Rio Real?"
              className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[14px] outline-none focus:border-primary/50"
            />
            <Button
              type="submit"
              className="size-11 shrink-0 rounded-full p-0"
              disabled={busy || !draft.trim()}
              aria-label="Enviar"
            >
              <ArrowUp className="size-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
