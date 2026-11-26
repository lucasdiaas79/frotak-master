// Destravamento da fala do usuario no Gemini Live.
//
// Em parte das sessoes o servidor marca o inicio da fala do usuario (ACTIVITY_START) e depois nao
// marca o fim: nao transcreve, nao responde, e o usuario fica esperando. Quando o microfone ja esta
// quieto ha um tempo e o fim nao veio, o cliente avisa que o audio parou (audioStreamEnd): o
// servidor processa o que recebeu e responde. O audio seguinte reabre o fluxo normalmente.
//
// Visto em sessoes reais do gemini-3.8-live com a mesma fala que funciona nas outras sessoes.

export type StallWatchOptions = {
  /** Quadros quietos (~20 ms) depois da fala, sem o servidor fechar a fala, para destravar. */
  quietFrames: number;
  /** Fracao do nivel de voz do usuario abaixo da qual o quadro conta como quieto. */
  quietRatio: number;
  /** Nivel (RMS de 0 a 1) que sempre conta como quieto, para microfones muito baixos. */
  minimumQuietLevel: number;
};

export const DEFAULT_STALL_WATCH: StallWatchOptions = {
  quietFrames: 125,
  quietRatio: 0.25,
  minimumQuietLevel: 0.01,
};

export type StallWatch = {
  /** O servidor marcou o inicio da fala do usuario. */
  started(): void;
  /** O servidor fechou a fala ou ja respondeu: nada a destravar. */
  ended(): void;
  /** Um quadro do microfone. Devolve true uma unica vez, quando e hora de mandar audioStreamEnd. */
  frame(level: number, userLevel: number): boolean;
};

export function createStallWatch(overrides: Partial<StallWatchOptions> = {}): StallWatch {
  const options = { ...DEFAULT_STALL_WATCH, ...overrides };
  let active = false;
  let quiet = 0;

  return {
    started() {
      active = true;
      quiet = 0;
    },
    ended() {
      active = false;
      quiet = 0;
    },
    frame(level, userLevel) {
      if (!active) return false;
      const quietLevel = Math.max(options.minimumQuietLevel, userLevel * options.quietRatio);
      quiet = level < quietLevel ? quiet + 1 : 0;
      if (quiet < options.quietFrames) return false;
      active = false;
      quiet = 0;
      return true;
    },
  };
}
