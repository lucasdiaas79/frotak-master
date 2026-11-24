// Guarda de interrupcao da voz da Frotak IA.
//
// Com a IA calada, todo o audio do microfone segue para o Gemini Live: a deteccao de fala e o
// filtro de ruido do proprio modelo decidem o que e fala (o gemini-3.8-live tambem ignora conversa
// ao fundo; o gemini-3.1-flash-live-preview ignora ruido, mas responde a conversa audivel por perto).
// Assim a voz baixa do usuario e ouvida e o inicio das palavras nao e cortado.
//
// Enquanto a IA fala (e um pouco depois, por causa do eco), o microfone vai como silencio, a
// menos que haja voz de perto por tempo suficiente: so assim o usuario interrompe. O eco da
// propria IA na caixa de som e a conversa de outras pessoas ao fundo ficam bem abaixo do nivel
// de voz do usuario e nao interrompem. Silencio de verdade, e nao audio mais baixo: o modelo
// reconhece fala limpa mesmo em volume muito baixo. Quando a voz e confirmada, os ultimos
// quadros guardados seguem juntos, para a primeira silaba nao se perder.
//
// Validado com sessoes reais do gemini-3.8-live e do gemini-3.1-flash-live-preview, fala
// sintetica, ruidos e eco simulados.

export type BargeInGuardOptions = {
  /** Quadros acima do limite, dentro da janela, para liberar a interrupcao (quadros de ~20 ms). */
  onsetFrames: number;
  /**
   * Janela em que os quadros com voz sao contados. Fala tem pausas curtas entre as silabas; contar
   * dentro de uma janela, e nao exigir quadros seguidos, deixa a voz mais baixa interromper.
   */
  onsetWindowFrames: number;
  /** Quadros mantidos liberados depois da ultima fala. */
  hangoverFrames: number;
  /** Quadros guardados e enviados juntos quando a voz e confirmada. */
  prerollFrames: number;
  /** Nivel minimo (RMS de 0 a 1) para contar como voz durante a fala da IA. */
  minimumLevel: number;
  /** Fracao do nivel de voz do proprio usuario exigida para interromper. */
  userLevelRatio: number;
  /** Quantas vezes acima do eco medido a voz precisa estar. */
  echoRatio: number;
  /** Nivel inicial estimado da voz do usuario, antes de ouvir a primeira fala. */
  initialUserLevel: number;
};

export const DEFAULT_BARGE_IN_GUARD: BargeInGuardOptions = {
  onsetFrames: 11,
  onsetWindowFrames: 16,
  hangoverFrames: 40,
  prerollFrames: 16,
  minimumLevel: 0.02,
  userLevelRatio: 0.35,
  echoRatio: 4,
  initialUserLevel: 0.06,
};

export type BargeInGuard = {
  /**
   * Recebe um quadro do microfone e devolve o que enviar: o proprio quadro, silencio do mesmo
   * tamanho ou, no momento em que a interrupcao e liberada, os quadros guardados.
   */
  process(frame: Float32Array, assistantAudible: boolean): Float32Array[];
  reset(): void;
  /** Para diagnostico e testes. */
  state(): { userLevel: number; echoLevel: number; open: boolean };
};

export function frameLevel(frame: Float32Array) {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < frame.length; index += 1) sum += frame[index] * frame[index];
  return Math.sqrt(sum / frame.length);
}

export function createBargeInGuard(overrides: Partial<BargeInGuardOptions> = {}): BargeInGuard {
  const options = { ...DEFAULT_BARGE_IN_GUARD, ...overrides };
  let userLevel = options.initialUserLevel;
  let noiseLevel = 0.004;
  let echoLevel = 0.004;
  let voicedHistory: boolean[] = [];
  let voicedCount = 0;
  let openUntil = -1;
  let index = 0;
  let recent: Float32Array[] = [];
  let wasAudible = false;

  const clearOnset = () => {
    voicedHistory = [];
    voicedCount = 0;
  };

  return {
    process(frame, assistantAudible) {
      recent.push(frame);
      if (recent.length > options.prerollFrames) recent.shift();
      const level = frameLevel(frame);
      const current = index;
      index += 1;

      // A IA comecou a falar: o barulho da sala ja medido vale como ponto de partida do eco, para
      // conversa de fundo nao abrir a interrupcao antes de o guarda se adaptar.
      if (assistantAudible && !wasAudible) echoLevel = Math.max(echoLevel, noiseLevel);
      wasAudible = assistantAudible;

      if (!assistantAudible) {
        clearOnset();
        openUntil = -1;
        // Aprende o nivel de voz do usuario nas falas com a IA calada.
        if (level > Math.max(0.015, noiseLevel * 6)) userLevel = userLevel * 0.98 + level * 0.02;
        else noiseLevel = noiseLevel * 0.98 + level * 0.02;
        return [frame];
      }

      const threshold = Math.max(
        options.minimumLevel,
        echoLevel * options.echoRatio,
        userLevel * options.userLevelRatio,
      );
      const wasOpen = current - 1 <= openUntil;
      const voiced = level > threshold;
      voicedHistory.push(voiced);
      if (voiced) voicedCount += 1;
      if (voicedHistory.length > options.onsetWindowFrames && voicedHistory.shift()) {
        voicedCount -= 1;
      }
      if (voiced) {
        if (voicedCount >= options.onsetFrames) openUntil = current + options.hangoverFrames;
      } else {
        echoLevel = echoLevel * 0.97 + level * 0.03;
      }

      if (current <= openUntil) {
        if (wasOpen) return [frame];
        const flushed = recent;
        recent = [];
        return flushed;
      }
      return [new Float32Array(frame.length)];
    },
    reset() {
      clearOnset();
      openUntil = -1;
      recent = [];
    },
    state() {
      return { userLevel, echoLevel, open: index - 1 <= openUntil };
    },
  };
}
