import { describe, expect, it } from "vitest";
import { medidasDosQuadros } from "./cena";

describe("janela de desempenho", () => {
  it("uma janela abaixo de seis FPS ainda informa a lentidão para reduzir a qualidade", () => {
    const intervalos = new Array(20).fill(250);
    const m = medidasDosQuadros(intervalos, new Array(20).fill(90));
    expect(m).toEqual({ p95Ms: 250, p50Ms: 250, mediaMs: 250, custoMs: 90 });
    expect(medidasDosQuadros([], [])).toBeNull();
  });
});
