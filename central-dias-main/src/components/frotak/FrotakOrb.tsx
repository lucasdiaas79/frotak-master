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
  amplitude: number;
  speed: number;
  spin: number;
  wave: number;
  brightness: number;
  focal: number;
  autoLevel: number;
};

type OrbParticle = {
  theta: number;
  phi: number;
  seed: number;
  colorMix: number;
  size: number;
};

const STATE_CONFIGS: Record<FrotakOrbState, OrbStateConfig> = {
  idle: {
    amplitude: 0.075,
    speed: 0.45,
    spin: 0.1,
    wave: 0.85,
    brightness: 0.8,
    focal: 3.2,
    autoLevel: 0.08,
  },
  listening: {
    amplitude: 0.06,
    speed: 0.7,
    spin: 0.07,
    wave: 1.05,
    brightness: 0.96,
    focal: 3.4,
    autoLevel: 0.1,
  },
  thinking: {
    amplitude: 0.17,
    speed: 1.7,
    spin: 0.3,
    wave: 1.45,
    brightness: 1.08,
    focal: 3,
    autoLevel: 0.22,
  },
  speaking: {
    amplitude: 0.2,
    speed: 1.25,
    spin: 0.16,
    wave: 1.35,
    brightness: 1.14,
    focal: 3.1,
    autoLevel: 0.3,
  },
};

const DEFAULT_COLORS = ["#000000", "#4ce657", "#000000"] as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
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
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
};

const mixColor = (
  colorA: readonly number[],
  colorB: readonly number[],
  amount: number,
): [number, number, number] => [
  Math.round(lerp(colorA[0], colorB[0], amount)),
  Math.round(lerp(colorA[1], colorB[1], amount)),
  Math.round(lerp(colorA[2], colorB[2], amount)),
];

class ParticleOrbRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly particles: OrbParticle[] = [];
  private readonly colors: [number, number, number][];
  private readonly background: [number, number, number];
  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private animationFrame = 0;
  private lastFrameAt = performance.now();
  private currentState: FrotakOrbState = "idle";
  private config = { ...STATE_CONFIGS.idle };
  private level = 0;
  private phase = Math.random() * Math.PI * 2;
  private spinAngle = 0;
  private imageData: ImageData | null = null;
  private colorBuffer = new Float32Array(4);

  constructor(
    canvas: HTMLCanvasElement,
    options: { colors: readonly [string, string, string]; background: string },
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D indisponivel para a Frotak Orb.");

    this.canvas = canvas;
    this.context = context;
    this.colors = options.colors.map(hexToRgb);
    this.background = hexToRgb(options.background);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.createParticles();
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

  private createParticles() {
    const rows = 96;
    const density = 230;
    for (let row = 0; row < rows; row += 1) {
      const theta = (row / (rows - 1)) * Math.PI;
      const columns = Math.max(10, Math.floor(density * Math.sin(theta)));
      for (let column = 0; column < columns; column += 1) {
        this.particles.push({
          theta,
          phi: (column / columns) * Math.PI * 2,
          seed: Math.random() * 1000,
          colorMix: Math.random(),
          size: 0.8 + Math.random() * 1.25,
        });
      }
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.height = Math.max(1, Math.floor(rect.height * this.dpr));
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
      this.colorBuffer = new Float32Array(this.width * this.height * 4);
    }
  }

  private frame = (now: number) => {
    const delta = Math.min(0.034, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    if (!document.hidden) {
      this.update(delta);
      this.draw();
    }
    this.animationFrame = window.requestAnimationFrame(this.frame);
  };

  private update(delta: number) {
    const target = STATE_CONFIGS[this.currentState];
    const easing = 1 - Math.pow(0.001, delta);
    this.config.amplitude = lerp(this.config.amplitude, target.amplitude, easing);
    this.config.speed = lerp(this.config.speed, target.speed, easing);
    this.config.spin = lerp(this.config.spin, target.spin, easing);
    this.config.wave = lerp(this.config.wave, target.wave, easing);
    this.config.brightness = lerp(this.config.brightness, target.brightness, easing);
    this.config.focal = lerp(this.config.focal, target.focal, easing);
    this.config.autoLevel = lerp(this.config.autoLevel, target.autoLevel, easing);

    const motionScale = this.reducedMotion ? 0.25 : 1;
    this.phase += delta * this.config.speed * motionScale;
    this.spinAngle += delta * this.config.spin * motionScale;
    const syntheticLevel =
      this.config.autoLevel *
      (0.72 + 0.28 * Math.sin(this.phase * 2.1 + Math.sin(this.phase * 0.41)));
    this.level = lerp(this.level, syntheticLevel, 1 - Math.pow(0.0005, delta));
  }

  private draw() {
    if (!this.imageData) return;
    const data = this.imageData.data;
    const buffer = this.colorBuffer;
    buffer.fill(0);

    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const radius = Math.min(this.width, this.height) * 0.33;
    const focalLength = radius * this.config.focal;
    const cosineSpin = Math.cos(this.spinAngle);
    const sineSpin = Math.sin(this.spinAngle);
    const pulse = this.level;

    for (const particle of this.particles) {
      const sineTheta = Math.sin(particle.theta);
      let x = sineTheta * Math.cos(particle.phi);
      let y = Math.cos(particle.theta);
      let z = sineTheta * Math.sin(particle.phi);
      const rotatedX = x * cosineSpin - z * sineSpin;
      const rotatedZ = x * sineSpin + z * cosineSpin;
      x = rotatedX;
      z = rotatedZ;

      const wave =
        Math.sin(particle.theta * 5.1 + this.phase * 2.2 + particle.seed) * 0.55 +
        Math.sin(particle.phi * 3.3 - this.phase * 1.7 + particle.seed * 0.7) * 0.45;
      const directionalWave =
        Math.sin((x + y + z) * 6.5 - this.phase * 2.6 + particle.seed * 0.21) * 0.5;
      const displacement =
        1 +
        (wave * this.config.wave + directionalWave) * this.config.amplitude * (0.55 + pulse * 2.2);
      x *= displacement;
      y *= displacement;
      z *= displacement;

      const perspective = focalLength / (focalLength + (z + 1.65) * radius * 0.72);
      const screenX = Math.round(centerX + x * radius * perspective);
      const screenY = Math.round(centerY + y * radius * perspective);
      if (screenX < 2 || screenY < 2 || screenX >= this.width - 2 || screenY >= this.height - 2)
        continue;

      const depthNormalized = clamp((z + 1.25) / 2.5, 0, 1);
      const edge = clamp(1 - Math.abs(x) * 0.32 - Math.abs(y) * 0.25, 0.25, 1);
      const shimmer = 0.8 + 0.2 * Math.sin(this.phase * 3 + particle.seed * 2.4);
      const intensity =
        (0.16 + depthNormalized * 0.84) *
        edge *
        shimmer *
        this.config.brightness *
        (0.9 + pulse * 0.8);
      const latitudeMix = clamp((y + 1) * 0.5, 0, 1);
      const baseColor =
        latitudeMix < 0.52
          ? mixColor(this.colors[0], this.colors[1], latitudeMix / 0.52)
          : mixColor(this.colors[1], this.colors[2], (latitudeMix - 0.52) / 0.48);
      const color = mixColor(baseColor, this.colors[(particle.colorMix * 3) | 0], 0.14);
      const dotRadius = clamp(
        particle.size * this.dpr * (0.72 + depthNormalized * 1.05) * (0.9 + pulse * 0.7),
        0.8,
        3.1 * this.dpr,
      );
      const minX = Math.max(0, Math.floor(screenX - dotRadius));
      const maxX = Math.min(this.width - 1, Math.ceil(screenX + dotRadius));
      const minY = Math.max(0, Math.floor(screenY - dotRadius));
      const maxY = Math.min(this.height - 1, Math.ceil(screenY + dotRadius));
      const radiusSquared = dotRadius * dotRadius;

      for (let pixelY = minY; pixelY <= maxY; pixelY += 1) {
        const offsetY = pixelY - screenY;
        for (let pixelX = minX; pixelX <= maxX; pixelX += 1) {
          const offsetX = pixelX - screenX;
          const distanceSquared = offsetX * offsetX + offsetY * offsetY;
          if (distanceSquared > radiusSquared) continue;
          const alpha = (1 - distanceSquared / radiusSquared) * intensity;
          const offset = (pixelY * this.width + pixelX) * 4;
          buffer[offset] += color[0] * alpha;
          buffer[offset + 1] += color[1] * alpha;
          buffer[offset + 2] += color[2] * alpha;
          buffer[offset + 3] = Math.min(1, buffer[offset + 3] + alpha);
        }
      }
    }

    for (let offset = 0; offset < data.length; offset += 4) {
      const alpha = clamp(buffer[offset + 3], 0, 1);
      data[offset] = this.background[0] * (1 - alpha) + clamp(buffer[offset], 0, 255);
      data[offset + 1] = this.background[1] * (1 - alpha) + clamp(buffer[offset + 1], 0, 255);
      data[offset + 2] = this.background[2] * (1 - alpha) + clamp(buffer[offset + 2], 0, 255);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ParticleOrbRenderer(canvas, { colors, background });
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
