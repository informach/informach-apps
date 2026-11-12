import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonico, copiar, resumo, resumoDe } from "./canonico";
import {
  direcaoPara,
  distancia,
  doLocal,
  frenteDoGiro,
  limitar,
  proporcao,
  raizInteira,
  vezes,
} from "./fixo";
import { diaDeJogo, horaDoDiaMs, tempoDeJogoMs, ticksPorDia } from "./relogio";
import { resumoDoTexto, sorteio, sorteioAte } from "./sorteio";

describe("aritmética inteira", () => {
  it("a raiz inteira é o piso exato", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 50 }), (n) => {
        const raiz = raizInteira(n);
        return raiz * raiz <= n && (raiz + 1) * (raiz + 1) > n;
      }),
      { seed: 1, numRuns: 500 },
    );
    expect(raizInteira(0)).toBe(0);
    expect(raizInteira(-5)).toBe(0);
    expect(raizInteira(24)).toBe(4);
    expect(raizInteira(25)).toBe(5);
  });

  it("proporções arredondam para baixo e ficam nos limites", () => {
    expect(vezes(500_000, 500_000)).toBe(250_000);
    expect(proporcao(10, 1, 3)).toBe(3);
    expect(limitar(-1, 0, 10)).toBe(0);
    expect(limitar(11, 0, 10)).toBe(10);
    expect(distancia([0, 0], [3000, 4000])).toBe(5000);
  });

  it("com giro 0 a frente aponta para −Y, e cada 90° gira no mesmo sentido", () => {
    expect(frenteDoGiro(0)).toEqual([0, -1]);
    expect(frenteDoGiro(90)).toEqual([1, 0]);
    expect(frenteDoGiro(180)).toEqual([0, 1]);
    expect(frenteDoGiro(270)).toEqual([-1, 0]);
    expect(frenteDoGiro(-90)).toEqual([-1, 0]);
    expect(() => frenteDoGiro(45)).toThrow();
    // Um ponto 300 mm à frente e 100 mm de lado.
    expect(doLocal([1000, 1000], 0, [100, 300])).toEqual([1100, 700]);
    expect(doLocal([1000, 1000], 90, [100, 300])).toEqual([1300, 1100]);
    expect(doLocal([1000, 1000], 180, [100, 300])).toEqual([900, 1300]);
    expect(doLocal([1000, 1000], 270, [100, 300])).toEqual([700, 900]);
    expect(direcaoPara([0, 0], [0, -10])).toBe(0);
    expect(direcaoPara([0, 0], [10, 0])).toBe(90);
    expect(direcaoPara([0, 0], [-5, 5])).toBe(225);
  });
});

describe("sorteio por contador", () => {
  it("é função da semente, do domínio, da chave e do tick", () => {
    expect(sorteio(1, "a", "x", 10)).toBe(sorteio(1, "a", "x", 10));
    const variacoes = new Set([
      sorteio(1, "a", "x", 10),
      sorteio(2, "a", "x", 10),
      sorteio(1, "b", "x", 10),
      sorteio(1, "a", "y", 10),
      sorteio(1, "a", "x", 11),
      sorteio(1, "a", "x", 10, 1),
    ]);
    expect(variacoes.size).toBe(6);
  });

  it("dá sempre os mesmos números: um mundo salvo hoje sorteia igual amanhã", () => {
    // Valores fixados. Se mudarem, mundos já salvos passam a se comportar de outro jeito.
    expect(sorteio(20261111, "autonomia", "mor_000001", 1234)).toBe(4154715595);
    expect(resumoDoTexto("morada")).toBe(2018877882);
    expect(resumoDoTexto("morada", 7)).toBe(3819915975);
    expect(resumoDoTexto("")).toBe(0);
    expect(resumoDe({ a: 1, b: ["x", null] })).toBe("8709a1737f4f327d");
    expect(resumoDoTexto("morada")).not.toBe(resumoDoTexto("morado"));
  });

  it("fica no intervalo pedido e espalha bem", () => {
    const contagem = new Array<number>(10).fill(0);
    for (let tick = 0; tick < 20_000; tick++) {
      const valor = sorteioAte(10, 99, "teste", "chave", tick);
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(10);
      contagem[valor] = (contagem[valor] ?? 0) + 1;
    }
    for (const total of contagem) {
      expect(total).toBeGreaterThan(1800);
      expect(total).toBeLessThan(2200);
    }
    expect(() => sorteioAte(0, 1, "a", "b", 0)).toThrow();
  });
});

describe("forma canônica", () => {
  it("não depende da ordem em que os campos foram criados", () => {
    const a = { x: 1, y: { b: [1, 2], a: "t" }, z: null };
    const b = { z: null, y: { a: "t", b: [1, 2] }, x: 1 };
    expect(canonico(a)).toBe(canonico(b));
    expect(resumoDe(a)).toBe(resumoDe(b));
    expect(resumoDe(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(resumoDe({ ...a, x: 2 })).not.toBe(resumoDe(a));
    expect(resumo("a")).not.toBe(resumo("b"));
  });

  it("ignora campo ausente e recusa número quebrado", () => {
    expect(canonico({ a: 1, b: undefined })).toBe(canonico({ a: 1 }));
    expect(() => canonico({ a: 0.5 })).toThrow(/inteiro/);
    expect(() => canonico({ a: Number.NaN })).toThrow();
    expect(() => canonico(() => 1)).toThrow();
  });

  it("copiar devolve dados iguais e independentes", () => {
    const original = { lista: [{ n: 1 }], texto: "a", nada: null };
    const copia = copiar(original);
    expect(copia).toEqual(original);
    (copia.lista[0] as { n: number }).n = 2;
    expect(original.lista[0]?.n).toBe(1);
  });
});

describe("relógio do mundo", () => {
  const relogio = { tick: 0, velocidade: 1 as const, msDeJogoPorTick: 3000 };

  it("um dia de jogo dura 48 minutos reais", () => {
    expect(ticksPorDia(relogio)).toBe(28_800);
    expect((ticksPorDia(relogio) * 100) / 60_000).toBe(48);
  });

  it("o mundo começa às 8 da manhã do dia 1", () => {
    expect(tempoDeJogoMs(relogio)).toBe(8 * 3_600_000);
    expect(diaDeJogo(relogio)).toBe(1);
    expect(horaDoDiaMs(relogio)).toBe(8 * 3_600_000);
    // Dezesseis horas depois é meia-noite: começa o dia 2.
    const meiaNoite = { ...relogio, tick: (16 * 3_600_000) / 3000 };
    expect(diaDeJogo(meiaNoite)).toBe(2);
    expect(horaDoDiaMs(meiaNoite)).toBe(0);
  });
});
