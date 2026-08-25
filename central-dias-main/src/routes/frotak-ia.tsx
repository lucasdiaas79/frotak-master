import { createFileRoute } from "@tanstack/react-router";
import { Bot, LoaderCircle, Mic, MicOff, Send, User, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendFrotakAiChatMessage } from "@/lib/frotakAi";
import {
  cancelSpeech,
  createPortugueseSpeechRecognition,
  openCleanMicrophone,
  speakPortuguese,
  stopMicrophone,
  type SpeechRecognition,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
} from "@/lib/frotakVoice";
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
  hidden?: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Ola. Eu sou a Frotak IA. Posso conversar por texto ou por voz.",
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
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [voiceActive, setVoiceActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voz pronta");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const voiceActiveRef = useRef(false);
  const sendingRef = useRef(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(
    () => () => {
      stopVoiceSession();
    },
    [],
  );

  const updateMessage = (id: string, text: string, pending = false) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, text, pending } : message)),
    );
  };

  const sendMessage = async (forcedText?: string, options?: { voice?: boolean }) => {
    const text = (forcedText ?? draft).trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      hidden: options?.voice,
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
    setVoiceStatus(options?.voice ? "Pensando na resposta..." : voiceStatus);
    setMessages((current) => [...current, userMessage, pendingMessage]);

    try {
      const history = messages
        .filter((message) => !message.pending)
        .map((message) => ({ role: message.role, text: message.text }));
      const response = await sendFrotakAiChatMessage({
        data: { message: text, history },
      });

      const answer = cleanAssistantText(response.text);
      updateMessage(pendingId, answer, false);

      if (options?.voice && voiceActiveRef.current) {
        setSpeaking(true);
        setVoiceStatus("Respondendo por voz");
        await speakPortuguese(answer);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel falar com a Frotak IA.";
      updateMessage(pendingId, message, false);
      toast.error(message);
    } finally {
      setSpeaking(false);
      setSending(false);
      if (voiceActiveRef.current) setVoiceStatus("Pode falar");
    }
  };

  const stopVoiceSession = () => {
    voiceActiveRef.current = false;
    setVoiceActive(false);
    setListening(false);
    setSpeaking(false);
    setVoiceStatus("Voz pronta");
    cancelSpeech();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.onspeechstart = null;
      try {
        recognition.abort();
      } catch {
        // Browser engines can throw when aborting an inactive recognizer.
      }
    }

    stopMicrophone(microphoneRef.current);
    microphoneRef.current = null;
  };

  const startVoiceSession = async () => {
    const recognition = createPortugueseSpeechRecognition();
    if (!recognition) {
      toast.error("Reconhecimento de voz indisponivel neste navegador.");
      return;
    }

    try {
      microphoneRef.current = await openCleanMicrophone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel abrir o microfone.");
      return;
    }

    voiceActiveRef.current = true;
    recognitionRef.current = recognition;
    setMode("voice");
    setVoiceActive(true);
    setVoiceStatus("Pode falar");

    recognition.onstart = () => {
      setListening(true);
      if (!speakingRef.current && !sendingRef.current) setVoiceStatus("Pode falar");
    };

    recognition.onspeechstart = () => {
      if (speakingRef.current) {
        cancelSpeech();
        setSpeaking(false);
        setVoiceStatus("Ouvindo");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("[frotak-ia] voice recognition failed", {
        error: event.error,
        message: event.message,
      });
      setVoiceStatus("Voz indisponivel no momento");
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) transcript += ` ${result[0]?.transcript ?? ""}`;
      }

      const text = transcript.trim();
      if (text.length < 3 || sendingRef.current) return;
      void sendMessage(text, { voice: true });
    };

    recognition.onend = () => {
      setListening(false);
      if (!voiceActiveRef.current) return;
      window.setTimeout(() => {
        if (!voiceActiveRef.current || !recognitionRef.current) return;
        try {
          recognitionRef.current.start();
        } catch {
          // Chrome may reject an immediate restart while the engine is settling.
        }
      }, 350);
    };

    try {
      recognition.start();
    } catch {
      stopVoiceSession();
      toast.error("Nao foi possivel iniciar a conversa por voz.");
    }
  };

  const toggleVoice = () => {
    if (voiceActive) {
      stopVoiceSession();
      return;
    }
    void startVoiceSession();
  };

  return (
    <div className="flex h-full min-h-[calc(100dvh-112px)] flex-col gap-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Frotak IA"
        subtitle="Assistente operacional em texto e voz"
        className="mx-0 mt-3 md:mt-0"
        actions={
          <div className="flex rounded-2xl border border-border bg-surface-2 p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === "text" ? "default" : "ghost"}
              onClick={() => setMode("text")}
            >
              Texto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "voice" ? "default" : "ghost"}
              onClick={() => setMode("voice")}
            >
              Voz
            </Button>
          </div>
        }
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
              {mode === "voice"
                ? voiceActive
                  ? voiceStatus
                  : "Toque em Ativar voz para iniciar"
                : "Bate-papo por texto"}
            </p>
          </div>
          {mode === "voice" ? (
            <div className="ml-auto flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-[12px] font-bold text-muted-foreground">
              {speaking ? (
                <Volume2 className="size-3.5 text-primary" />
              ) : voiceActive && listening ? (
                <Mic className="size-3.5 text-primary" />
              ) : (
                <MicOff className="size-3.5" />
              )}
              {speaking ? "Respondendo" : voiceActive && listening ? "Ouvindo" : "Parado"}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto bg-surface/25 px-4 py-5">
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {messages
              .filter((message) => !message.hidden)
              .map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
          </div>
        </div>

        <div className="border-t border-border/80 bg-surface/65 p-3">
          <div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
            <Button
              type="button"
              variant={voiceActive ? "destructive" : "outline"}
              className="h-12 gap-2"
              onClick={toggleVoice}
            >
              {voiceActive ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              {voiceActive ? "Encerrar voz" : "Ativar voz"}
            </Button>
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
