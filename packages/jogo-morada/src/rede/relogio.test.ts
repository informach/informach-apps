import { sorteioAte } from "@informach/morada-sim";
import { describe, expect, it } from "vitest";
import { RelogioDoServidor } from "./relogio";

/**
 * Um servidor de mentira que anda `velocidade` ticks a cada 100 ms e manda uma
 * amostra de tempos em tempos, com atraso de rede variável. O atraso vem do
 * sorteio da própria simulação, para o teste ser sempre o mesmo.
 */
function simular(opcoes: {
  duracaoMs: number;
  /** De quantos em quantos passos sai uma amostra. 10 é só o pulso; 1 é um mundo agitado. */
  amostraACada: number;
  atrasoMinMs: number;
  atrasoMaxMs: number;
  velocidade?: (ms: number) => number;
  /** O servidor para de mandar amostras a partir daqui. */
  mudoDesdeMs?: number;
}) {
  const relogio = new RelogioDoServidor();
  const velocidade = opcoes.velocidade ?? (() => 1);
  let tick = 500;
  relogio.reiniciar(tick, 0, velocidade(0));

  const chegadas: { em: number; tick: number; velocidade: number }[] = [];
  const medidas: { ms: number; estimado: number; real: number }[] = [];
  let anterior = Number.NEGATIVE_INFINITY;
  let maiorRecuo = 0;
  let passo = 0;

  for (let ms = 0; ms <= opcoes.duracaoMs; ms += 5) {
    if (ms > 0 && ms % 100 === 0) {
      passo++;
      const ritmo = velocidade(ms);
      tick += ritmo;
      const mudo = opcoes.mudoDesdeMs !== undefined && ms >= opcoes.mudoDesdeMs;
      if (!mudo && passo % opcoes.amostraACada === 0) {
        const faixa = opcoes.atrasoMaxMs - opcoes.atrasoMinMs;
        const atraso =
          opcoes.atrasoMinMs + (faixa > 0 ? sorteioAte(faixa + 1, 7, "atraso", "rede", passo) : 0);
        chegadas.push({ em: ms + atraso, tick, velocidade: ritmo });
      }
    }
    chegadas.sort((a, b) => a.em - b.em);
    while (chegadas[0] && chegadas[0].em <= ms) {
      const chegada = chegadas.shift();
      if (!chegada) break;
      relogio.definirVelocidade(chegada.velocidade, ms);
      relogio.amostra(chegada.tick, ms);
    }
    const estimado = relogio.estimar(ms);
    maiorRecuo = Math.max(maiorRecuo, anterior - estimado);
    anterior = estimado;
    // O tick de verdade, com fração: quanto do passo em curso já passou.
    const real = tick + ((ms % 100) / 100) * velocidade(ms);
    medidas.push({ ms, estimado, real });
  }
  return { medidas, maiorRecuo };
}

describe("estimativa do tick do servidor", () => {
  it("só com o pulso de um segundo, acompanha o servidor e nunca anda para trás", () => {
    const { medidas, maiorRecuo } = simular({
      duracaoMs: 30_000,
      amostraACada: 10,
      atrasoMinMs: 15,
      atrasoMaxMs: 60,
    });
    expect(maiorRecuo).toBeLessThanOrEqual(0);
    for (const medida of medidas.filter((m) => m.ms > 3000)) {
      // Fica um pouco atrás do servidor, pelo atraso da rede (15 a 60 ms), e nunca adiante.
      expect(medida.real - medida.estimado).toBeGreaterThan(-0.1);
      expect(medida.real - medida.estimado).toBeLessThan(0.8);
    }
  });

  it("com amostras a cada passo e rede tremida, o erro continua limitado", () => {
    const { medidas, maiorRecuo } = simular({
      duracaoMs: 30_000,
      amostraACada: 1,
      atrasoMinMs: 5,
      atrasoMaxMs: 95,
    });
    expect(maiorRecuo).toBeLessThanOrEqual(0);
    for (const medida of medidas.filter((m) => m.ms > 3000)) {
      // Com até 95 ms de atraso, menos de um tick de diferença.
      expect(medida.real - medida.estimado).toBeGreaterThan(-0.1);
      expect(medida.real - medida.estimado).toBeLessThan(1);
    }
  });

  it("converge depois de começar muito errado", () => {
    const relogio = new RelogioDoServidor();
    relogio.reiniciar(100, 0, 1);
    // O servidor na verdade está 40 ticks à frente do que a visão inteira dizia.
    for (let ms = 1000; ms <= 5000; ms += 1000) relogio.amostra(140 + ms / 100, ms + 20);
    expect(Math.abs(relogio.estimar(5020) - 190)).toBeLessThan(0.5);
  });

  it("acompanha a mudança de ritmo e a pausa", () => {
    const ritmo = (ms: number) => (ms < 5000 ? 1 : ms < 10_000 ? 3 : ms < 15_000 ? 0 : 2);
    const { medidas, maiorRecuo } = simular({
      duracaoMs: 20_000,
      amostraACada: 5,
      atrasoMinMs: 10,
      atrasoMaxMs: 40,
      velocidade: ritmo,
    });
    expect(maiorRecuo).toBeLessThanOrEqual(0);
    const em = (ms: number) => medidas.find((m) => m.ms === ms);
    for (const ms of [4500, 9500, 14_500, 19_500]) {
      const medida = em(ms);
      expect(medida).toBeDefined();
      if (medida) expect(Math.abs(medida.real - medida.estimado)).toBeLessThan(4);
    }
    // Pausado, o relógio do cliente também para.
    expect(em(14_900)?.estimado).toBeCloseTo(em(13_000)?.estimado ?? 0, 1);
  });

  it("para de extrapolar pouco depois que o servidor silencia", () => {
    const { medidas } = simular({
      duracaoMs: 20_000,
      amostraACada: 10,
      atrasoMinMs: 20,
      atrasoMaxMs: 20,
      mudoDesdeMs: 8000,
    });
    const noFim = medidas[medidas.length - 1];
    const quandoCalou = medidas.find((m) => m.ms === 8000);
    expect(noFim && quandoCalou).toBeTruthy();
    if (noFim && quandoCalou) {
      // O servidor "andou" 120 ticks em silêncio; o cliente, no máximo a folga.
      expect(noFim.estimado - quandoCalou.estimado).toBeLessThanOrEqual(26);
    }
  });

  it("volta atrás só quando a visão inteira manda recomeçar", () => {
    const relogio = new RelogioDoServidor();
    relogio.reiniciar(900, 0, 1);
    expect(relogio.estimar(1000)).toBeCloseTo(910, 5);
    // Um mundo novo (o servidor reiniciou do zero) chega com tick menor.
    relogio.reiniciar(3, 1100, 1);
    expect(relogio.estimar(1100)).toBe(3);
    // Uma amostra atrasada, de um tick já passado, não puxa a estimativa para trás.
    relogio.amostra(2, 1150);
    expect(relogio.estimar(1150)).toBeGreaterThanOrEqual(3);
  });
});
