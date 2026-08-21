import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { Bot, Download, LoaderCircle, Mic, MicOff, Send, User, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentAccessToken } from "@/lib/auth";
import { createFrotakAiVoiceToken, sendFrotakAiChatMessage } from "@/lib/frotakAi";
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

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Ola. Eu sou a Frotak IA. Ja posso conversar por texto. Para voz, ative o microfone e fale normalmente.",
  },
];

const SPEECH_RMS_THRESHOLD = 0.018;
const SILENCE_END_MS = 850;

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

function FrotakIaPage() {
  const [mode, setMode] = useState<ChatMode>("text");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackQueueRef = useRef(Promise.resolve());
  const nextAudioStartRef = useRef(0);
  const voiceAssistantMessageIdRef = useRef<string | null>(null);
  const voiceAssistantTextRef = useRef("");
  const speakingInputRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const lastAudioFlushAtRef = useRef(0);

  const voiceEnabled = mode === "voice";
  const listening = voiceEnabled && voiceState === "listening";

  const statusLabel = useMemo(() => {
    if (voiceState === "connecting") return "Conectando ao Gemini Live";
    if (voiceState === "listening") return "Microfone captando continuamente";
    if (voiceState === "speaking") return "Frotak IA respondendo em voz";
    if (voiceState === "error") return "Voz indisponivel no momento";
    return voiceEnabled ? "Voz pronta para iniciar" : "Bate-papo por texto";
  }, [voiceEnabled, voiceState]);

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

  const appendVoiceAssistantText = (text: string) => {
    voiceAssistantTextRef.current += text.replace(/\*/g, "");
    const cleanText = voiceAssistantTextRef.current.trim();
    if (!cleanText) return;

    if (voiceAssistantMessageIdRef.current) {
      updateMessage(voiceAssistantMessageIdRef.current, cleanText, true);
      return;
    }

    const id = `voice-assistant-${Date.now()}`;
    voiceAssistantMessageIdRef.current = id;
    appendMessage({
      id,
      role: "assistant",
      text: cleanText,
      voice: true,
      pending: true,
    });
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
    if (assistantId) updateMessage(assistantId, voiceAssistantTextRef.current.trim(), false);

    const playbackDelay = outputAudioContextRef.current
      ? Math.max(
          150,
          (nextAudioStartRef.current - outputAudioContextRef.current.currentTime) * 1000 + 250,
        )
      : 250;

    window.setTimeout(() => {
      if (sessionRef.current && voiceState !== "error") setVoiceState("listening");
      resetVoiceTurn();
    }, playbackDelay);
  };

  const handleLiveMessage = (event: LiveServerMessage) => {
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
          playbackQueueRef.current = playbackQueueRef.current
            .then(() => playVoiceChunk(part.inlineData!.data!, part.inlineData?.mimeType))
            .catch((error) => {
              console.error("[Frotak IA] audio playback failed", error);
            });
        }
      });
    }

    if (content.turnComplete && voiceState !== "error") finishVoiceTurn();
  };

  const stopVoice = () => {
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
    setMode("text");
  };

  const startVoice = async () => {
    if (sessionRef.current || voiceState === "connecting") return;
    setMode("voice");
    setVoiceState("connecting");

    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");
      const { token, model } = await createFrotakAiVoiceToken({
        data: { accessToken, requestedAt: new Date().toISOString() },
      });

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => setVoiceState("listening"),
          onmessage: handleLiveMessage,
          onerror: (event) => {
            console.error("[Frotak IA] live error", event);
            setVoiceState("error");
            toast.error("Nao foi possivel manter a conversa por voz.");
          },
          onclose: () => {
            if (voiceState !== "error") setVoiceState("idle");
          },
        },
      });

      sessionRef.current = session;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      inputProcessorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!sessionRef.current || audioContext.state === "closed") return;
        const channel = event.inputBuffer.getChannelData(0);
        const now = performance.now();
        const volume = rms(channel);
        const speaking = volume >= SPEECH_RMS_THRESHOLD;

        if (speaking) {
          speakingInputRef.current = true;
          lastSpeechAtRef.current = now;
        }

        if (!speakingInputRef.current) return;

        if (!speaking && now - lastSpeechAtRef.current > SILENCE_END_MS) {
          if (now - lastAudioFlushAtRef.current > SILENCE_END_MS) {
            sessionRef.current.sendRealtimeInput({ audioStreamEnd: true });
            lastAudioFlushAtRef.current = now;
          }
          speakingInputRef.current = false;
          return;
        }

        sessionRef.current.sendRealtimeInput({
          audio: {
            data: speaking ? float32ToPcm16Base64(channel) : silencePcmBase64(channel.length),
            mimeType: `audio/pcm;rate=${Math.round(audioContext.sampleRate)}`,
          },
        });
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      setVoiceState("listening");
    } catch (error) {
      console.error("[Frotak IA] voice start failed", error);
      setVoiceState("error");
      setMode("text");
      toast.error(error instanceof Error ? error.message : "Nao foi possivel iniciar voz.");
      stopVoice();
    }
  };

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
