/**
 * Música de fundo do treino, sintetizada no aparelho pelo Web Audio: sem arquivo para baixar,
 * funciona offline e não tem licença de terceiros. Lá menor, Am–F–C–G, um acorde por compasso
 * de 16 semicolcheias. Na série toca a banda inteira; no descanso fica só um fundo calmo.
 */
import { audioContext, onSpeaking } from "./voice";

export type EstadoMusica = "parado" | "treino" | "descanso";

type Voz = "bumbo" | "chimbal" | "caixa" | "baixo" | "arpejo" | "acorde";
export interface Nota {
  voz: Voz;
  /** altura MIDI; ausente nas vozes de percussão */
  midi?: number;
  /** acorde inteiro, só na voz "acorde" */
  acorde?: number[];
  /** 0..1 */
  forca: number;
  /** duração em semicolcheias */
  dura?: number;
}

/** Am, F, C, G: fundamental (oitava do baixo) e o acorde na região média. */
type Acorde = { baixo: number; notas: readonly [number, number, number] };
const ACORDES: readonly [Acorde, Acorde, Acorde, Acorde] = [
  { baixo: 45, notas: [57, 60, 64] },
  { baixo: 41, notas: [57, 60, 65] },
  { baixo: 48, notas: [55, 60, 64] },
  { baixo: 43, notas: [55, 59, 62] },
];
/** ordem do arpejo sobre as três notas do acorde (a última oitava acima) */
const ARPEJO = [0, 1, 2, 3, 2, 1, 0, 1];

export const ANDAMENTO: Record<Exclude<EstadoMusica, "parado">, number> = {
  treino: 116,
  descanso: 88,
};

/** O que toca na semicolcheia `passo` (0..15) do compasso `compasso`. Função pura, testável. */
export function notasDoPasso(estado: EstadoMusica, compasso: number, passo: number): Nota[] {
  if (estado === "parado") return [];
  const acorde = ACORDES[compasso % ACORDES.length] ?? ACORDES[0];
  const tons = [...acorde.notas, acorde.notas[0] + 12] as const;
  const notas: Nota[] = [];
  const colcheia = passo % 2 === 0;
  const arpejo = (forca: number) => {
    const grau = ARPEJO[(passo / 2) % ARPEJO.length] ?? 0;
    notas.push({ voz: "arpejo", midi: (tons[grau] ?? tons[0]) + 12, forca, dura: 2 });
  };
  if (estado === "descanso") {
    if (passo === 0) notas.push({ voz: "acorde", acorde: [...acorde.notas], forca: 0.7, dura: 16 });
    if (passo === 0 || passo === 8)
      notas.push({ voz: "baixo", midi: acorde.baixo, forca: 0.45, dura: 8 });
    if (passo % 4 === 2) arpejo(0.35);
    return notas;
  }
  if (passo % 4 === 0) notas.push({ voz: "bumbo", forca: 1 });
  if (passo === 4 || passo === 12) notas.push({ voz: "caixa", forca: 0.8 });
  if (passo % 4 === 2) notas.push({ voz: "chimbal", forca: 0.9 });
  else if (!colcheia) notas.push({ voz: "chimbal", forca: 0.35 });
  if (colcheia) {
    // oitava acima nas colcheias que antecedem o tempo forte, para o baixo andar
    const salto = passo === 6 || passo === 14 ? 12 : 0;
    notas.push({ voz: "baixo", midi: acorde.baixo + salto, forca: 0.8, dura: 2 });
    arpejo(0.55);
  }
  if (passo === 0) notas.push({ voz: "acorde", acorde: [...acorde.notas], forca: 0.35, dura: 16 });
  return notas;
}

const VOLUME = { treino: 0.2, descanso: 0.14 } as const;
/** quanto a música mantém enquanto a voz fala */
const ABAIXADA = 0.3;
const ANTECEDENCIA = 0.12;
const INTERVALO_MS = 25;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Musica {
  private readonly ctx: AudioContext;
  private readonly saida: GainNode;
  private readonly duck: GainNode;
  private readonly ruido: AudioBuffer;
  private estado: EstadoMusica = "parado";
  private timer = 0;
  private parar = 0;
  private proximo = 0;
  private passo = 0;
  private compasso = 0;

  constructor() {
    this.ctx = audioContext();
    this.saida = this.ctx.createGain();
    this.saida.gain.value = 0;
    this.duck = this.ctx.createGain();
    this.saida.connect(this.duck).connect(this.ctx.destination);
    this.ruido = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const dados = this.ruido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    onSpeaking((falando) => {
      const t = this.ctx.currentTime;
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setTargetAtTime(falando ? ABAIXADA : 1, t, falando ? 0.05 : 0.35);
    });
    document.addEventListener("visibilitychange", this.aoMudarVisibilidade);
  }

  definir(estado: EstadoMusica) {
    if (estado === this.estado) return;
    const antes = this.estado;
    this.estado = estado;
    const t = this.ctx.currentTime;
    this.saida.gain.cancelScheduledValues(t);
    this.saida.gain.setValueAtTime(this.saida.gain.value, t);
    if (estado === "parado") {
      this.saida.gain.linearRampToValueAtTime(0, t + 0.6);
      window.clearTimeout(this.parar);
      this.parar = window.setTimeout(() => this.pararAgendador(), 700);
      return;
    }
    window.clearTimeout(this.parar);
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.saida.gain.linearRampToValueAtTime(VOLUME[estado], t + (antes === "parado" ? 1.2 : 0.8));
    if (!this.timer && document.visibilityState === "visible") this.iniciarAgendador();
  }

  private iniciarAgendador() {
    this.proximo = this.ctx.currentTime + 0.06;
    this.passo = 0;
    this.timer = window.setInterval(this.agendar, INTERVALO_MS);
  }

  private pararAgendador() {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private aoMudarVisibilidade = () => {
    // em segundo plano o temporizador fica lento e o ritmo tropeça: melhor silenciar
    if (document.visibilityState === "hidden") this.pararAgendador();
    else if (this.estado !== "parado" && !this.timer) this.iniciarAgendador();
  };

  private agendar = () => {
    if (this.estado === "parado") return;
    // depois de um travamento da página, retoma do agora em vez de tocar o atraso de uma vez
    if (this.proximo < this.ctx.currentTime - 0.2) this.proximo = this.ctx.currentTime + 0.05;
    while (this.proximo < this.ctx.currentTime + ANTECEDENCIA) {
      const semicolcheia = 60 / ANDAMENTO[this.estado] / 4;
      for (const nota of notasDoPasso(this.estado, this.compasso, this.passo))
        this.tocar(nota, this.proximo, semicolcheia);
      this.proximo += semicolcheia;
      this.passo = (this.passo + 1) % 16;
      if (this.passo === 0) this.compasso++;
    }
  };

  private envelope(t: number, pico: number, ataque: number, queda: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico), t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
    g.connect(this.saida);
    return g;
  }

  private oscilador(
    tipo: OscillatorType,
    freq: number,
    t: number,
    fim: number,
    destino: AudioNode,
  ) {
    const o = this.ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = freq;
    o.connect(destino);
    o.start(t);
    o.stop(fim);
    return o;
  }

  private chiado(
    t: number,
    dura: number,
    filtro: BiquadFilterType,
    freq: number,
    destino: AudioNode,
  ) {
    const fonte = this.ctx.createBufferSource();
    fonte.buffer = this.ruido;
    const f = this.ctx.createBiquadFilter();
    f.type = filtro;
    f.frequency.value = freq;
    fonte.connect(f).connect(destino);
    fonte.start(t, Math.random() * 0.5);
    fonte.stop(t + dura);
  }

  private tocar(nota: Nota, t: number, semicolcheia: number) {
    const dura = (nota.dura ?? 1) * semicolcheia;
    switch (nota.voz) {
      case "bumbo": {
        const g = this.envelope(t, 0.9 * nota.forca, 0.004, 0.28);
        const o = this.oscilador("sine", 150, t, t + 0.32, g);
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        return;
      }
      case "caixa":
        this.chiado(t, 0.18, "bandpass", 1800, this.envelope(t, 0.4 * nota.forca, 0.002, 0.15));
        return;
      case "chimbal":
        this.chiado(t, 0.06, "highpass", 7500, this.envelope(t, 0.18 * nota.forca, 0.001, 0.05));
        return;
      case "baixo": {
        const g = this.envelope(t, 0.45 * nota.forca, 0.01, Math.max(0.12, dura * 0.9));
        const f = this.ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 480;
        f.connect(g);
        this.oscilador("sawtooth", hz(nota.midi ?? 45), t, t + dura + 0.05, f);
        return;
      }
      case "arpejo": {
        const g = this.envelope(t, 0.16 * nota.forca, 0.005, 0.22);
        const f = this.ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 2400;
        f.connect(g);
        this.oscilador("triangle", hz(nota.midi ?? 69), t, t + 0.3, f);
        return;
      }
      case "acorde": {
        const g = this.ctx.createGain();
        const fim = t + dura;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05 * nota.forca, t + 0.5);
        g.gain.setValueAtTime(0.05 * nota.forca, fim - 0.4);
        g.gain.linearRampToValueAtTime(0.0001, fim);
        g.connect(this.saida);
        for (const m of nota.acorde ?? [])
          for (const desvio of [-4, 4]) {
            const o = this.oscilador("sine", hz(m), t, fim + 0.05, g);
            o.detune.value = desvio;
          }
        return;
      }
    }
  }
}

let musica: Musica | null = null;
/** Liga, troca ou para a música. Fora do navegador (servidor) não faz nada. */
export function definirMusica(estado: EstadoMusica) {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  if (!musica && estado === "parado") return;
  musica ??= new Musica();
  musica.definir(estado);
}
