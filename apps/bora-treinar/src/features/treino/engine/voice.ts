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

/** O contexto de áudio do app, o mesmo dos bipes e da música de fundo. */
export function audioContext() {
  ctx ??= new AudioContext();
  return ctx;
}

/** Precisa ser chamado num gesto do usuário (toque/clique) para liberar o áudio no celular. */
export function unlockAudio() {
  const c = audioContext();
  if (c.state === "suspended") void c.resume();
}

let speaking: ((falando: boolean) => void) | null = null;
let falando = 0;
/** Quem precisa saber quando a voz fala (a música abaixa para ela ser entendida). */
export function onSpeaking(listener: ((falando: boolean) => void) | null) {
  speaking = listener;
}

let muted = false;
/** Cala a fala do app (bipes continuam): enquanto o microfone conta pela voz, ele ouviria o app. */
export function setSpeechMuted(on: boolean) {
  muted = on;
  if (on && hasSpeech()) speechSynthesis.cancel();
}

export function say(text: string, opts: { interrupt?: boolean; rate?: number } = {}) {
  if (!enabled || muted || !hasSpeech()) return;
  if (opts.interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  if (voice) u.voice = voice;
  u.rate = opts.rate ?? 1.08;
  // Conta as falas ativas: ao interromper, o fim da fala cancelada pode chegar depois do início
  // da nova, e um simples sim/não soltaria a música no meio da frase.
  let ativa = false;
  u.onstart = () => {
    if (ativa) return;
    ativa = true;
    falando++;
    speaking?.(true);
  };
  u.onend = u.onerror = () => {
    if (!ativa) return;
    ativa = false;
    falando = Math.max(0, falando - 1);
    speaking?.(falando > 0);
  };
  speechSynthesis.speak(u);
}

const TONES = { tick: [880, 0.09], go: [1320, 0.25], rep: [660, 0.06], done: [990, 0.35] } as const;

export function beep(kind: keyof typeof TONES = "tick") {
  if (!enabled) return;
  const ctx = audioContext();
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
