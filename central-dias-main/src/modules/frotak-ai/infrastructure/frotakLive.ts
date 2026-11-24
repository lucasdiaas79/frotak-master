import { isFrotakAiTechnicalFailure } from "@/modules/frotak-ai/domain/frotakAiToolCatalog";
import { createBargeInGuard, frameLevel } from "@/modules/frotak-ai/domain/frotakLiveBargeInGuard";
import { createStallWatch } from "@/modules/frotak-ai/domain/frotakLiveStallWatch";
import { createLiveTurn } from "@/modules/frotak-ai/domain/frotakLiveTurn";
import { FrotakSpeechFallback } from "@/modules/frotak-ai/infrastructure/frotakSpeechFallback";

export { primeFrotakSpeechFallback } from "@/modules/frotak-ai/infrastructure/frotakSpeechFallback";

export type FrotakLiveStatus =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "ready"
  | "muted"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error";

export type FrotakLiveSessionOptions = {
  token: string;
  model: string;
  setupConfig?: Record<string, unknown>;
  stream: MediaStream;
  onStatus?: (status: FrotakLiveStatus) => void;
  onText?: (text: string) => void;
  onInputText?: (text: string) => void;
  onPartialText?: (text: string) => void;
  onError?: (message: string) => void;
  onDeterministicAnswer?: (text: string) => Promise<void> | void;
  refreshToken?: () => Promise<{
    token: string;
    model: string;
    setupConfig?: Record<string, unknown>;
  }>;
  onToolCall?: (call: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  }) => Promise<unknown>;
};

const GEMINI_LIVE_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
// Pedacos de 40 ms: a API pede de 20 a 100 ms, e pedaco menor deixa a deteccao de fala mais rapida.
const CAPTURE_CHUNK_SECONDS = 0.04;
// O eco da caixa de som continua um pouco depois do fim do audio da IA.
const ECHO_TAIL_MS = 300;
// Se o usuario parou de falar e nada chegou do modelo (ex.: ruido que o modelo decidiu ignorar),
// a tela volta para "Pode falar" em vez de ficar presa em "Pensando".
const THINKING_WATCHDOG_MS = 7_000;
// Servidor que continua "ouvindo" mesmo depois do audioStreamEnd esta preso (visto no
// gemini-3.8-live: 30 s em "Ouvindo" sem nunca fechar a fala). Passado este tempo, conexao nova.
const STALL_RECONNECT_MS = 4_000;
const ASK_REPEAT_MESSAGE = "Desculpe, nao consegui te ouvir. Pode repetir?";
// Depois de responder a consulta, a resposta do modelo chega em 1 a 5 s (o mais lento medido:
// frase de espera longa no gemini-3.8-live). Passado este limite, a resposta vem do texto pronto
// da ferramenta, na voz de reserva.
const TOOL_ANSWER_TIMEOUT_MS = 8_000;
// Pedaco de audio menor que isto (o servidor as vezes manda 2 bytes) nao toca: so faria a esfera piscar.
const MIN_AUDIO_CHUNK_SECONDS = 0.01;
const FACTUAL_FAIL_CLOSED_MESSAGE =
  "Nao foi possivel consultar os dados da Frotak neste momento. Tente novamente em instantes.";
const TOOL_ANSWER_MISSING_MESSAGE =
  "Nao consegui terminar essa consulta agora. Pode perguntar de novo?";

type GeminiLiveMessage = {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
        text?: string;
      }>;
    };
    outputTranscription?: {
      text?: string;
    };
    inputTranscription?: {
      text?: string;
    };
    interimInputTranscription?: {
      text?: string;
    };
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
  };
  toolCall?: {
    functionCalls?: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>;
  };
  toolCallCancellation?: {
    ids?: string[];
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  goAway?: {
    timeLeft?: string;
  };
  // Inicio e fim da fala do usuario, detectados pelo proprio modelo.
  voiceActivity?: {
    type?: "ACTIVITY_START" | "ACTIVITY_END" | string;
  };
  sessionResumptionUpdate?: {
    newHandle?: string;
    resumable?: boolean;
  };
};

type PendingToolCall = {
  key: string;
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

export async function requestFrotakLiveMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador nao permite usar o microfone aqui.");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    try {
      window.localStorage.setItem("frotak-live-microphone-granted", "true");
    } catch {
      // Browser storage can be disabled; microphone permission still belongs to the browser.
    }
    return stream;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error(
        "Microfone bloqueado. Libere o microfone para central-dias.vercel.app nas permissoes do navegador.",
      );
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("Nenhum microfone foi encontrado neste dispositivo.");
    }
    throw new Error("Nao foi possivel acessar o microfone.");
  }
}

class PcmAudioPlayer {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private onStart?: () => void;
  private onStop?: () => void;

  constructor(callbacks: { onStart?: () => void; onStop?: () => void }) {
    this.onStart = callbacks.onStart;
    this.onStop = callbacks.onStop;
  }

  private ensureContext() {
    this.context ??= new AudioContext({ sampleRate: OUTPUT_RATE });
    return this.context;
  }

  async enqueue(base64Pcm: string) {
    const context = this.ensureContext();
    if (context.state === "suspended") await context.resume();

    const pcm = base64ToInt16(base64Pcm);
    if (pcm.length < OUTPUT_RATE * MIN_AUDIO_CHUNK_SECONDS) return;

    const buffer = context.createBuffer(1, pcm.length, OUTPUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = Math.max(-1, Math.min(1, pcm[index] / 32768));
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const now = context.currentTime;
    const startAt = Math.max(now + 0.035, this.nextStart);
    this.nextStart = startAt + buffer.duration;
    this.sources.add(source);
    this.onStart?.();

    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onStop?.();
    };
    source.start(startAt);
  }

  stopNow() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may already be stopped by the audio engine.
      }
    });
    this.sources.clear();
    this.nextStart = this.context?.currentTime ?? 0;
    this.onStop?.();
  }

  async close() {
    this.stopNow();
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }
}

export class FrotakLiveSession {
  private options: FrotakLiveSessionOptions;
  private websocket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private muteGain: GainNode | null = null;
  private player: PcmAudioPlayer;
  private fallback: FrotakSpeechFallback;
  private setupComplete = false;
  private captureReady = false;
  private closed = false;
  private inputTranscriptBuffer = "";
  private captureBuffer: number[] = [];
  private setupTimeout: number | null = null;
  private thinkingTimer: number | null = null;
  private answerTimer: number | null = null;
  private stallTimer: number | null = null;
  // Reconexao por servidor preso: a pergunta se perdeu, entao a IA pede para repetir.
  private askRepeatAfterReconnect = false;
  private reconnectTimer: number | null = null;
  private reconnectStableTimer: number | null = null;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private sessionResumptionHandle: string | null = null;
  // A IA esta tocando audio (do Gemini ou da voz de reserva).
  private speaking = false;
  private playerActive = false;
  private fallbackActive = false;
  private microphoneEnabled = true;
  private turn = createLiveTurn();
  private toolCallSeq = 0;
  private bargeInGuard = createBargeInGuard();
  private stallWatch = createStallWatch();
  private speakingTailUntil = 0;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;

  constructor(options: FrotakLiveSessionOptions) {
    this.options = options;
    this.stream = options.stream;
    this.player = new PcmAudioPlayer({
      onStart: () => this.setPlayback("player", true),
      onStop: () => this.setPlayback("player", false),
    });
    this.fallback = new FrotakSpeechFallback({
      onStart: () => this.setPlayback("fallback", true),
      onEnd: () => this.setPlayback("fallback", false),
    });
  }

  async start() {
    this.closed = false;
    this.reconnectAttempts = 0;
    const ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    try {
      await this.connect(false);
      await ready;
    } finally {
      this.resolveReady = null;
      this.rejectReady = null;
    }
  }

  sendText(text: string) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
    this.player.stopNow();
    this.fallback.cancel();
    this.clearAnswerTimer();
    this.turn.textSent();
    this.startThinkingWatchdog();
    this.sendRealtimeInput({ text });
    this.refreshStatus();
  }

  setMicrophoneEnabled(enabled: boolean) {
    if (this.closed || this.microphoneEnabled === enabled) return;
    this.microphoneEnabled = enabled;
    this.captureBuffer = [];
    this.bargeInGuard.reset();
    this.stallWatch.ended();
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });

    if (!enabled) this.sendRealtimeInput({ audioStreamEnd: true });
    this.refreshStatus();
  }

  async stop() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    this.closed = true;
    this.rejectReady?.(new Error("Conexao de voz cancelada."));
    if (this.setupTimeout) window.clearTimeout(this.setupTimeout);
    this.clearThinkingWatchdog();
    this.clearAnswerTimer();
    this.clearStallTimer();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.reconnectStableTimer) window.clearTimeout(this.reconnectStableTimer);
    this.setupTimeout = null;
    this.reconnectTimer = null;
    this.reconnectStableTimer = null;
    this.captureBuffer = [];
    this.fallback.cancel();
    this.captureNode?.port.close();
    this.captureNode?.disconnect();
    this.muteGain?.disconnect();
    this.source?.disconnect();
    this.captureNode = null;
    this.muteGain = null;
    this.source = null;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    await this.player.close();

    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.close(1000, "closed by user");
    } else {
      this.websocket?.close();
    }
    this.websocket = null;
    this.options.onStatus?.("idle");
  }

  private async connect(isReconnect: boolean) {
    if (isReconnect) {
      this.reconnecting = true;
      this.options.onStatus?.("reconnecting");
      // O token efemero vale para uma conexao so: toda reconexao precisa de um novo.
      // O handle de retomada continua indo no setup para manter o contexto da conversa.
      if (this.options.refreshToken) {
        const next = await this.options.refreshToken();
        this.options.token = next.token;
        this.options.model = next.model;
        this.options.setupConfig = next.setupConfig;
      }
    } else {
      this.options.onStatus?.("connecting");
    }

    this.websocket = new WebSocket(
      `${GEMINI_LIVE_WS}?access_token=${encodeURIComponent(this.options.token)}`,
    );
    this.websocket.binaryType = "arraybuffer";
    this.websocket.onmessage = (event) => {
      void this.handleMessage(event);
    };
    this.websocket.onerror = (event) => {
      console.error("[frotakLive] websocket error", event);
      if (!this.closed) void this.scheduleReconnect("erro de conexao");
    };
    this.websocket.onclose = (event) => {
      if (event.code !== 1000) {
        console.error("[frotakLive] websocket closed", {
          code: event.code,
          reason: event.reason,
        });
      }
      if (!this.closed && !this.reconnecting) void this.scheduleReconnect("conexao encerrada");
    };

    await waitForWebSocketOpen(this.websocket);
    this.setupTimeout = window.setTimeout(() => {
      if (this.closed || this.setupComplete) return;
      console.error("[frotakLive] setup timeout");
      void this.scheduleReconnect("timeout de setup");
    }, 12_000);
    this.websocket.send(
      JSON.stringify({
        setup: {
          model: `models/${this.options.model}`,
          ...(this.options.setupConfig ?? {}),
          sessionResumption: this.sessionResumptionHandle
            ? { handle: this.sessionResumptionHandle }
            : {},
        },
      }),
    );
  }

  private async startAudioCapture() {
    if (!this.stream) return;
    if (this.captureNode) return;
    if (!window.AudioWorkletNode) {
      throw new Error("Este navegador nao suporta o modo de voz em tempo real.");
    }

    this.context = new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();

    await this.context.audioWorklet.addModule("/frotak-live-capture-processor.js");

    this.source = this.context.createMediaStreamSource(this.stream);
    this.captureNode = new AudioWorkletNode(this.context, "frotak-live-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    this.muteGain = this.context.createGain();
    this.muteGain.gain.value = 0;

    this.captureNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (
        this.closed ||
        !this.microphoneEnabled ||
        !this.setupComplete ||
        !this.websocket ||
        this.websocket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      // O servidor abriu a fala do usuario e nao fechou, com o microfone ja quieto: destrava.
      if (this.stallWatch.frame(frameLevel(event.data), this.bargeInGuard.state().userLevel)) {
        console.info("[frotakLive] fala sem fim do servidor: audioStreamEnd para destravar");
        this.sendRealtimeInput({ audioStreamEnd: true });
        this.armStallReconnect();
      }
      const frames = this.bargeInGuard.process(event.data, this.isAssistantAudible());
      for (const frame of frames) this.captureBuffer.push(...frame);

      const sampleRate = this.context?.sampleRate ?? 48_000;
      const chunkSize = Math.round(sampleRate * CAPTURE_CHUNK_SECONDS);
      while (this.captureBuffer.length >= chunkSize) {
        const chunk = new Float32Array(this.captureBuffer.splice(0, chunkSize));
        const pcm = resampleToPcm16(chunk, sampleRate, INPUT_RATE);
        this.sendRealtimeInput({
          audio: {
            data: int16ToBase64(pcm),
            mimeType: `audio/pcm;rate=${INPUT_RATE}`,
          },
        });
      }
    };

    this.source.connect(this.captureNode);
    this.captureNode.connect(this.muteGain);
    this.muteGain.connect(this.context.destination);
  }

  private sendRealtimeInput(realtimeInput: Record<string, unknown>) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || this.closed)
      return false;
    this.websocket.send(JSON.stringify({ realtimeInput }));
    return true;
  }

  private closeWebSocket() {
    this.websocket?.close();
    this.websocket = null;
  }

  // A IA esta tocando audio, ou acabou de tocar e o eco ainda pode estar no microfone.
  private isAssistantAudible() {
    return this.speaking || performance.now() < this.speakingTailUntil;
  }

  private setPlayback(source: "player" | "fallback", active: boolean) {
    if (source === "player") this.playerActive = active;
    else this.fallbackActive = active;
    const speaking = this.playerActive || this.fallbackActive;
    if (this.speaking && !speaking) this.speakingTailUntil = performance.now() + ECHO_TAIL_MS;
    this.speaking = speaking;
    this.refreshStatus();
  }

  // O que a tela mostra sai de um lugar so: audio tocando, fala do usuario segundo o modelo,
  // e o que ainda falta chegar do modelo (resposta, consulta, resposta da consulta).
  private refreshStatus() {
    if (this.closed) return;
    if (this.reconnecting) {
      this.options.onStatus?.("reconnecting");
      return;
    }
    if (!this.setupComplete) return;
    if (this.speaking) {
      this.options.onStatus?.("speaking");
      return;
    }
    const status = this.turn.status();
    // Antes do microfone ficar pronto, "Pode falar" ainda nao e verdade.
    if (status === "ready" && !this.captureReady) return;
    this.options.onStatus?.(status === "ready" && !this.microphoneEnabled ? "muted" : status);
  }

  private clearThinkingWatchdog() {
    if (this.thinkingTimer) window.clearTimeout(this.thinkingTimer);
    this.thinkingTimer = null;
  }

  private startThinkingWatchdog() {
    this.clearThinkingWatchdog();
    this.thinkingTimer = window.setTimeout(() => {
      this.thinkingTimer = null;
      if (this.closed || this.reconnecting) return;
      const result = this.turn.replyOverdue();
      if (!result.overdue) return;
      if (result.speak)
        this.speakFallback(result.speak, "resposta sem audio e sem fim do servidor");
      this.refreshStatus();
    }, THINKING_WATCHDOG_MS);
  }

  private speakFallback(text: string, reason: string) {
    console.warn("[frotakLive] voz de reserva", { reason });
    const clean = sanitizeLiveText(text);
    this.options.onText?.(clean);
    this.fallback.speak(clean);
  }

  private clearAnswerTimer() {
    if (this.answerTimer) window.clearTimeout(this.answerTimer);
    this.answerTimer = null;
  }

  private clearStallTimer() {
    if (this.stallTimer) window.clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  private armStallReconnect() {
    this.clearStallTimer();
    this.stallTimer = window.setTimeout(() => {
      this.stallTimer = null;
      if (this.closed || this.reconnecting) return;
      this.askRepeatAfterReconnect = true;
      void this.scheduleReconnect("fala sem fim mesmo depois do audioStreamEnd");
    }, STALL_RECONNECT_MS);
  }

  private startAnswerTimer() {
    if (this.answerTimer) return;
    this.answerTimer = window.setTimeout(() => {
      this.answerTimer = null;
      if (this.closed || this.reconnecting) return;
      const result = this.turn.answerOverdue(FACTUAL_FAIL_CLOSED_MESSAGE);
      if (!result.overdue) return;
      this.speakFallback(
        result.speak ?? TOOL_ANSWER_MISSING_MESSAGE,
        result.speak
          ? "resposta da consulta nao chegou"
          : "consulta sem resposta e sem texto pronto",
      );
      this.refreshStatus();
    }, TOOL_ANSWER_TIMEOUT_MS);
  }

  private handleVoiceActivity(type: string | undefined) {
    if (type === "ACTIVITY_START") {
      this.stallWatch.started();
      this.turn.userStarted();
      this.clearThinkingWatchdog();
      // A voz de reserva nao passa pelo servidor: quando o usuario fala, ela para aqui mesmo.
      this.fallback.cancel();
    } else if (type === "ACTIVITY_END") {
      this.stallWatch.ended();
      this.clearStallTimer();
      this.turn.userEnded();
      this.startThinkingWatchdog();
    }
    this.refreshStatus();
  }

  private failSession(message: string) {
    if (this.closed) return;
    this.rejectReady?.(new Error(message));
    this.options.onStatus?.("error");
    this.options.onError?.(message);
  }

  private async handleMessage(event: MessageEvent<string | ArrayBuffer | Blob>) {
    let message: GeminiLiveMessage;
    try {
      const payload = await readWebSocketMessage(event.data);
      message = JSON.parse(payload) as GeminiLiveMessage;
    } catch (error) {
      console.error("[frotakLive] invalid websocket message", {
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (message.error) {
      console.error("[frotakLive] gemini live error", {
        code: message.error.code,
        status: message.error.status,
        message: message.error.message,
      });
      void this.scheduleReconnect("erro retornado pelo Gemini Live");
      return;
    }

    if (message.setupComplete) {
      if (this.setupTimeout) window.clearTimeout(this.setupTimeout);
      this.setupTimeout = null;
      this.setupComplete = true;
      this.reconnecting = false;
      this.resolveReady?.();
      if (this.reconnectStableTimer) window.clearTimeout(this.reconnectStableTimer);
      this.reconnectStableTimer = window.setTimeout(() => {
        this.reconnectAttempts = 0;
        this.reconnectStableTimer = null;
      }, 30_000);
      void this.startAudioCapture()
        .then(() => {
          this.captureReady = true;
          this.refreshStatus();
          if (this.askRepeatAfterReconnect && !this.closed) {
            this.askRepeatAfterReconnect = false;
            this.speakFallback(ASK_REPEAT_MESSAGE, "conexao nova depois de servidor preso");
          }
        })
        .catch((error) => {
          console.error("[frotakLive] audio capture failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          this.failSession("Nao foi possivel iniciar a captura do microfone.");
        });
      return;
    }

    if (message.voiceActivity) this.handleVoiceActivity(message.voiceActivity.type);

    if (message.serverContent?.interrupted) {
      this.player.stopNow();
      this.clearAnswerTimer();
      this.turn.interrupted();
    }

    const interimInputText = message.serverContent?.interimInputTranscription?.text;
    if (interimInputText) {
      const preview = appendTranscript(this.inputTranscriptBuffer, interimInputText);
      this.options.onInputText?.(sanitizeLiveText(preview));
    }

    const inputText = message.serverContent?.inputTranscription?.text;
    if (inputText) {
      this.inputTranscriptBuffer = appendTranscript(this.inputTranscriptBuffer, inputText);
      this.options.onInputText?.(sanitizeLiveText(this.inputTranscriptBuffer));
    }

    const toolCalls = message.toolCall?.functionCalls ?? [];
    if (toolCalls.length > 0) {
      const calls = toolCalls.map((call) => ({
        ...call,
        key: call.id ?? `local-${(this.toolCallSeq += 1)}`,
      }));
      this.turn.toolCalls(calls.map((call) => call.key));
      this.clearThinkingWatchdog();
      void this.handleToolCalls(calls).catch((error) => {
        console.error("[frotakLive] tool response failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const outputText = message.serverContent?.outputTranscription?.text;
    if (outputText) this.releaseModelText(outputText);

    const parts = message.serverContent?.modelTurn?.parts ?? [];
    if (parts.length > 0) {
      this.stallWatch.ended();
      this.clearStallTimer();
    }
    parts.forEach((part) => {
      const audio = part.inlineData?.data;
      if (audio) {
        const ms = base64AudioMs(audio);
        // So audio de verdade desarma o relogio: pedacos de 2 bytes nao sao resposta.
        if (ms >= MIN_AUDIO_CHUNK_SECONDS * 1000) this.clearThinkingWatchdog();
        if (this.turn.modelAudio(ms)) void this.player.enqueue(audio);
      }
      if (part.text) this.releaseModelText(part.text);
    });
    // So som de verdade da resposta desarma o limite da consulta; texto sozinho nao e ouvido.
    if (parts.length > 0 && this.turn.answerHeard()) this.clearAnswerTimer();

    if (message.toolCallCancellation?.ids?.length) {
      this.turn.toolCancelled(message.toolCallCancellation.ids);
      this.clearAnswerTimer();
    }

    if (message.serverContent?.generationComplete) {
      // Fala com texto e sem audio: sai ja, porque o turnComplete desse turno demora ou nao vem.
      const silentSpeech = this.turn.generationComplete();
      if (silentSpeech) {
        this.clearThinkingWatchdog();
        this.clearAnswerTimer();
        this.speakFallback(silentSpeech, "resposta sem audio do servidor");
      }
    }

    if (message.serverContent?.turnComplete) this.handleTurnComplete();

    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      this.sessionResumptionHandle = message.sessionResumptionUpdate.newHandle;
    }

    this.refreshStatus();

    if (message.goAway) {
      void this.scheduleReconnect("goAway");
    }
  }

  private releaseModelText(fragment: string) {
    const released = this.turn.modelText(fragment);
    if (released) this.options.onPartialText?.(sanitizeLiveText(released));
  }

  private handleTurnComplete() {
    const end = this.turn.turnComplete(FACTUAL_FAIL_CLOSED_MESSAGE);
    if (end.kind === "continue") {
      // Consulta respondida e resposta ainda por vir: continua em "Pensando", com limite.
      this.startAnswerTimer();
      return;
    }
    this.clearAnswerTimer();
    this.clearThinkingWatchdog();
    this.inputTranscriptBuffer = "";
    // O modelo respondeu, mas o audio veio vazio (ou a consulta falhou): fala pela voz de reserva.
    if (end.speak) {
      this.speakFallback(
        end.speak,
        end.failed ? "consulta falhou" : "resposta sem audio do servidor",
      );
    } else if (end.text) {
      this.options.onText?.(sanitizeLiveText(end.text));
    }
  }

  private async handleToolCalls(calls: PendingToolCall[]) {
    const functionResponses = await Promise.all(
      calls.map(async (call) => {
        if (!call.name || !this.options.onToolCall) {
          if (!this.turn.toolSettled(call.key, { ok: false })) return null;
          return {
            id: call.id,
            name: call.name,
            response: { error: "Ferramenta indisponivel." },
          };
        }
        try {
          console.info("[frotakLive] tool call", { name: call.name });
          const output = await this.options.onToolCall({
            id: call.id,
            name: call.name,
            args: call.args ?? {},
          });
          const succeeded = !isFrotakAiTechnicalFailure(output);
          console.info("[frotakLive] tool result", {
            name: call.name,
            ok: succeeded,
          });
          const answer = deterministicAnswerFromUnknown(output);
          if (!this.turn.toolSettled(call.key, { ok: succeeded, answer })) return null;
          return {
            id: call.id,
            name: call.name,
            response: { output },
          };
        } catch (error) {
          if (!this.turn.toolSettled(call.key, { ok: false })) return null;
          return {
            id: call.id,
            name: call.name,
            response: {
              error: error instanceof Error ? error.message : "Falha ao consultar ferramenta.",
            },
          };
        }
      }),
    );

    this.refreshStatus();
    const activeResponses = functionResponses.filter(
      (response): response is NonNullable<typeof response> => response !== null,
    );
    if (activeResponses.length === 0) return;
    // O texto pronto do servidor (deterministicAnswer) vai junto no resultado e a propria IA o
    // le com a voz dela, para nao trocar de voz no meio da conversa.
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || this.closed) return;
    this.websocket.send(JSON.stringify({ toolResponse: { functionResponses: activeResponses } }));
    this.startAnswerTimer();
  }

  private async scheduleReconnect(reason: string) {
    if (this.closed || this.reconnecting) return;
    if (!this.options.refreshToken || this.reconnectAttempts >= 3) {
      this.failSession("Nao foi possivel manter o Frotak Live conectado.");
      return;
    }

    this.reconnectAttempts += 1;
    this.reconnecting = true;
    this.options.onStatus?.("reconnecting");
    console.warn("[frotakLive] reconnecting", { reason, attempt: this.reconnectAttempts });

    this.closeWebSocket();
    this.setupComplete = false;
    this.player.stopNow();
    this.fallback.cancel();
    this.clearThinkingWatchdog();
    this.clearAnswerTimer();
    this.clearStallTimer();
    this.turn.reset();
    this.stallWatch.ended();
    if (this.reconnectStableTimer) window.clearTimeout(this.reconnectStableTimer);
    this.reconnectStableTimer = null;
    if (this.setupTimeout) window.clearTimeout(this.setupTimeout);
    this.setupTimeout = null;

    await new Promise<void>((resolve) => {
      this.reconnectTimer = window.setTimeout(
        resolve,
        Math.min(1500 * this.reconnectAttempts, 4500),
      );
    });

    try {
      await this.connect(true);
    } catch (error) {
      console.error("[frotakLive] reconnect failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      this.closeWebSocket();
      this.sessionResumptionHandle = null;
      this.reconnecting = false;
      void this.scheduleReconnect("tentativa de reconexao falhou");
    }
  }
}

function deterministicAnswerFromUnknown(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answer = (value as Record<string, unknown>).deterministicAnswer;
  return typeof answer === "string" && answer.trim() ? answer.trim() : null;
}

function waitForWebSocketOpen(websocket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      websocket.removeEventListener("open", handleOpen);
      websocket.removeEventListener("error", handleError);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Nao foi possivel abrir o Frotak Live."));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      websocket.close();
      reject(new Error("Timeout ao conectar voz."));
    }, 12_000);

    websocket.addEventListener("open", handleOpen, { once: true });
    websocket.addEventListener("error", handleError, { once: true });
  });
}

async function readWebSocketMessage(data: string | ArrayBuffer | Blob) {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  return new TextDecoder().decode(data);
}

function appendTranscript(current: string, fragment: string) {
  if (!current) return fragment.trimStart();
  if (!fragment) return current;
  if (/\s$/.test(current) || /^\s|^[,.;:!?)]/.test(fragment)) return `${current}${fragment}`;
  return `${current} ${fragment}`;
}

// Duracao do PCM 16-bit mono a 24 kHz, direto do tamanho do base64.
function base64AudioMs(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = (base64.length * 3) / 4 - padding;
  return (bytes / 2 / OUTPUT_RATE) * 1000;
}

function resampleToPcm16(input: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return floatToPcm16(input);
  const ratio = sourceRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += input[sample];
    output[index] = sum / Math.max(1, end - start);
  }

  return floatToPcm16(output);
}

function floatToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function int16ToBase64(input: Int16Array) {
  const bytes = new Uint8Array(input.buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToInt16(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer);
}

function sanitizeLiveText(text: string) {
  return text
    .replace(/\*/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
