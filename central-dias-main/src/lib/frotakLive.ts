export type FrotakLiveStatus = "idle" | "connecting" | "ready" | "listening" | "speaking" | "error";

export type FrotakLiveSessionOptions = {
  token: string;
  model: string;
  onStatus?: (status: FrotakLiveStatus) => void;
  onText?: (text: string) => void;
  onError?: (message: string) => void;
};

const GEMINI_LIVE_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
const RMS_THRESHOLD = 0.018;
const SILENCE_HANGOVER_MS = 420;

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
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
  };
  goAway?: unknown;
};

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
  private processor: ScriptProcessorNode | null = null;
  private player: PcmAudioPlayer;
  private lastVoiceAt = 0;
  private isVoiceOpen = false;
  private closed = false;
  private transcriptBuffer = "";

  constructor(options: FrotakLiveSessionOptions) {
    this.options = options;
    this.player = new PcmAudioPlayer({
      onStart: () => this.options.onStatus?.("speaking"),
      onStop: () => {
        if (!this.closed) this.options.onStatus?.("ready");
      },
    });
  }

  async start() {
    this.closed = false;
    this.options.onStatus?.("connecting");

    this.websocket = new WebSocket(`${GEMINI_LIVE_WS}?access_token=${this.options.token}`);
    this.websocket.onmessage = (event) => this.handleMessage(event);
    this.websocket.onerror = () => {
      this.options.onStatus?.("error");
      this.options.onError?.("Nao foi possivel conectar ao Frotak Live.");
    };
    this.websocket.onclose = () => {
      if (!this.closed) this.options.onStatus?.("idle");
    };

    await waitForWebSocketOpen(this.websocket);
    this.websocket.send(
      JSON.stringify({
        setup: {
          model: `models/${this.options.model}`,
          responseModalities: ["AUDIO"],
        },
      }),
    );

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    await this.startAudioCapture();
    this.options.onStatus?.("ready");
  }

  sendText(text: string) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
    this.websocket.send(
      JSON.stringify({
        realtimeInput: {
          text,
        },
      }),
    );
  }

  async stop() {
    this.closed = true;
    this.isVoiceOpen = false;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    await this.player.close();

    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      this.websocket.close(1000, "closed by user");
    } else {
      this.websocket?.close();
    }
    this.websocket = null;
    this.options.onStatus?.("idle");
  }

  private async startAudioCapture() {
    if (!this.stream) return;
    this.context = new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();

    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (this.closed || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const rms = calculateRms(input);
      const now = performance.now();
      const voiceDetected = rms > RMS_THRESHOLD;

      if (voiceDetected) {
        this.lastVoiceAt = now;
        if (!this.isVoiceOpen) {
          this.isVoiceOpen = true;
          this.options.onStatus?.("listening");
        }
        this.player.stopNow();
      }

      const shouldSend = this.isVoiceOpen || now - this.lastVoiceAt < SILENCE_HANGOVER_MS;
      if (!shouldSend) return;

      if (this.isVoiceOpen && !voiceDetected && now - this.lastVoiceAt >= SILENCE_HANGOVER_MS) {
        this.isVoiceOpen = false;
        this.options.onStatus?.("ready");
      }

      const pcm = resampleToPcm16(input, this.context?.sampleRate ?? 48_000, INPUT_RATE);
      this.websocket.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: int16ToBase64(pcm),
              mimeType: `audio/pcm;rate=${INPUT_RATE}`,
            },
          },
        }),
      );
    };

    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  private handleMessage(event: MessageEvent<string>) {
    let message: GeminiLiveMessage;
    try {
      message = JSON.parse(event.data) as GeminiLiveMessage;
    } catch {
      return;
    }

    if (message.serverContent?.interrupted) {
      this.player.stopNow();
      return;
    }

    const outputText = message.serverContent?.outputTranscription?.text;
    if (outputText) {
      this.transcriptBuffer = `${this.transcriptBuffer}${outputText}`.trimStart();
    }

    const parts = message.serverContent?.modelTurn?.parts ?? [];
    parts.forEach((part) => {
      const audio = part.inlineData?.data;
      if (audio) void this.player.enqueue(audio);
      if (part.text) this.transcriptBuffer = `${this.transcriptBuffer}${part.text}`.trimStart();
    });

    if (message.serverContent?.turnComplete || message.serverContent?.generationComplete) {
      const text = this.transcriptBuffer.trim();
      this.transcriptBuffer = "";
      if (text) this.options.onText?.(sanitizeLiveText(text));
    }

    if (message.goAway) {
      this.options.onError?.("Sessao Frotak Live encerrando. Inicie novamente se precisar.");
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
      reject(new Error("Timeout ao conectar voz."));
    }, 12_000);

    websocket.addEventListener("open", handleOpen, { once: true });
    websocket.addEventListener("error", handleError, { once: true });
  });
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
