"use client";

/**
 * Comemoração sonora curta, sintetizada (sem arquivo de áudio para baixar).
 * O navegador só libera áudio depois de um gesto: `prepararSom` é chamado no
 * toque de "Começar", e daí em diante as fanfarras tocam. Desligável e
 * lembrado no aparelho; sem `localStorage`, vale o padrão (ligado).
 */
const CHAVE = "missao-saber:som";
let contexto: AudioContext | null = null;

export function somLigado() {
  try {
    return window.localStorage.getItem(CHAVE) !== "desligado";
  } catch {
    return true;
  }
}
export function lembrarSom(ligado: boolean) {
  try {
    window.localStorage.setItem(CHAVE, ligado ? "ligado" : "desligado");
  } catch {
    // Sem armazenamento: a escolha vale até fechar a página.
  }
}

export function prepararSom() {
  if (typeof window === "undefined") return null;
  const Classe =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Classe) return null;
  contexto ??= new Classe();
  if (contexto.state === "suspended") void contexto.resume();
  return contexto;
}

function nota(
  ctx: AudioContext,
  frequencia: number,
  inicio: number,
  duracao: number,
  volume = 0.18,
) {
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequencia;
  ganho.gain.setValueAtTime(0, inicio);
  ganho.gain.linearRampToValueAtTime(volume, inicio + 0.02);
  ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.05);
}

/** Acerto: arpejo de dó maior subindo. Pódio: o mesmo, mais longo e com acorde final. */
export function tocarComemoracao(tipo: "acerto" | "podio" = "acerto") {
  if (!somLigado()) return;
  const ctx = prepararSom();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const arpejo = [523.25, 659.25, 783.99, 1046.5];
  arpejo.forEach((f, i) => {
    nota(ctx, f, t + i * 0.09, 0.22);
  });
  if (tipo === "podio") {
    const fim = t + arpejo.length * 0.09 + 0.05;
    for (const f of [523.25, 659.25, 783.99, 1046.5]) nota(ctx, f, fim, 0.9, 0.1);
  }
}
