/**
 * Estimativa do tick do servidor, com parte fracionária, para a cena desenhar
 * entre um passo e outro.
 *
 * O servidor só conta o tick quando algo muda (no passo) e uma vez por
 * segundo (no pulso). Entre as amostras, o cliente anda no ritmo do mundo:
 * `velocidade` ticks a cada passo de 100 ms. Cada amostra corrige a conta:
 * depressa quando o cliente ficou para trás, devagar quando está adiantado,
 * porque uma amostra que demorou na rede parece atraso e não é.
 *
 * A estimativa nunca anda para trás. Se o servidor para de dar sinal, ela
 * para de extrapolar pouco depois da última amostra.
 */

/** Quanto do erro é corrigido por amostra quando o cliente está atrasado. */
const GANHO_ATRASADO = 0.5;
/** E quando está adiantado: pouco, para o atraso da rede não puxar o relógio. */
const GANHO_ADIANTADO = 0.08;
/** Acima disto, em passos do servidor, a diferença é salto e não tremor: corrige de uma vez. */
const SALTO_EM_PASSOS = 6;
/** Quantos passos além da última amostra a estimativa pode extrapolar. */
const FOLGA_EM_PASSOS = 15;

export class RelogioDoServidor {
  private base = 0;
  private baseEm = 0;
  private ritmo = 1;
  private ultimaAmostra = 0;
  private ultimaSaida = 0;
  private sincronizado = false;

  constructor(private readonly passoMs = 100) {}

  get velocidade(): number {
    return this.ritmo;
  }

  /** Recomeça de um tick conhecido: é o que a visão inteira traz. */
  reiniciar(tick: number, agoraMs: number, velocidade: number): void {
    this.base = tick;
    this.baseEm = agoraMs;
    this.ritmo = velocidade;
    this.ultimaAmostra = tick;
    this.ultimaSaida = tick;
    this.sincronizado = true;
  }

  /** O mundo mudou de ritmo (pausa, 1×, 2×, 3×). */
  definirVelocidade(velocidade: number, agoraMs: number): void {
    if (velocidade === this.ritmo) return;
    this.base = this.bruto(agoraMs);
    this.baseEm = agoraMs;
    this.ritmo = velocidade;
  }

  /** Um tick que o servidor acabou de contar, e a hora local em que chegou. */
  amostra(tick: number, agoraMs: number): void {
    if (!this.sincronizado) {
      this.reiniciar(tick, agoraMs, this.ritmo);
      return;
    }
    if (tick > this.ultimaAmostra) this.ultimaAmostra = tick;
    const previsto = this.livre(agoraMs);
    const erro = tick - previsto;
    const salto = SALTO_EM_PASSOS * Math.max(1, this.ritmo);
    const corrigido =
      Math.abs(erro) > salto
        ? tick
        : previsto + erro * (erro > 0 ? GANHO_ATRASADO : GANHO_ADIANTADO);
    this.base = corrigido;
    this.baseEm = agoraMs;
  }

  /** O tick do servidor agora, com parte fracionária. Nunca menor que o anterior. */
  estimar(agoraMs: number): number {
    const saida = Math.max(this.ultimaSaida, this.bruto(agoraMs));
    this.ultimaSaida = saida;
    return saida;
  }

  private livre(agoraMs: number): number {
    return this.base + (Math.max(0, agoraMs - this.baseEm) / this.passoMs) * this.ritmo;
  }

  private bruto(agoraMs: number): number {
    const teto = this.ultimaAmostra + FOLGA_EM_PASSOS * Math.max(1, this.ritmo);
    return Math.min(teto, this.livre(agoraMs));
  }
}
