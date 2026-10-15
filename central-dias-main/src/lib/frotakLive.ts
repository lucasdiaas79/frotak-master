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
const CAPTURE_CHUNK_SIZE = 4096;
// Portao de ruido: so manda audio real para o Gemini quando ha voz sustentada. Ruido curto
// (batida, porta, carro passando) vira silencio e nao interrompe nem faz a IA "ouvir".
const GATE_MIN_RMS = 0.018;
const GATE_NOISE_RATIO = 3.5;
const GATE_SPEAKING_BOOST = 1.8;
const GATE_ONSET_FRAMES = 6; // ~120 ms de voz seguida para abrir
const GATE_HANGOVER_FRAMES = 35; // ~700 ms aberto depois da ultima fala
const GATE_PREROLL_FRAMES = 12; // ~240 ms de atraso para nao cortar o inicio da palavra
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
  private silenceTimer: number | null = null;
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
  private groundingRetried = false;
  private preToolAudioMs = 0;
  private gateQueue: Float32Array[] = [];
  private gateFrame = 0;
  private gateOpenFrom = Number.POSITIVE_INFINITY;
  private gateOpenUntil = -1;
  private gateVoicedRun = 0;
  private noiseFloor = 0.005;
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
    if (requiresFrotakTool(text)) this.beginGroundedTurn();
    this.options.onStatus?.("thinking");
    this.sendRealtimeInput({ text });
  }

  setMicrophoneEnabled(enabled: boolean) {
    if (this.closed || this.microphoneEnabled === enabled) return;
    this.microphoneEnabled = enabled;
    this.captureBuffer = [];
    this.gateQueue = [];
    this.gateVoicedRun = 0;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });

    if (!enabled) {
      if (this.silenceTimer) window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
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
    if (this.silenceTimer) window.clearTimeout(this.silenceTimer);
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.reconnectStableTimer) window.clearTimeout(this.reconnectStableTimer);
    this.setupTimeout = null;
    this.silenceTimer = null;
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
      const input = this.applyNoiseGate(event.data);
      if (!input) return;
      this.captureBuffer.push(...input);
      if (this.captureBuffer.length < CAPTURE_CHUNK_SIZE) return;

      const chunk = new Float32Array(this.captureBuffer.splice(0, CAPTURE_CHUNK_SIZE));
      const pcm = resampleToPcm16(chunk, this.context?.sampleRate ?? 48_000, INPUT_RATE);
      this.sendRealtimeInput({
        audio: {
          data: int16ToBase64(pcm),
          mimeType: `audio/pcm;rate=${INPUT_RATE}`,
        },
      });
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

  private requireGrounding(source: string) {
    if (this.groundingRequired) return;
    // A transcricao da fala pode chegar depois que a resposta ja comecou a tocar.
    // Nesse caso nao corta a voz no meio; a trava vale para a proxima pergunta.
    if (this.speaking) return;
    this.groundingRequired = true;
    this.player.stopNow();
    console.info("[frotakLive] groundingRequired", { source });
  }

  private beginGroundedTurn() {
    this.groundingRequired = true;
    this.resetToolState();
    this.player.stopNow();
  }

  // Recebe um quadro de ~20 ms e devolve o quadro atrasado: audio real se faz parte de uma fala,
  // silencio se for ruido.
  private applyNoiseGate(frame: Float32Array) {
    const rms = calculateRms(frame);
    const threshold =
      Math.max(GATE_MIN_RMS, this.noiseFloor * GATE_NOISE_RATIO) *
      (this.speaking ? GATE_SPEAKING_BOOST : 1);
    const index = this.gateFrame;
    this.gateFrame += 1;

    if (rms > threshold) {
      this.gateVoicedRun += 1;
      if (this.gateVoicedRun >= GATE_ONSET_FRAMES) {
        if (index > this.gateOpenUntil) {
          this.gateOpenFrom = index - GATE_ONSET_FRAMES - GATE_PREROLL_FRAMES + 1;
        }
        this.gateOpenUntil = index + GATE_HANGOVER_FRAMES;
      }
    } else {
      this.gateVoicedRun = 0;
      this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03;
    }

    const open = index <= this.gateOpenUntil && index >= this.gateOpenFrom;
    if (open && !this.speaking) {
      this.options.onStatus?.("listening");
      if (this.silenceTimer) window.clearTimeout(this.silenceTimer);
      this.silenceTimer = window.setTimeout(
        () => {
          if (!this.closed && !this.speaking && this.microphoneEnabled) {
            this.options.onStatus?.("thinking");
          }
        },
        (GATE_HANGOVER_FRAMES + GATE_PREROLL_FRAMES) * 20 + 300,
      );
    }

    this.gateQueue.push(frame);
    if (this.gateQueue.length <= GATE_PREROLL_FRAMES) return null;
    const delayed = this.gateQueue.shift()!;
    const delayedIndex = index - GATE_PREROLL_FRAMES;
    const delayedOpen = delayedIndex >= this.gateOpenFrom && delayedIndex <= this.gateOpenUntil;
    return delayedOpen ? delayed : new Float32Array(delayed.length);
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

    if (message.serverContent?.interrupted) {
      this.player.stopNow();
      this.options.onStatus?.("interrupted");
    }

    const interimInputText = message.serverContent?.interimInputTranscription?.text;
    if (interimInputText) {
      const preview = appendTranscript(this.inputTranscriptBuffer, interimInputText);
      this.options.onInputText?.(sanitizeLiveText(preview));
      if (requiresFrotakTool(preview)) this.requireGrounding("voice");
    }

    const inputText = message.serverContent?.inputTranscription?.text;
    if (inputText) {
      this.inputTranscriptBuffer = appendTranscript(this.inputTranscriptBuffer, inputText);
      this.options.onInputText?.(sanitizeLiveText(this.inputTranscriptBuffer));
      if (requiresFrotakTool(this.inputTranscriptBuffer)) this.requireGrounding("voice");
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
    if (outputText && this.canReleaseModelOutput()) {
      this.transcriptBuffer = appendTranscript(this.transcriptBuffer, outputText);
      this.options.onPartialText?.(sanitizeLiveText(this.transcriptBuffer));
    }

    const parts = message.serverContent?.modelTurn?.parts ?? [];
    parts.forEach((part) => {
      const audio = part.inlineData?.data;
      const canPlayModelOutput = this.canReleaseModelOutput();
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
        const text = failClosed ? FACTUAL_FAIL_CLOSED_MESSAGE : this.transcriptBuffer.trim();
        this.transcriptBuffer = "";
        this.inputTranscriptBuffer = "";
        this.groundingRequired = false;
        this.resetToolState();
        if (text) this.options.onText?.(sanitizeLiveText(text));
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

function calculateRms(input: Float32Array) {
  let sum = 0;
  for (let index = 0; index < input.length; index += 1) sum += input[index] * input[index];
  return Math.sqrt(sum / input.length);
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
import { requiresFrotakTool } from "@/lib/frotakAiIntent";
import { isFrotakAiTechnicalFailure } from "@/lib/frotakAiToolCatalog";
