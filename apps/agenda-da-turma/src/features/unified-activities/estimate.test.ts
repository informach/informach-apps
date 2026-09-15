import { describe, expect, it } from "vitest";
import { ESTIMATE_PRESETS, formatBucketEstimate, formatEstimate, sumEstimates } from "./estimate";

describe("formatEstimate", () => {
  it("fica em minutos abaixo de uma hora", () => {
    expect(formatEstimate(5)).toBe("5 min");
    expect(formatEstimate(45)).toBe("45 min");
    expect(formatEstimate(59)).toBe("59 min");
  });

  it("vira hora cheia sem minutos sobrando", () => {
    expect(formatEstimate(60)).toBe("1h");
    expect(formatEstimate(120)).toBe("2h");
  });

  it("mostra os minutos com dois dígitos quando sobram", () => {
    expect(formatEstimate(90)).toBe("1h30");
    expect(formatEstimate(65)).toBe("1h05");
  });

  it("formata todos os degraus do formulário", () => {
    expect(ESTIMATE_PRESETS.map(formatEstimate)).toEqual(["5 min", "15 min", "30 min", "1h"]);
  });
});

describe("sumEstimates", () => {
  it("soma só o que foi estimado e conta o resto", () => {
    expect(sumEstimates([15, null, 30, null, null])).toEqual({
      total: 45,
      counted: 2,
      missing: 3,
    });
  });

  it("trata zero e negativo como não estimado", () => {
    expect(sumEstimates([0, -5, 10])).toEqual({ total: 10, counted: 1, missing: 2 });
  });

  it("lista vazia não soma nada", () => {
    expect(sumEstimates([])).toEqual({ total: 0, counted: 0, missing: 0 });
  });
});

describe("formatBucketEstimate", () => {
  it("não diz nada quando ninguém estimou", () => {
    expect(formatBucketEstimate([null, null])).toBeNull();
    expect(formatBucketEstimate([])).toBeNull();
  });

  it("dá o total direto quando tudo está estimado", () => {
    expect(formatBucketEstimate([15, 30])).toBe("~45 min");
    expect(formatBucketEstimate([60, 30])).toBe("~1h30");
  });

  it("avisa que o total é parcial — senão seria promessa falsa", () => {
    // Três de oito estimadas: dizer "~45 min" sem mais nada faria a família
    // planejar a noite em cima de um número que cobre menos da metade da lista.
    expect(formatBucketEstimate([15, 15, 15, null, null, null, null, null])).toBe(
      "~45 min em 3 de 8",
    );
  });
});
