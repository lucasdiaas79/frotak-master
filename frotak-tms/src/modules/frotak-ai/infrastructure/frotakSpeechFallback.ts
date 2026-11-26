// Voz de reserva do navegador. So entra quando a voz do Gemini nao chega: resposta com texto e
// audio vazio, resposta de consulta que nao veio a tempo, ou aviso de consulta que falhou.
// Melhor uma voz diferente do que o usuario ficar no silencio sem saber o que aconteceu.

// O Chrome as vezes nao dispara onend em falas longas: encerra pelo tempo estimado.
const MS_PER_CHAR = 85;
const END_MARGIN_MS = 2_500;

function speechSynthesisAvailable() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

function brazilianVoice() {
  const voices = window.speechSynthesis.getVoices();
  const normalized = (voice: SpeechSynthesisVoice) => voice.lang.replace("_", "-").toLowerCase();
  const brazilian = voices.filter((voice) => normalized(voice) === "pt-br");
  return (
    brazilian.find((voice) => /google|natural|neural|luciana|francisca/i.test(voice.name)) ??
    brazilian[0] ??
    voices.find((voice) => normalized(voice).startsWith("pt")) ??
    null
  );
}

/** iOS so libera a fala do navegador a partir de um toque: chamar no clique que abre a voz. */
export function primeFrotakSpeechFallback() {
  if (!speechSynthesisAvailable()) return;
  try {
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Sem voz de reserva neste navegador; a resposta continua aparecendo em texto.
  }
}

export class FrotakSpeechFallback {
  private active: SpeechSynthesisUtterance | null = null;
  private endTimer: number | null = null;
  private onStart: () => void;
  private onEnd: () => void;

  constructor(callbacks: { onStart: () => void; onEnd: () => void }) {
    this.onStart = callbacks.onStart;
    this.onEnd = callbacks.onEnd;
  }

  get speaking() {
    return this.active !== null;
  }

  speak(text: string) {
    const clean = text.replace(/\*/g, "").trim();
    if (!clean || !speechSynthesisAvailable()) return false;
    this.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;
    const voice = brazilianVoice();
    if (voice) utterance.voice = voice;
    const finish = () => this.finish(utterance);
    utterance.onend = finish;
    utterance.onerror = finish;
    this.active = utterance;
    this.endTimer = window.setTimeout(finish, clean.length * MS_PER_CHAR + END_MARGIN_MS);
    this.onStart();
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
      return false;
    }
    return true;
  }

  cancel() {
    const utterance = this.active;
    if (!utterance) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Nada tocando.
    }
    this.finish(utterance);
  }

  private finish(utterance: SpeechSynthesisUtterance) {
    if (this.active !== utterance) return;
    this.active = null;
    if (this.endTimer) window.clearTimeout(this.endTimer);
    this.endTimer = null;
    this.onEnd();
  }
}
