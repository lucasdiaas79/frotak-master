import { isFrotakAiTechnicalFailure } from "@/modules/frotak-ai/domain/frotakAiToolCatalog";
import { createBargeInGuard, frameLevel } from "@/modules/frotak-ai/domain/frotakLiveBargeInGuard";
import { createStallWatch } from "@/modules/frotak-ai/domain/frotakLiveStallWatch";

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
const FACTUAL_FAIL_CLOSED_MESSAGE =
  "Nao foi possivel consultar os dados da Frotak neste momento. Tente novamente em instantes.";
// Enviado uma vez quando a IA tenta responder um dado do tenant sem consultar as ferramentas.
// Antes de consultar, a IA pode falar uma frase curta de espera ("Entendi, deixa so eu dar
// uma olhada aqui"). Ate este limite o audio toca mesmo sem ferramenta; o resto espera a consulta.
const PRE_TOOL_AUDIO_MS = 3_500;

const GROUNDING_RETRY_PROMPT =
  "Instrucao do sistema: a resposta anterior nao foi entregue porque nao consultou as ferramentas da Frotak. Consulte agora a ferramenta adequada para a ultima pergunta do usuario e responda de novo, curto e direto, sem mencionar esta instrucao e sem repetir a frase de espera.";

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
    if (pcm.length === 0) return;

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
  private setupComplete = false;
  private closed = false;
  private transcriptBuffer = "";
  private inputTranscriptBuffer = "";
  private captureBuffer: number[] = [];
  private setupTimeout: number | null = null;
  private thinkingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectStableTimer: number | null = null;
  private reconnectAttempts = 0;
  private reconnecting = false;
  private sessionResumptionHandle: string | null = null;
  private speaking = false;
  private microphoneEnabled = true;
  private groundingRequired = false;
  private toolCallsSeen = 0;
  private toolCallsPending = 0;
  private toolFailures = 0;
  private deterministicTurnText = "";
  private groundingRetried = false;
  private preToolAudioMs = 0;
  private bargeInGuard = createBargeInGuard();
  private stallWatch = createStallWatch();
  private speakingTailUntil = 0;
  private cancelledToolCallIds = new Set<string>();
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;

  constructor(options: FrotakLiveSessionOptions) {
    this.options = options;
    this.stream = options.stream;
    this.player = new PcmAudioPlayer({
      onStart: () => {
        this.speaking = true;
        this.options.onStatus?.("speaking");
      },
      onStop: () => {
        this.speaking = false;
        this.speakingTailUntil = performance.now() + ECHO_TAIL_MS;
        if (!this.closed && !this.reconnecting) {
          this.options.onStatus?.(this.microphoneEnabled ? "ready" : "muted");
        }
      },
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
    this.options.onStatus?.("thinking");
    this.sendRealtimeInput({ text });
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

    if (!enabled) {
      this.clearThinkingWatchdog();
      this.sendRealtimeInput({ audioStreamEnd: true });
      if (!this.speaking) this.options.onStatus?.("muted");
      return;
    }

    if (!this.speaking && this.setupComplete) this.options.onStatus?.("ready");
  }

  async stop() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    this.closed = true;
    this.rejectReady?.(new Error("Conexao de voz cancelada."));
    if (this.setupTimeout) window.clearTimeout(this.setupTimeout);
    this.clearThinkingWatchdog();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.reconnectStableTimer) window.clearTimeout(this.reconnectStableTimer);
    this.setupTimeout = null;
    this.reconnectTimer = null;
    this.reconnectStableTimer = null;
    this.captureBuffer = [];
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
      if (this.options.refreshToken && !this.sessionResumptionHandle) {
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

  private clearThinkingWatchdog() {
    if (this.thinkingTimer) window.clearTimeout(this.thinkingTimer);
    this.thinkingTimer = null;
  }

  private startThinkingWatchdog() {
    this.clearThinkingWatchdog();
    this.thinkingTimer = window.setTimeout(() => {
      this.thinkingTimer = null;
      if (this.closed || this.speaking || this.reconnecting || this.toolCallsPending > 0) return;
      this.options.onStatus?.(this.microphoneEnabled ? "ready" : "muted");
    }, THINKING_WATCHDOG_MS);
  }

  // Estado da tela a partir do que o proprio modelo detectou, e nao do volume do microfone.
  private handleVoiceActivity(type: string | undefined) {
    if (type === "ACTIVITY_START") this.stallWatch.started();
    else if (type === "ACTIVITY_END") this.stallWatch.ended();
    if (this.speaking || !this.microphoneEnabled) return;
    if (type === "ACTIVITY_START") {
      this.clearThinkingWatchdog();
      this.options.onStatus?.("listening");
    } else if (type === "ACTIVITY_END") {
      this.options.onStatus?.("thinking");
      this.startThinkingWatchdog();
    }
  }

  private canPlayWaitingPhrase() {
    return (
      this.groundingRequired &&
      this.toolCallsSeen === 0 &&
      this.toolFailures === 0 &&
      this.preToolAudioMs < PRE_TOOL_AUDIO_MS
    );
  }

  private canReleaseModelOutput() {
    if (!this.groundingRequired) return true;
    return this.toolCallsSeen > 0 && this.toolCallsPending === 0 && this.toolFailures === 0;
  }

  private resetToolState() {
    this.toolCallsSeen = 0;
    this.toolCallsPending = 0;
    this.toolFailures = 0;
    this.groundingRetried = false;
    this.preToolAudioMs = 0;
    this.cancelledToolCallIds.clear();
    this.deterministicTurnText = "";
  }

  // A IA respondeu um dado do tenant sem consultar: em vez de calar, pede uma vez que consulte.
  private requestGroundedRetry() {
    if (this.groundingRetried) return false;
    if (!this.sendRealtimeInput({ text: GROUNDING_RETRY_PROMPT })) return false;
    this.groundingRetried = true;
    this.transcriptBuffer = "";
    this.options.onStatus?.("thinking");
    console.info("[frotakLive] grounding retry requested");
    return true;
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
          if (!this.closed) {
            this.options.onStatus?.(this.microphoneEnabled ? "ready" : "muted");
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
      this.options.onStatus?.("interrupted");
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
      this.groundingRequired = true;
      void this.handleToolCalls(toolCalls).catch((error) => {
        console.error("[frotakLive] tool response failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const outputText = message.serverContent?.outputTranscription?.text;
    if (outputText && this.canReleaseModelOutput() && !this.deterministicTurnText) {
      this.transcriptBuffer = appendTranscript(this.transcriptBuffer, outputText);
      this.options.onPartialText?.(sanitizeLiveText(this.transcriptBuffer));
    }

    const parts = message.serverContent?.modelTurn?.parts ?? [];
    if (parts.length > 0) {
      this.clearThinkingWatchdog();
      this.stallWatch.ended();
    }
    parts.forEach((part) => {
      const audio = part.inlineData?.data;
      const canPlayModelOutput = this.canReleaseModelOutput() && !this.deterministicTurnText;
      if (audio && canPlayModelOutput) void this.player.enqueue(audio);
      else if (audio && this.canPlayWaitingPhrase()) {
        this.preToolAudioMs += ((audio.length * 3) / 4 / 2 / OUTPUT_RATE) * 1000;
        void this.player.enqueue(audio);
      }
      if (part.text && canPlayModelOutput) {
        this.transcriptBuffer = appendTranscript(this.transcriptBuffer, part.text);
        this.options.onPartialText?.(sanitizeLiveText(this.transcriptBuffer));
      }
    });

    if (message.toolCallCancellation?.ids?.length) {
      message.toolCallCancellation.ids.forEach((id) => this.cancelledToolCallIds.add(id));
      this.toolFailures += message.toolCallCancellation.ids.length;
      this.options.onStatus?.("interrupted");
    }

    if (message.serverContent?.turnComplete) {
      const skippedTools =
        this.groundingRequired &&
        this.toolCallsSeen === 0 &&
        this.toolCallsPending === 0 &&
        this.toolFailures === 0;
      if (skippedTools && this.requestGroundedRetry()) {
        // Aguarda a nova resposta, agora com consulta.
      } else if (!(this.groundingRequired && this.toolCallsPending > 0)) {
        const failClosed = this.groundingRequired && !this.canReleaseModelOutput();
        const text = failClosed
          ? FACTUAL_FAIL_CLOSED_MESSAGE
          : this.deterministicTurnText || this.transcriptBuffer.trim();
        this.transcriptBuffer = "";
        this.inputTranscriptBuffer = "";
        this.groundingRequired = false;
        this.resetToolState();
        if (text) this.options.onText?.(sanitizeLiveText(text));
        // Turno sem audio (ex.: o modelo decidiu nao responder a um ruido): volta a ouvir.
        if (!this.speaking && !this.closed && !this.reconnecting) {
          this.clearThinkingWatchdog();
          this.options.onStatus?.(this.microphoneEnabled ? "ready" : "muted");
        }
      }
    }

    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      this.sessionResumptionHandle = message.sessionResumptionUpdate.newHandle;
    }

    if (message.goAway) {
      void this.scheduleReconnect("goAway");
    }
  }

  private async handleToolCalls(
    calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>,
  ) {
    if (
      !this.websocket ||
      this.websocket.readyState !== WebSocket.OPEN ||
      !this.options.onToolCall
    ) {
      return;
    }

    const validCalls = calls.filter((call) => call.name);
    if (validCalls.length === 0) {
      this.toolFailures += 1;
      return;
    }
    this.toolCallsSeen += validCalls.length;
    this.toolCallsPending += validCalls.length;
    this.options.onStatus?.("thinking");
    const functionResponses = await Promise.all(
      validCalls.map(async (call) => {
        try {
          console.info("[frotakLive] tool call", { name: call.name });
          const output = await this.options.onToolCall?.({
            id: call.id,
            name: String(call.name),
            args: call.args ?? {},
          });
          if (call.id && this.cancelledToolCallIds.has(call.id)) return null;
          const succeeded = !isFrotakAiTechnicalFailure(output);
          console.info("[frotakLive] tool result", {
            name: call.name,
            ok: succeeded,
          });
          if (!succeeded) this.toolFailures += 1;
          return {
            id: call.id,
            name: call.name,
            response: { output },
          };
        } catch (error) {
          if (call.id && this.cancelledToolCallIds.has(call.id)) return null;
          this.toolFailures += 1;
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

    this.toolCallsPending = Math.max(0, this.toolCallsPending - validCalls.length);
    const activeResponses = functionResponses.filter(
      (response): response is NonNullable<typeof response> => response !== null,
    );
    if (activeResponses.length === 0) return;
    // O texto pronto do servidor (deterministicAnswer) vai junto no resultado e a propria IA o
    // le com a voz dela, para nao trocar de voz no meio da conversa.
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN || this.closed) return;
    this.websocket.send(JSON.stringify({ toolResponse: { functionResponses: activeResponses } }));
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
