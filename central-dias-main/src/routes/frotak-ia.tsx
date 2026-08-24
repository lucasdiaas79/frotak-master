import { createFileRoute } from "@tanstack/react-router";
import { Bot, Download, LoaderCircle, Mic, MicOff, Send, User, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentAccessToken } from "@/lib/auth";
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

type ChatMode = "text" | "voice";
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";
type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  voice?: boolean;
  pending?: boolean;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type LegacyVoiceSession = {
  sendRealtimeInput: (input: unknown) => void;
  close: () => void;
};

type LegacyLiveServerMessage = {
  setupComplete?: unknown;
  serverContent?: {
    interrupted?: boolean;
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
    turnComplete?: boolean;
  };
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Ola. Eu sou a Frotak IA. Ja posso conversar por texto. Para voz, ative o microfone e fale normalmente.",
  },
];

const SPEECH_RMS_THRESHOLD = 0.018;
const SILENCE_END_MS = 850;
const INTERNAL_REASONING_PATTERN =
  /\b(analyzing|identifying|pinpointing|locating|interpreting|listing|focusing|refining|examining|calculating|confirming|verifying|cross-referencing|initial scan|good lead|my plan|my approach|i'?m now|i will|i have|i'?ve|therefore|proxy|requested|context|trackerPositions|calculei|calculando|confirmei|confirmando|verifiquei|verificando|analisei|analisando|interpretei|interpretando|identifiquei|identificando|decidi|entendi a pergunta|objeto|chave|meu plano|minha abordagem|vou responder|estou consultando|estou analisando)\b/i;
const PORTUGUESE_SIGNAL_PATTERN =
  /[áàâãéêíóôõúç]|\b(o|a|os|as|um|uma|de|da|do|das|dos|em|no|na|nos|nas|para|por|com|sem|que|qual|quais|tem|está|são|foi|foram|frota|caminh|motorista|veículo|placa|posição|localização|cidade|estado|frete|despesa|lucro)\b/i;

function base64ToBytes(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pcm16ToWavBlob(pcm: Uint8Array, sampleRate = 24000) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  return new Blob([header, pcm], { type: "audio/wav" });
}

function audioBlobFromInlineData(data: string, mimeType?: string) {
  const bytes = base64ToBytes(data);
  if (mimeType?.includes("pcm")) return pcm16ToWavBlob(bytes);
  return new Blob([bytes], { type: mimeType || "audio/wav" });
}

async function playInlineAudio(data: string, mimeType?: string) {
  const blob = audioBlobFromInlineData(data, mimeType);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Falha ao reproduzir audio da Frotak IA."));
    void audio.play().catch(reject);
  }).finally(() => {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  });
}

function float32ToPcm16Base64(input: Float32Array) {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

function audioSampleRate(mimeType?: string) {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24000;
}

function pcm16ToAudioBuffer(audioContext: AudioContext, data: string, sampleRate: number) {
  const bytes = base64ToBytes(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    channel[index] = view.getInt16(index * 2, true) / 32768;
  }

  return buffer;
}

function rms(input: Float32Array) {
  const total = input.reduce((sum, sample) => sum + sample * sample, 0);
  return Math.sqrt(total / Math.max(input.length, 1));
}

function silencePcmBase64(sampleCount: number) {
  const bytes = new Uint8Array(sampleCount * 2);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function cleanAssistantText(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isInternalReasoningBlock(text: string) {
  return INTERNAL_REASONING_PATTERN.test(text);
}

function isEnglishHeading(text: string) {
  const value = text.trim();
  if (!value || value.length > 80) return false;
  if (/[.!?:,;]/.test(value)) return false;
  if (PORTUGUESE_SIGNAL_PATTERN.test(value)) return false;
  return /^[A-Z][A-Za-z0-9 "'-]+$/.test(value);
}

function splitResponseUnits(text: string) {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/)
    .map((unit) => unit.trim())
    .filter(Boolean);
}

function isUsefulVoiceAnswerUnit(text: string) {
  if (isEnglishHeading(text)) return false;
  if (isInternalReasoningBlock(text)) return false;
  return PORTUGUESE_SIGNAL_PATTERN.test(text);
}

function finalVoiceText(rawText: string) {
  const cleanText = cleanAssistantText(rawText);
  if (!cleanText) return "";

  const visibleUnits = splitResponseUnits(cleanText).filter(isUsefulVoiceAnswerUnit);
  if (visibleUnits.length > 0) return visibleUnits.join("\n\n").trim();

  if (!isInternalReasoningBlock(cleanText)) return cleanText;
  return "Resposta concluida.";
}

function FrotakIaPage() {
  const [mode, setMode] = useState<ChatMode>("text");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<LegacyVoiceSession | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackQueueRef = useRef(Promise.resolve());
  const nextAudioStartRef = useRef(0);
  const voiceAssistantMessageIdRef = useRef<string | null>(null);
  const voiceAssistantTextRef = useRef("");
  const modeRef = useRef<ChatMode>("text");
  const voiceStateRef = useRef<VoiceState>("idle");
  const stoppingVoiceRef = useRef(false);
  const voiceSendingRef = useRef(false);
  const speakingInputRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const lastAudioFlushAtRef = useRef(0);

  const voiceEnabled = mode === "voice";
  const listening = voiceEnabled && voiceState === "listening";

  const statusLabel = useMemo(() => {
    if (voiceState === "connecting") return "Conectando conversa por voz";
    if (voiceState === "listening") return "Microfone captando continuamente";
    if (voiceState === "speaking") return "Frotak IA respondendo em voz";
    if (voiceState === "error") return "Voz indisponivel no momento";
    return voiceEnabled ? "Voz pronta para iniciar" : "Bate-papo por texto";
  }, [voiceEnabled, voiceState]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const appendMessage = (message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  };

  const updateMessage = (id: string, text: string, pending = false) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, text, pending } : message)),
    );
  };

  const resetVoiceTurn = () => {
    voiceAssistantMessageIdRef.current = null;
    voiceAssistantTextRef.current = "";
  };

  const ensureVoiceAssistantMessage = () => {
    if (voiceAssistantMessageIdRef.current) return voiceAssistantMessageIdRef.current;

    const id = `voice-assistant-${Date.now()}`;
    voiceAssistantMessageIdRef.current = id;
    appendMessage({
      id,
      role: "assistant",
      text: "Respondendo...",
      voice: true,
      pending: true,
    });
    return id;
  };

  const appendVoiceAssistantText = (text: string) => {
    voiceAssistantTextRef.current += text.replace(/\*/g, "");
    ensureVoiceAssistantMessage();
  };

  const speakAssistantText = (text: string) =>
    new Promise<void>((resolve) => {
      const speech = window.speechSynthesis;
      if (!speech || !text.trim()) {
        resolve();
        return;
      }

      speech.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = speech.getVoices();
      utterance.lang = "pt-BR";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.voice =
        voices.find((voice) => voice.lang.toLowerCase().startsWith("pt-br")) ??
        voices.find((voice) => voice.lang.toLowerCase().startsWith("pt")) ??
        null;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speech.speak(utterance);
    });

  const restartVoiceListening = () => {
    if (stoppingVoiceRef.current || voiceSendingRef.current || modeRef.current !== "voice") return;
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.start();
      setVoiceState("listening");
    } catch {
      // O navegador lança erro se o reconhecimento ja estiver ativo.
    }
  };

  const handleVoiceQuestion = async (transcript: string) => {
    const question = transcript.trim();
    if (!question || voiceSendingRef.current) return;

    voiceSendingRef.current = true;
    setVoiceState("speaking");
    const assistantId = `voice-assistant-${Date.now()}`;
    appendMessage({
      id: assistantId,
      role: "assistant",
      text: "Respondendo...",
      voice: true,
      pending: true,
    });

    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const history = messages
        .filter((message) => !message.pending)
        .map((message) => ({ role: message.role, text: message.text }));
      const response = await sendFrotakAiChatMessage({
        data: { accessToken, message: question, history },
      });
      const answer = finalVoiceText(response.text) || cleanAssistantText(response.text);

      updateMessage(assistantId, answer, false);
      await speakAssistantText(answer);
      if (!stoppingVoiceRef.current) setVoiceState("listening");
    } catch (error) {
      console.error("[Frotak IA] voice chat failed", error);
      updateMessage(
        assistantId,
        "Nao foi possivel concluir a conversa com a Frotak IA. Tente novamente.",
        false,
      );
      toast.error("Nao foi possivel concluir a conversa com a Frotak IA.");
      setVoiceState("error");
    } finally {
      voiceSendingRef.current = false;
      window.setTimeout(restartVoiceListening, 250);
    }
  };

  const getOutputAudioContext = () => {
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== "closed") {
      return outputAudioContextRef.current;
    }
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    outputAudioContextRef.current = audioContext;
    nextAudioStartRef.current = audioContext.currentTime + 0.08;
    return audioContext;
  };

  const playVoiceChunk = async (data: string, mimeType?: string) => {
    if (!mimeType?.includes("pcm")) {
      await playInlineAudio(data, mimeType);
      return;
    }

    const audioContext = getOutputAudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    const buffer = pcm16ToAudioBuffer(audioContext, data, audioSampleRate(mimeType));
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(audioContext.currentTime + 0.04, nextAudioStartRef.current);
    source.start(startAt);
    nextAudioStartRef.current = startAt + buffer.duration;
  };

  const finishVoiceTurn = () => {
    const assistantId = voiceAssistantMessageIdRef.current;
    if (assistantId) {
      updateMessage(assistantId, finalVoiceText(voiceAssistantTextRef.current), false);
    }

    const playbackDelay = outputAudioContextRef.current
      ? Math.max(
          150,
          (nextAudioStartRef.current - outputAudioContextRef.current.currentTime) * 1000 + 250,
        )
      : 250;

    window.setTimeout(() => {
      if (sessionRef.current && voiceStateRef.current !== "error") setVoiceState("listening");
      resetVoiceTurn();
    }, playbackDelay);
  };

  const handleLiveMessage = (event: LegacyLiveServerMessage) => {
    if (event.setupComplete) {
      setVoiceState("listening");
      return;
    }

    const content = event.serverContent;
    if (!content) return;

    if (content.interrupted) setVoiceState("listening");
    if (content.outputTranscription?.text)
      appendVoiceAssistantText(content.outputTranscription.text);
    if (content.modelTurn?.parts) {
      content.modelTurn.parts.forEach((part) => {
        if (part.text) appendVoiceAssistantText(part.text);
        if (part.inlineData?.data) {
          setVoiceState("speaking");
          ensureVoiceAssistantMessage();
          playbackQueueRef.current = playbackQueueRef.current
            .then(() => playVoiceChunk(part.inlineData!.data!, part.inlineData?.mimeType))
            .catch((error) => {
              console.error("[Frotak IA] audio playback failed", error);
            });
        }
      });
    }

    if (content.turnComplete && voiceStateRef.current !== "error") finishVoiceTurn();
  };

  const stopVoice = () => {
    stoppingVoiceRef.current = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    inputProcessorRef.current?.disconnect();
    inputProcessorRef.current = null;
    inputSourceRef.current?.disconnect();
    inputSourceRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    void outputAudioContextRef.current?.close();
    outputAudioContextRef.current = null;
    nextAudioStartRef.current = 0;
    resetVoiceTurn();
    speakingInputRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    sessionRef.current?.close();
    sessionRef.current = null;
    setVoiceState("idle");
    modeRef.current = "text";
    setMode("text");
    window.setTimeout(() => {
      stoppingVoiceRef.current = false;
    }, 0);
  };

  const startVoice = async () => {
    if (recognitionRef.current || voiceState === "connecting") return;
    stoppingVoiceRef.current = false;
    modeRef.current = "voice";
    setMode("voice");
    setVoiceState("connecting");

    try {
      const SpeechRecognitionConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionConstructor) {
        throw new Error("Este navegador nao suporta conversa por voz.");
      }

      const recognition = new SpeechRecognitionConstructor() as BrowserSpeechRecognition;
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        void handleVoiceQuestion(transcript);
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        console.error("[Frotak IA] speech recognition failed", event.error);
        toast.error("Nao consegui ouvir com clareza. Tente falar novamente.");
        setVoiceState("listening");
      };
      recognition.onend = () => {
        if (!stoppingVoiceRef.current && !voiceSendingRef.current) {
          window.setTimeout(restartVoiceListening, 250);
        }
      };
      recognitionRef.current = recognition;
      restartVoiceListening();
    } catch (error) {
      console.error("[Frotak IA] voice start failed", error);
      setVoiceState("error");
      setMode("text");
      toast.error(error instanceof Error ? error.message : "Nao foi possivel iniciar voz.");
      stopVoice();
    }
  };

  // Encerra microfone/sessao Live somente ao desmontar a tela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopVoice, []);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };
    const pendingId = `assistant-${Date.now()}`;
    const history = messages
      .filter((message) => !message.pending)
      .map((message) => ({ role: message.role, text: message.text }));

    appendMessage(userMessage);
    appendMessage({
      id: pendingId,
      role: "assistant",
      text: "Pensando...",
      pending: true,
      voice: voiceEnabled,
    });
    setDraft("");
    setSending(true);

    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      if (voiceEnabled && sessionRef.current) {
        sessionRef.current.sendClientContent({
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        });
        updateMessage(pendingId, "Mensagem enviada para a conversa por voz.", false);
        return;
      }

      const response = await sendFrotakAiChatMessage({
        data: {
          accessToken,
          message: text,
          history,
        },
      });
      updateMessage(pendingId, response.text, false);
    } catch (error) {
      updateMessage(
        pendingId,
        error instanceof Error ? error.message : "Nao foi possivel falar com a Frotak IA.",
        false,
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100dvh-112px)] flex-col gap-4 px-3 pb-4 md:px-0">
      <PageHeader
        title="Frotak IA"
        subtitle="Assistente operacional em texto e voz"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="h-10 gap-2">
              <a href="/FROTAK_IA_RELATORIO_COMPLETO.txt" download>
                <Download className="size-4" />
                Relatorio IA
              </a>
            </Button>
            <div className="inline-flex rounded-2xl border border-border bg-surface-2/70 p-1">
              <button
                type="button"
                onClick={() => {
                  if (voiceEnabled) stopVoice();
                  setMode("text");
                }}
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
                onClick={() => void startVoice()}
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
                listening || voiceState === "speaking"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-primary/20 bg-primary/10 text-primary",
              )}
            >
              {voiceEnabled ? <Mic className="size-5" /> : <Bot className="size-5" />}
              {listening ? (
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
          {voiceState === "connecting" ? (
            <div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface-2/70 px-3 text-[12px] font-bold text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Conectando
            </div>
          ) : null}
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
              variant={listening ? "default" : "outline"}
              className="h-12 gap-2"
              onClick={() => (voiceEnabled ? stopVoice() : void startVoice())}
              disabled={voiceState === "connecting"}
            >
              {voiceState === "connecting" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : listening ? (
                <Mic className="size-4" />
              ) : (
                <MicOff className="size-4" />
              )}
              {listening ? "Encerrar voz" : "Ativar voz"}
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
              placeholder={
                voiceEnabled
                  ? "O microfone esta captando. Digite tambem se quiser..."
                  : "Digite uma pergunta para a Frotak IA..."
              }
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
          message.pending && "animate-pulse",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.text}</div>
        {message.voice ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
            <Volume2 className="size-3.5" />
            Voz e texto
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
