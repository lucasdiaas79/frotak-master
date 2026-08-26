export type FrotakLiveStatus = "idle" | "connecting" | "ready" | "listening" | "speaking" | "error";

export type FrotakLiveSessionOptions = {
  token: string;
  model: string;
  stream: MediaStream;
  onStatus?: (status: FrotakLiveStatus) => void;
  onText?: (text: string) => void;
  onError?: (message: string) => void;
};

const GEMINI_LIVE_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
const CAPTURE_CHUNK_SIZE = 4096;
const ACTIVITY_RMS_THRESHOLD = 0.01;

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
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  goAway?: unknown;
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
  private captureBuffer: number[] = [];

  constructor(options: FrotakLiveSessionOptions) {
    this.options = options;
    this.stream = options.stream;
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
    this.websocket.onerror = (event) => {
      console.error("[frotakLive] websocket error", event);
      this.options.onStatus?.("error");
      this.options.onError?.("Nao foi possivel conectar ao Frotak Live.");
    };
    this.websocket.onclose = (event) => {
      if (event.code !== 1000) {
        console.error("[frotakLive] websocket closed", {
          code: event.code,
          reason: event.reason,
        });
      }
      if (!this.closed) this.options.onStatus?.("idle");
    };

    await waitForWebSocketOpen(this.websocket);
    this.websocket.send(
      JSON.stringify({
        setup: {
          model: `models/${this.options.model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            temperature: 0.2,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoede",
                },
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }),
    );
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
        !this.setupComplete ||
        !this.websocket ||
        this.websocket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const input = event.data;
      const rms = calculateRms(input);

      if (rms > ACTIVITY_RMS_THRESHOLD) {
        this.options.onStatus?.("listening");
        this.player.stopNow();
      }

      this.captureBuffer.push(...input);
      if (this.captureBuffer.length < CAPTURE_CHUNK_SIZE) return;

      const chunk = new Float32Array(this.captureBuffer.splice(0, CAPTURE_CHUNK_SIZE));
      const pcm = resampleToPcm16(chunk, this.context?.sampleRate ?? 48_000, INPUT_RATE);
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

    this.source.connect(this.captureNode);
    this.captureNode.connect(this.muteGain);
    this.muteGain.connect(this.context.destination);
  }

  private handleMessage(event: MessageEvent<string>) {
    let message: GeminiLiveMessage;
    try {
      message = JSON.parse(event.data) as GeminiLiveMessage;
    } catch {
      return;
    }

    if (message.error) {
      console.error("[frotakLive] gemini live error", {
        code: message.error.code,
        status: message.error.status,
        message: message.error.message,
      });
      this.options.onStatus?.("error");
      this.options.onError?.("Nao foi possivel concluir a conversa por voz.");
      return;
    }

    if (message.setupComplete) {
      this.setupComplete = true;
      void this.startAudioCapture()
        .then(() => {
          if (!this.closed) this.options.onStatus?.("ready");
        })
        .catch((error) => {
          console.error("[frotakLive] audio capture failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          this.options.onStatus?.("error");
          this.options.onError?.("Nao foi possivel iniciar a captura do microfone.");
        });
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
