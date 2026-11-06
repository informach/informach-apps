import { describe, expect, it } from "vitest";
import type { Landmark } from "../body/landmarks";
import { skeletonToLandmarks } from "../body/landmarks";
import { POSES } from "../body/poses";
import { exerciseById } from "../catalog/catalog";
import {
  CHECAGEM_VAZIA,
  corpoInteiro,
  luminanciaMedia,
  naPosicaoInicial,
  tudoPronto,
} from "../vision/enquadramento";

/** 33 pontos de imagem no meio do quadro, todos visíveis. */
const imagem = (muda: (i: number, p: Landmark) => Landmark = (_, p) => p): Landmark[] =>
  Array.from({ length: 33 }, (_, i) =>
    muda(i, { x: 0.5, y: 0.2 + (i / 33) * 0.6, z: 0, visibility: 0.9 }),
  );

describe("portão: corpo inteiro", () => {
  it("vê cabeça, mãos e pés dentro da imagem", () => {
    expect(corpoInteiro(imagem())).toBe(true);
  });
  it("pé fora do quadro ou escondido reprova", () => {
    expect(corpoInteiro(imagem((i, p) => (i === 27 ? { ...p, y: 1.04 } : p)))).toBe(false);
    expect(corpoInteiro(imagem((i, p) => (i === 16 ? { ...p, visibility: 0.2 } : p)))).toBe(false);
    expect(corpoInteiro(imagem((i, p) => (i === 0 ? { ...p, y: 0.005 } : p)))).toBe(false);
    expect(corpoInteiro([])).toBe(false);
  });
});

describe("portão: posição inicial", () => {
  const mundo = (pose: keyof typeof POSES, depth: number) =>
    skeletonToLandmarks(POSES[pose]({ depth, phase: 0, time: 0 }));
  it("em pé vale para o agachamento; no fundo, não", () => {
    const rule = exerciseById("agachamento").rule;
    expect(naPosicaoInicial(rule, mundo("squat", 0))).toBe(true);
    expect(naPosicaoInicial(rule, mundo("squat", 1))).toBe(false);
  });
  it("flexão começa com os braços esticados", () => {
    const rule = exerciseById("flexao").rule;
    expect(naPosicaoInicial(rule, mundo("pushup", 0))).toBe(true);
    expect(naPosicaoInicial(rule, mundo("pushup", 1))).toBe(false);
  });
  it("isometria e alongamento não têm posição de partida", () => {
    expect(naPosicaoInicial(exerciseById("prancha").rule, [])).toBe(true);
    expect(naPosicaoInicial(exerciseById("postura-da-crianca").rule, [])).toBe(true);
  });
});

describe("portão: luz e prontidão", () => {
  it("luminância de preto e branco", () => {
    expect(luminanciaMedia([0, 0, 0, 255, 0, 0, 0, 255])).toBe(0);
    expect(luminanciaMedia([255, 255, 255, 255])).toBeCloseTo(1);
  });
  it("luz não medida não segura o começo; luz fraca segura", () => {
    const ok = { camera: true, luz: null, corpo: true, posicao: true };
    expect(tudoPronto(ok)).toBe(true);
    expect(tudoPronto({ ...ok, luz: false })).toBe(false);
    expect(tudoPronto(CHECAGEM_VAZIA)).toBe(false);
  });
});

describe("poses dos alongamentos", () => {
  it("não geram NaN e ficam acima do chão", () => {
    for (const pose of ["quadStretch", "hamstringStretch", "chestStretch", "childPose"] as const) {
      for (const time of [0, 0.7, 3.1]) {
        const sk = POSES[pose]({ depth: 0, phase: 0, time });
        for (const [nome, p] of Object.entries(sk.j)) {
          expect(p.every(Number.isFinite), `${pose}.${nome}`).toBe(true);
          expect(p[1], `${pose}.${nome} abaixo do chão`).toBeGreaterThan(-0.05);
        }
      }
    }
  });
});
