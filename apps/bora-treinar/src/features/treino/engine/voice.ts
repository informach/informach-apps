/** Voz em português e bipes curtos para conduzir o treino sem olhar a tela. */
let ctx: AudioContext | null = null;
let voice: SpeechSynthesisVoice | null = null;
let enabled = true;

const hasSpeech = () => typeof speechSynthesis !== "undefined";

export function setAudioEnabled(on: boolean) {
  enabled = on;
  if (!on && hasSpeech()) speechSynthesis.cancel();
}

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice =
    vs.find((v) => v.lang === "pt-BR" && /google|francisca|luciana|natural/i.test(v.name)) ??
    vs.find((v) => v.lang.startsWith("pt")) ??
    null;
}
if (hasSpeech()) {
  pickVoice();
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
}

/** Precisa ser chamado num gesto do usuário (toque/clique) para liberar o áudio no celular. */
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export function say(text: string, opts: { interrupt?: boolean; rate?: number } = {}) {
  if (!enabled || !hasSpeech()) return;
  if (opts.interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  if (voice) u.voice = voice;
  u.rate = opts.rate ?? 1.08;
  speechSynthesis.speak(u);
}

const TONES = { tick: [880, 0.09], go: [1320, 0.25], rep: [660, 0.06], done: [990, 0.35] } as const;

export function beep(kind: keyof typeof TONES = "tick") {
  if (!enabled) return;
  ctx ??= new AudioContext();
  const [freq, dur] = TONES[kind];
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const WORDS = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
  "vinte",
];
export const numberWord = (n: number) => WORDS[n] ?? String(n);
