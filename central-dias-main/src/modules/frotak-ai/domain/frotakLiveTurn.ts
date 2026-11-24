// Turno da conversa por voz: quem esta com a palavra, o que ainda falta chegar do modelo e se o
// audio do modelo pode tocar. Puro (sem navegador), para testar com sequencias reais do Gemini Live.
//
// Sequencias vistas em sessoes reais (laboratorio de voz, 2026-11-24):
// - Com ferramenta, o modelo fecha o turno da frase de espera (turnComplete) e so depois manda a
//   resposta, num turno novo. Entre os dois a tela tem de continuar em "Pensando".
// - Se o usuario fala enquanto a ferramenta roda, chegam toolCallCancellation + interrupted +
//   turnComplete. O turno do modelo acabou; a proxima resposta e de outra pergunta e tem de tocar.
// - Turno com texto (transcricao) e audio vazio: pedacos de 2 bytes. O texto vira fala de reserva.
// - Resposta depois da ferramenta que nunca chega: o relogio de quem chama pede answerOverdue().

export type FrotakLiveTurnStatus = "ready" | "listening" | "thinking";

export type FrotakLiveTurnEnd =
  // O servidor fechou um turno, mas a resposta ainda vem (consulta rodando ou ja respondida).
  { kind: "continue" } | { kind: "done"; text: string; speak: string | null; failed: boolean };

export const DEFAULT_LIVE_TURN = {
  // Abaixo disso o audio do turno e considerado vazio para o texto que veio junto. Fala real em
  // portugues passa de 60 ms por caractere; o audio vazio visto vem com 0 a 60 ms no total.
  minAudioMs: 250,
  audioMsPerChar: 20,
  // Audio a partir do qual o modelo de fato comecou a falar (pedaco de 2 bytes nao conta).
  startedAudioMs: 20,
};

function appendText(current: string, fragment: string) {
  if (!current) return fragment.trimStart();
  if (!fragment) return current;
  if (/\s$/.test(current) || /^\s|^[,.;:!?)]/.test(fragment)) return `${current}${fragment}`;
  return `${current} ${fragment}`;
}

/** Texto falado sem audio que chegue a ser ouvido: o servidor mandou a fala vazia. */
export function isSilentModelSpeech(
  text: string,
  audioMs: number,
  options: typeof DEFAULT_LIVE_TURN = DEFAULT_LIVE_TURN,
) {
  const chars = text.trim().length;
  if (chars === 0) return false;
  return audioMs < Math.max(options.minAudioMs, chars * options.audioMsPerChar);
}

export function createLiveTurn(options: typeof DEFAULT_LIVE_TURN = DEFAULT_LIVE_TURN) {
  let userTalking = false;
  // O modelo deve uma resposta e ainda nao comecou a falar.
  let awaitingReply = false;
  let toolCallsSeen = 0;
  const pending = new Set<string>();
  let failures = 0;
  const answers: string[] = [];
  // Fala do turno atual; zera quando chega uma chamada de ferramenta (a frase de espera fica de fora).
  let speechText = "";
  let speechAudioMs = 0;
  // Audio que de fato foi liberado para tocar: texto sem som ainda nao e resposta para a tela.
  let releasedAudioMs = 0;
  // Texto liberado para a tela (so o que tambem pode tocar).
  let releasedText = "";
  // Depois de uma resposta de reserva, o que o modelo mandar atrasado nao toca.
  let suppressed = false;
  const cancelled = new Set<string>();

  const resetTurn = () => {
    awaitingReply = false;
    toolCallsSeen = 0;
    pending.clear();
    failures = 0;
    answers.length = 0;
    speechText = "";
    speechAudioMs = 0;
    releasedAudioMs = 0;
    releasedText = "";
  };

  const canRelease = () =>
    !suppressed && (toolCallsSeen === 0 || (pending.size === 0 && failures === 0));

  // Algum som da resposta ja foi liberado para tocar.
  const answerHeard = () => releasedAudioMs >= options.startedAudioMs;

  // Consulta feita e respondida, sem nada da resposta ainda.
  const awaitingToolAnswer = () =>
    toolCallsSeen > 0 &&
    pending.size === 0 &&
    failures === 0 &&
    speechText === "" &&
    speechAudioMs < options.startedAudioMs;

  return {
    userStarted() {
      userTalking = true;
      suppressed = false;
    },
    userEnded() {
      userTalking = false;
      awaitingReply = true;
    },
    textSent() {
      suppressed = false;
      resetTurn();
      awaitingReply = true;
    },
    // O usuario cortou o modelo: o turno do modelo acabou, consultas dele nao contam mais.
    // Se um texto acabou de ser enviado, a resposta a ele continua devida.
    interrupted() {
      const waiting = awaitingReply;
      resetTurn();
      awaitingReply = waiting;
    },
    toolCalls(ids: string[]) {
      ids.forEach((id) => pending.add(id));
      toolCallsSeen += ids.length;
      awaitingReply = false;
      // A frase de espera ja tocou; o que conta daqui em diante e a resposta.
      speechText = "";
      speechAudioMs = 0;
      releasedAudioMs = 0;
      releasedText = "";
    },
    toolCancelled(ids: string[]) {
      ids.forEach((id) => cancelled.add(id));
      const waiting = awaitingReply;
      resetTurn();
      awaitingReply = waiting;
    },
    /** Resultado de uma consulta. Devolve se a resposta ainda deve ir para o modelo. */
    toolSettled(id: string, result: { ok: boolean; answer?: string | null }) {
      if (cancelled.has(id)) return false;
      // Consulta de um turno que ja acabou (sem cancelamento do servidor): manda, mas nao conta.
      if (!pending.delete(id)) return true;
      if (!result.ok) failures += 1;
      else if (result.answer) answers.push(result.answer);
      return true;
    },
    /** Audio do modelo chegou; devolve se pode tocar agora. */
    modelAudio(ms: number) {
      speechAudioMs += ms;
      if (speechAudioMs >= options.startedAudioMs) awaitingReply = false;
      const release = canRelease();
      if (release) releasedAudioMs += ms;
      return release;
    },
    /** Transcricao do que o modelo fala; devolve o texto liberado para a tela, ou null. */
    modelText(fragment: string) {
      speechText = appendText(speechText, fragment);
      if (!canRelease()) return null;
      releasedText = appendText(releasedText, fragment);
      return releasedText;
    },
    turnComplete(failMessage: string): FrotakLiveTurnEnd {
      if (suppressed) {
        suppressed = false;
        resetTurn();
        return { kind: "done", text: "", speak: null, failed: false };
      }
      if (pending.size > 0 || awaitingToolAnswer()) return { kind: "continue" };
      const failed = toolCallsSeen > 0 && failures > 0;
      const silent = !failed && isSilentModelSpeech(speechText, speechAudioMs, options);
      const end: FrotakLiveTurnEnd = failed
        ? { kind: "done", text: failMessage, speak: failMessage, failed: true }
        : {
            kind: "done",
            text: releasedText.trim() || (silent ? speechText.trim() : ""),
            speak: silent ? speechText.trim() : null,
            failed: false,
          };
      resetTurn();
      // Consulta falhou: o aviso ja vai ser falado; a resposta do modelo que vier depois nao toca.
      suppressed = failed;
      return end;
    },
    /**
     * A resposta da consulta nao foi ouvida a tempo (nao veio, ou veio so em texto). Devolve o que
     * falar no lugar: aviso de falha, texto pronto da ferramenta ou o texto do proprio modelo.
     * O que o modelo mandar atrasado neste turno e ignorado.
     */
    answerOverdue(failMessage: string) {
      if (toolCallsSeen === 0 || pending.size > 0 || answerHeard()) {
        return { overdue: false as const };
      }
      const speak =
        failures > 0 ? failMessage : answers.join(" ").trim() || speechText.trim() || null;
      resetTurn();
      suppressed = true;
      return { overdue: true as const, speak };
    },
    answerHeard,
    /**
     * O modelo terminou de gerar. Fala que veio sem audio e devolvida ja aqui: nas sessoes com
     * audio vazio o turnComplete demora ou nem chega. O turno acaba; o que vier dele depois e vazio.
     */
    generationComplete() {
      if (suppressed || pending.size > 0) return null;
      if (!isSilentModelSpeech(speechText, speechAudioMs, options)) return null;
      const speak = speechText.trim();
      resetTurn();
      return speak;
    },
    /**
     * Ninguem respondeu depois que o usuario parou de falar (ex.: ruido ignorado pelo modelo).
     * Se chegou texto sem audio e nada mais, devolve o texto para a voz de reserva.
     */
    replyOverdue() {
      if (!awaitingReply || pending.size > 0 || toolCallsSeen > 0) {
        return { overdue: false as const };
      }
      const speak = isSilentModelSpeech(speechText, speechAudioMs, options)
        ? speechText.trim()
        : null;
      resetTurn();
      return { overdue: true as const, speak };
    },
    awaitingToolAnswer,
    status(): FrotakLiveTurnStatus {
      if (userTalking) return "listening";
      if (awaitingReply || pending.size > 0) return "thinking";
      // Houve consulta e nenhum som da resposta tocou ainda (texto sozinho nao e resposta ouvida).
      if (toolCallsSeen > 0 && !answerHeard()) return "thinking";
      return "ready";
    },
    reset() {
      userTalking = false;
      suppressed = false;
      resetTurn();
    },
  };
}

export type FrotakLiveTurn = ReturnType<typeof createLiveTurn>;
