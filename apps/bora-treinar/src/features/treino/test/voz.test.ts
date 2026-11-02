import { describe, expect, it } from "vitest";
import { contagemPelaVoz, numerosDitos, SALTO_MAXIMO } from "../engine/voz";

describe("números ditos", () => {
  it("entende por extenso, com e sem acento, e em algarismos", () => {
    expect(numerosDitos("um, dois, Três... quatro")).toEqual([1, 2, 3, 4]);
    expect(numerosDitos("tres")).toEqual([3]);
    expect(numerosDitos("1 2 3")).toEqual([1, 2, 3]);
    expect(numerosDitos("uma duas")).toEqual([1, 2]);
  });

  it("junta dezena e unidade ditas com 'e'", () => {
    expect(numerosDitos("dezenove vinte vinte e um vinte e dois")).toEqual([19, 20, 21, 22]);
    expect(numerosDitos("quatorze catorze quinze")).toEqual([14, 14, 15]);
    expect(numerosDitos("trinta e cinco")).toEqual([35]);
  });

  it("ignora o resto da fala", () => {
    expect(numerosDitos("vamos lá, força")).toEqual([]);
    expect(numerosDitos("quase lá: oito!")).toEqual([8]);
  });
});

describe("contagem pela voz", () => {
  it("só avança e aceita um número perdido no meio", () => {
    expect(contagemPelaVoz(0, [1, 2, 3])).toBe(3);
    expect(contagemPelaVoz(5, [7])).toBe(7);
  });

  it("ignora repetição, eco e números menores", () => {
    expect(contagemPelaVoz(6, [6, 5, 1])).toBe(6);
  });

  it("recusa saltos grandes, mais prováveis de serem erro de reconhecimento", () => {
    expect(contagemPelaVoz(2, [2 + SALTO_MAXIMO + 1])).toBe(2);
    expect(contagemPelaVoz(2, [20, 3])).toBe(3);
  });
});
