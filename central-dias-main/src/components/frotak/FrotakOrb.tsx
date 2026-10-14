import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export type FrotakOrbState = "idle" | "listening" | "thinking" | "speaking";

type FrotakOrbProps = {
  state: FrotakOrbState;
  className?: string;
  colors?: readonly [string, string, string];
  background?: string;
};

type OrbStateConfig = {
  // deformacao da superficie
  amp: number;
  // velocidade da onda
  speed: number;
  // giro
  spin: number;
  // "rugosidade" da onda
  freq: number;
  glow: number;
  // quanto o volume (simulado) da voz deforma
  gain: number;
  // tamanho relativo
  scale: number;
};

const STATE_CONFIGS: Record<FrotakOrbState, OrbStateConfig> = {
  idle: { amp: 0.075, speed: 0.45, spin: 0.1, freq: 1.0, glow: 0.85, gain: 0, scale: 1 },
  listening: { amp: 0.06, speed: 0.7, spin: 0.06, freq: 1.6, glow: 0.95, gain: 0.11, scale: 0.92 },
  thinking: { amp: 0.17, speed: 1.7, spin: 0.55, freq: 1.4, glow: 1.0, gain: 0, scale: 1 },
  speaking: { amp: 0.2, speed: 1.25, spin: 0.22, freq: 1.25, glow: 1.0, gain: 0.16, scale: 1 },
};

const DEFAULT_COLORS = ["#000000", "#4ce657", "#000000"] as const;
const ROWS = 96;
const DENSITY = 230;
const RADIUS = 0.33;
const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount;

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "").trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized;
  const parsed = Number.parseInt(expanded, 16);
  if (Number.isNaN(parsed)) return [255, 255, 255];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
};

// Tabela de 256 cores do gradiente vertical (topo -> meio -> base).
const buildGradient = (colors: readonly [string, string, string]) => {
  const [top, middle, bottom] = colors.map(hexToRgb);
  const table = new Float32Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    const position = index / 255;
    const [from, to, raw] =
      position < 0.5 ? [top, middle, position * 2] : [middle, bottom, (position - 0.5) * 2];
    const amount = raw * raw * (3 - 2 * raw);
    table[index * 3] = lerp(from[0], to[0], amount);
    table[index * 3 + 1] = lerp(from[1], to[1], amount);
    table[index * 3 + 2] = lerp(from[2], to[2], amount);
  }
  return table;
};

// Pontos em linhas de latitude, como na referencia.
const buildPoints = () => {
  const points: number[] = [];
  for (let row = 1; row < ROWS; row += 1) {
    const theta = (row / ROWS) * Math.PI;
    const y = Math.cos(theta);
    const ring = Math.sin(theta);
    const columns = Math.max(6, Math.round(DENSITY * ring));
    for (let column = 0; column < columns; column += 1) {
      const phi = (column / columns) * Math.PI * 2 + row * 0.17;
      points.push(ring * Math.cos(phi), y, ring * Math.sin(phi));
    }
  }
  return new Float32Array(points);
};

class ParticleOrbRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly points = buildPoints();
  private readonly gradient: Float32Array;
  private readonly background: [number, number, number];
  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private imageData: ImageData | null = null;
  private buffer = new Float32Array(3);
  private animationFrame = 0;
  private lastFrameAt = performance.now();
  private currentState: FrotakOrbState = "idle";
  private config: OrbStateConfig = { ...STATE_CONFIGS.idle };
  private time = 0;
  private phase = 0;
  private rotation = 0;
  private level = 0;

  constructor(
    canvas: HTMLCanvasElement,
    options: { colors: readonly [string, string, string]; background: string },
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D indisponivel para a Frotak Orb.");

    this.canvas = canvas;
    this.context = context;
    this.gradient = buildGradient(options.colors);
    this.background = hexToRgb(options.background);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animationFrame = window.requestAnimationFrame(this.frame);
  }

  destroy() {
    window.cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
  }

  setState(state: FrotakOrbState) {
    this.currentState = state;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.height = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    if (
      !this.imageData ||
      this.imageData.width !== this.width ||
      this.imageData.height !== this.height
    ) {
      this.imageData = this.context.createImageData(this.width, this.height);
      this.buffer = new Float32Array(this.width * this.height * 3);
    }
  }

  private frame = (now: number) => {
    let delta = Math.min(0.05, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    if (!document.hidden) {
      if (this.reducedMotion) delta *= 0.25;
      this.update(delta);
      this.draw();
    }
    this.animationFrame = window.requestAnimationFrame(this.frame);
  };

  private update(delta: number) {
    this.time += delta;
    const target = STATE_CONFIGS[this.currentState];
    const easing = 1 - Math.pow(0.02, delta);
    for (const key of Object.keys(target) as (keyof OrbStateConfig)[]) {
      this.config[key] = lerp(this.config[key], target[key], easing);
    }

    // Volume simulado da voz: silabas para a IA, frases curtas com pausa para o frotista.
    let level = 0;
    const t = this.time;
    if (this.currentState === "speaking") {
      const syllable = Math.max(0, Math.sin(t * 11) * Math.sin(t * 4.3 + 1.1));
      level = Math.min(1, syllable * (0.55 + 0.45 * Math.sin(t * 0.9)) * 1.6);
    } else if (this.currentState === "listening") {
      const talking = Math.max(0, Math.sin(t * 0.8)) > 0.35 ? 1 : 0;
      level = talking * Math.max(0, Math.sin(t * 8.5) * Math.sin(t * 3.1 + 0.4)) * 1.3;
    }
    this.level = lerp(this.level, level, 1 - Math.pow(0.0005, delta));

    this.phase += delta * this.config.speed;
    this.rotation += delta * this.config.spin;
  }

  private draw() {
    if (!this.imageData) return;
    const { width: W, height: H, buffer, gradient, background, points } = this;
    const data = this.imageData.data;
    buffer.fill(0);

    const level = this.level;
    const { freq, glow } = this.config;
    const amp = this.config.amp + level * this.config.gain;
    // Encolhe a base conforme a deformacao cresce, para os picos nao sairem do canvas.
    const radius =
      (Math.min(W, H) * RADIUS * this.config.scale * (1 + level * 0.05)) / (1 + (amp - 0.075) * 0.9);
    const centerX = W / 2;
    const centerY = H / 2;
    const phase = this.phase;
    const cosRotation = Math.cos(this.rotation);
    const sinRotation = Math.sin(this.rotation);
    const cosTilt = Math.cos(0.32);
    const sinTilt = Math.sin(0.32);
    const perspective = 3.2;
    const dot = this.dpr >= 1.5 ? 2 : 1;
    const count = points.length / 3;

    for (let index = 0; index < count; index += 1) {
      const x = points[index * 3];
      const y = points[index * 3 + 1];
      const z = points[index * 3 + 2];

      // Ondulacao organica: soma de senos num campo 3D continuo (sem ruido por particula).
      const wave =
        Math.sin(2.6 * freq * x + phase * 1.1 + Math.sin(2.1 * freq * y + phase * 0.7)) *
          Math.cos(3.1 * freq * y - phase * 0.9) *
          0.6 +
        Math.sin(4.3 * freq * z + 3.2 * freq * x - phase * 1.6) * 0.3 +
        Math.sin(6.5 * freq * y + 2.0 * z + phase * 2.3) * 0.18 * (0.4 + level * 1.6);
      const displacement = 1 + amp * wave;

      const px = x * displacement;
      const py = y * displacement;
      const pz = z * displacement;
      const rx = px * cosRotation + pz * sinRotation;
      let rz = -px * sinRotation + pz * cosRotation;
      const ry = py * cosTilt - rz * sinTilt;
      rz = py * sinTilt + rz * cosTilt;

      const scale = perspective / (perspective - rz);
      const screenX = centerX + rx * scale * radius;
      const screenY = centerY - ry * scale * radius;
      const pixelX = screenX | 0;
      const pixelY = screenY | 0;
      if (pixelX < 0 || pixelY < 0 || pixelX >= W - dot || pixelY >= H - dot) continue;

      // Gradiente pela posicao vertical na tela.
      const gradientY = (screenY - (centerY - radius * 1.2)) / (radius * 2.4);
      const colorIndex = (gradientY < 0 ? 0 : gradientY > 1 ? 255 : (gradientY * 255) | 0) * 3;

      // Frente brilhante, fundo apagado, cristas e silhueta mais acesas.
      let depth = (rz + 1.15) / 2.3;
      depth = depth < 0 ? 0 : depth > 1 ? 1 : depth;
      const crest = 0.65 + 0.35 * (wave * 0.5 + 0.5);
      const rim = 1 - Math.abs(rz) / displacement;
      const alpha = (0.12 + 0.88 * depth * depth) * crest * glow * (0.85 + rim * 0.5) * 1.7;

      const red = gradient[colorIndex] * alpha;
      const green = gradient[colorIndex + 1] * alpha;
      const blue = gradient[colorIndex + 2] * alpha;
      for (let offsetY = 0; offsetY < dot; offsetY += 1) {
        let offset = ((pixelY + offsetY) * W + pixelX) * 3;
        for (let offsetX = 0; offsetX < dot; offsetX += 1, offset += 3) {
          buffer[offset] += red;
          buffer[offset + 1] += green;
          buffer[offset + 2] += blue;
        }
      }
    }

    const [backgroundRed, backgroundGreen, backgroundBlue] = background;
    for (let pixel = 0, source = 0, total = W * H; pixel < total; pixel += 1, source += 3) {
      const offset = pixel * 4;
      data[offset] = backgroundRed + buffer[source];
      data[offset + 1] = backgroundGreen + buffer[source + 1];
      data[offset + 2] = backgroundBlue + buffer[source + 2];
      data[offset + 3] = 255;
    }
    this.context.putImageData(this.imageData, 0, 0);
  }
}

export function FrotakOrb({
  state,
  className,
  colors = DEFAULT_COLORS,
  background = "#000000",
}: FrotakOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ParticleOrbRenderer | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ParticleOrbRenderer(canvas, { colors, background });
    renderer.setState(stateRef.current);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [background, colors]);

  useEffect(() => {
    rendererRef.current?.setState(state);
  }, [state]);

  return (
    <canvas ref={canvasRef} aria-hidden="true" className={cn("block h-full w-full", className)} />
  );
}
