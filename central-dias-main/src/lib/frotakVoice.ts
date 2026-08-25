type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognitionResultAlternative = {
  transcript: string;
  confidence: number;
};

type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionResultAlternative;
  [index: number]: SpeechRecognitionResultAlternative;
};

type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

export type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
};

export type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string;
  readonly message?: string;
};

export type SpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function createPortugueseSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

export async function openCleanMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microfone indisponivel neste navegador.");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export function stopMicrophone(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function portugueseVoiceScore(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let score = 0;
  if (lang.startsWith("pt-br")) score += 8;
  if (lang.startsWith("pt")) score += 4;
  if (name.includes("female")) score += 3;
  if (name.includes("maria") || name.includes("francisca") || name.includes("luciana")) score += 3;
  if (name.includes("google")) score += 1;
  return score;
}

export function choosePortugueseFemaleVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;

  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("pt"))
    .sort((a, b) => portugueseVoiceScore(b) - portugueseVoiceScore(a))[0];
}

export function cancelSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function speakPortuguese(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();

  cancelSpeech();

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.voice = choosePortugueseFemaleVoice() ?? null;
    utterance.rate = 0.96;
    utterance.pitch = 1.08;
    utterance.volume = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("Nao foi possivel reproduzir a voz."));
    window.speechSynthesis.speak(utterance);
  });
}
