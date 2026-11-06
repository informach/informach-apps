"use client";

/**
 * Som e voz do aparelho da criança. O navegador só libera áudio depois de um
 * toque na tela; por isso a tela da criança pede "Começar o dia" antes de tudo.
 * Sino suave, nada de alarme estridente.
 */
let contexto: AudioContext | null = null;
let tocando: HTMLAudioElement | null = null;

export function liberarAudio() {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === "suspended") void contexto.resume();
  } catch {
    contexto = null;
  }
  // Uma fala vazia libera a síntese de voz no Safari e no Chrome do Android.
  if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export function audioLiberado() {
  return contexto?.state === "running";
}

/** Sino de duas notas (lembrete) ou uma nota só (tarefa feita). */
export function sino(suave = false) {
  if (!contexto) return;
  const agora = contexto.currentTime;
  const notas = suave ? [659.25] : [523.25, 783.99];
  notas.forEach((freq, i) => {
    if (!contexto) return;
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = agora + i * 0.28;
    ganho.gain.setValueAtTime(0, t);
    ganho.gain.linearRampToValueAtTime(0.22, t + 0.03);
    ganho.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    osc.connect(ganho).connect(contexto.destination);
    osc.start(t);
    osc.stop(t + 1.5);
  });
}

/** Festa curta ao concluir: três notas subindo. Fica de fora no modo calmo. */
export function festa() {
  if (!contexto) return;
  const agora = contexto.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    if (!contexto) return;
    const osc = contexto.createOscillator();
    const ganho = contexto.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = agora + i * 0.12;
    ganho.gain.setValueAtTime(0, t);
    ganho.gain.linearRampToValueAtTime(0.16, t + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(ganho).connect(contexto.destination);
    osc.start(t);
    osc.stop(t + 0.7);
  });
}

function vozPortuguesa() {
  const vozes = speechSynthesis.getVoices();
  return vozes.find((v) => v.lang === "pt-BR") ?? vozes.find((v) => v.lang.startsWith("pt"));
}

export function falar(texto: string) {
  if (!("speechSynthesis" in window)) return;
  pararVoz();
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "pt-BR";
  fala.rate = 0.92;
  const voz = vozPortuguesa();
  if (voz) fala.voice = voz;
  speechSynthesis.speak(fala);
}

/** Toca a voz gravada pelos pais para a tarefa; sem gravação (ou com erro), fala o texto. */
export async function falarTarefa(taskId: string, temVoz: boolean, texto: string) {
  if (!temVoz) return falar(texto);
  pararVoz();
  tocando = new Audio(`/api/voz/${taskId}`);
  await tocando.play().catch(() => falar(texto));
}

export function pararVoz() {
  tocando?.pause();
  tocando = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
