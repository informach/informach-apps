import { describe, expect, it } from "vitest";
import { type EstadoMusica, type Nota, notasDoPasso } from "../engine/musica";

const compasso = (estado: EstadoMusica, n: number) =>
  Array.from({ length: 16 }, (_, passo) => notasDoPasso(estado, n, passo));
const PERCUSSAO = new Set(["bumbo", "caixa", "chimbal"]);
const classe = (midi: number) => ((midi % 12) + 12) % 12;
const alturas = (n: Nota) => (n.acorde ?? (n.midi === undefined ? [] : [n.midi])).map(classe);

describe("música de fundo", () => {
  it("parada não toca nada", () => {
    for (const passo of compasso("parado", 0)) expect(passo).toEqual([]);
  });

  it("na série o bumbo marca os quatro tempos e a caixa o 2 e o 4", () => {
    const passos = compasso("treino", 0);
    const em = (voz: string) =>
      passos.flatMap((notas, i) => (notas.some((n) => n.voz === voz) ? [i] : []));
    expect(em("bumbo")).toEqual([0, 4, 8, 12]);
    expect(em("caixa")).toEqual([4, 12]);
    expect(em("baixo")).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it("o descanso não tem bateria e é mais baixo que a série", () => {
    const notas = compasso("descanso", 0).flat();
    expect(notas.length).toBeGreaterThan(0);
    expect(notas.some((n) => PERCUSSAO.has(n.voz))).toBe(false);
    expect(Math.max(...notas.map((n) => n.forca))).toBeLessThanOrEqual(0.7);
  });

  it("segue Am–F–C–G e toda nota pertence ao acorde do compasso", () => {
    const fundamentais = [9, 5, 0, 7];
    for (const estado of ["treino", "descanso"] as const)
      for (let n = 0; n < 8; n++) {
        const notas = compasso(estado, n).flat();
        const acorde = notas.find((x) => x.voz === "acorde");
        expect(acorde?.acorde).toBeDefined();
        const permitidas = new Set(alturas(acorde as Nota));
        const baixo = notas.find((x) => x.voz === "baixo");
        expect(classe(baixo?.midi ?? -1)).toBe(fundamentais[n % 4]);
        permitidas.add(fundamentais[n % 4] as number);
        for (const nota of notas) for (const a of alturas(nota)) expect(permitidas).toContain(a);
      }
  });
});
