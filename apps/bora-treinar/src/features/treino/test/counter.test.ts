import { describe, expect, it } from "vitest";
import { skeletonToLandmarks } from "../body/landmarks";
import { POSES } from "../body/poses";
import { EXERCISES, type Exercise, exerciseById } from "../catalog/catalog";
import {
  evalMetric,
  type HoldRule,
  HoldTracker,
  RepCounter,
  type RepRule,
} from "../engine/counter";
import { synthFrames } from "./synth";

const repExercises = EXERCISES.filter((e) => e.rule.kind === "reps");
const holdExercises = EXERCISES.filter((e) => e.rule.kind === "hold");

const repRule = (ex: Exercise) => ex.rule as RepRule;

/** Valor da medida do exercício com o instrutor parado na profundidade `d`. */
function metricAt(ex: Exercise, d: number) {
  const result = evalMetric(
    repRule(ex).metric,
    skeletonToLandmarks(POSES[ex.pose]({ depth: d, phase: d / 2, time: 0 })),
  );
  if (!result) throw new Error(`${ex.id}: medida invisível na pose do instrutor`);
  return result.value;
}

describe("limiares batem com o movimento do instrutor", () => {
  for (const ex of repExercises) {
    it(ex.id, () => {
      const rule = repRule(ex);
      const top = metricAt(ex, 0);
      const bottom = metricAt(ex, 1);
      const margin = (a: number, b: number) => Math.sign(rule.peak - rule.rest) * (b - a);
      // topo deve passar do limiar de descanso e fundo deve passar do limiar de pico, com folga de 5°
      expect(margin(top, rule.rest), `${ex.id} topo=${top.toFixed(1)}`).toBeGreaterThan(5);
      expect(margin(rule.peak, bottom), `${ex.id} fundo=${bottom.toFixed(1)}`).toBeGreaterThan(5);
    });
  }
});

describe("contagem de repetições com ruído", () => {
  for (const ex of repExercises) {
    it(`${ex.id}: conta 10 de 10`, () => {
      const c = new RepCounter(repRule(ex));
      const events = synthFrames(ex, 10).flatMap((f) => c.update(f.lm, f.t).events);
      expect(events.filter((e) => e.type === "rep")).toHaveLength(10);
      expect(events.filter((e) => e.type === "partial")).toHaveLength(0);
    });
    it(`${ex.id}: amplitude incompleta vira parcial, não repetição`, () => {
      const rule = repRule(ex);
      const progressAt = (d: number) => (metricAt(ex, d) - rule.rest) / (rule.peak - rule.rest);
      // profundidade que leva a 75% do caminho até o limiar (busca binária)
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (progressAt(mid) < 0.75) lo = mid;
        else hi = mid;
      }
      const c = new RepCounter(rule);
      const events = synthFrames(ex, 5, lo, 0.006, 11).flatMap((f) => c.update(f.lm, f.t).events);
      expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
      expect(events.filter((e) => e.type === "partial")).toHaveLength(5);
    });
  }

  it("flexão com quadril caído gera aviso de alinhamento", () => {
    const ex = exerciseById("flexao");
    const c = new RepCounter(repRule(ex));
    const events = synthFrames(ex, 3).flatMap((f) => {
      // empurra o quadril para baixo, quebrando a linha ombro-quadril-tornozelo
      for (const i of [23, 24]) {
        const hip = f.lm[i];
        if (hip) f.lm[i] = { ...hip, y: hip.y + 0.2 };
      }
      return c.update(f.lm, f.t).events;
    });
    expect(events.filter((e) => e.type === "rep")).toHaveLength(3);
    expect(events.every((e) => e.issues.includes("Mantenha o quadril alinhado"))).toBe(true);
  });

  it("pontos invisíveis não contam nada", () => {
    const ex = exerciseById("agachamento");
    const c = new RepCounter(repRule(ex));
    const events = synthFrames(ex, 4).flatMap(
      (f) =>
        c.update(
          f.lm.map((l) => ({ ...l, visibility: 0.1 })),
          f.t,
        ).events,
    );
    expect(events).toHaveLength(0);
  });
});

describe("isometrias", () => {
  function settle(rule: HoldRule, pose: (t: number) => ReturnType<typeof skeletonToLandmarks>) {
    const h = new HoldTracker(rule);
    let last = h.update(pose(0), 0);
    for (let t = 33; t < 1000; t += 33) last = h.update(pose(t / 1000), t);
    return last;
  }
  for (const ex of holdExercises) {
    it(`${ex.id}: a postura do instrutor é reconhecida; em pé, não`, () => {
      const rule = ex.rule as HoldRule;
      const holding = settle(rule, (time) =>
        skeletonToLandmarks(POSES[ex.pose]({ depth: 0, phase: 0, time })),
      );
      expect(holding.holding, holding.cue ?? "").toBe(true);
      const standing = settle(rule, (time) =>
        skeletonToLandmarks(POSES.idle({ depth: 0, phase: 0, time })),
      );
      expect(standing.holding).toBe(false);
      expect(standing.cue).toBe(rule.conditions[0]?.cue);
    });
  }
});
