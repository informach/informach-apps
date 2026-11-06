import { describe, expect, it } from "vitest";
import type { Landmark } from "../body/landmarks";
import { skeletonToLandmarks } from "../body/landmarks";
import { POSES } from "../body/poses";
import { EXERCISES, type Exercise, exerciseById } from "../catalog/catalog";
import {
  evalMetric,
  type HoldRule,
  HoldTracker,
  minRepMsFor,
  RepCounter,
  type RepRule,
} from "../engine/counter";
import { rng, synthFrames } from "./synth";

const repExercises = EXERCISES.filter((e) => e.rule.kind === "reps");
const holdExercises = EXERCISES.filter((e) => e.rule.kind === "hold");

const repRule = (ex: Exercise) => ex.rule as RepRule;
/** Contador como o player monta: com a duração mínima da cadência do exercício. */
const counterFor = (ex: Exercise) =>
  new RepCounter(repRule(ex), { minRepMs: minRepMsFor(ex.cadence) });
type Frame = { t: number; lm: Landmark[] };
const run = (c: RepCounter, frames: Frame[]) => frames.flatMap((f) => c.update(f.lm, f.t).events);
const reps = (events: ReturnType<typeof run>) => events.filter((e) => e.type === "rep");
const partials = (events: ReturnType<typeof run>) => events.filter((e) => e.type === "partial");
/** Altera os pontos `idx` de cada quadro (variante "errada" do movimento do instrutor). */
function bend(
  frames: Frame[],
  idx: number[],
  f: (l: Landmark, i: number, lm: Landmark[]) => Partial<Landmark>,
) {
  return frames.map(({ t, lm }) => {
    const out = lm.map((l) => ({ ...l }));
    for (const i of idx) {
      const l = out[i];
      if (l) out[i] = { ...l, ...f(l, i, lm) };
    }
    return { t, lm: out };
  });
}
/** Rastreamento perdido (tudo pouco visível) de `fromS` a `fromS + durS` dentro de cada ciclo. */
function blackout(ex: Exercise, frames: Frame[], fromS: number, durS: number) {
  const { down, bottom, up, top } = ex.cadence;
  const cycle = down + bottom + up + top;
  return frames.map(({ t, lm }) => {
    const k = (t / 1000 - 0.5) % cycle;
    const lost = t / 1000 >= 0.5 && k >= fromS && k < fromS + durS;
    return { t, lm: lost ? lm.map((l) => ({ ...l, visibility: 0.1 })) : lm };
  });
}
/** Polichinelo com os tornozelos na largura do quadril (pernas que não abrem). */
const closedLegs = (l: Landmark, i: number, lm: Landmark[]) => ({
  x: lm[i === 27 ? 23 : 24]?.x ?? l.x,
});

/** Valor da medida do exercício com o instrutor parado na profundidade `d`. */
function metricAt(ex: Exercise, d: number) {
  const result = evalMetric(
    repRule(ex).metric,
    skeletonToLandmarks(POSES[ex.pose]({ depth: d, phase: d / 2, time: 0 })),
  );
  if (!result) throw new Error(`${ex.id}: medida invisível na pose do instrutor`);
  return result.value;
}

/** Profundidade do instrutor que leva a uma fração `target` do caminho até o limiar (busca binária). */
function depthFor(ex: Exercise, target: number) {
  const rule = repRule(ex);
  const progressAt = (d: number) => (metricAt(ex, d) - rule.rest) / (rule.peak - rule.rest);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (progressAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return lo;
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
    it(`${ex.id}: conta 10 de 10, sem aviso de forma`, () => {
      const events = run(counterFor(ex), synthFrames(ex, 10));
      expect(reps(events)).toHaveLength(10);
      expect(partials(events)).toHaveLength(0);
      // as verificações de forma não podem reclamar do próprio instrutor
      expect(events.flatMap((e) => e.issues)).toEqual([]);
    });
    it(`${ex.id}: amplitude incompleta vira parcial, não repetição`, () => {
      const c = counterFor(ex);
      const events = synthFrames(ex, 5, depthFor(ex, 0.75), 0.006, 11).flatMap(
        (f) => c.update(f.lm, f.t).events,
      );
      expect(events.filter((e) => e.type === "rep")).toHaveLength(0);
      expect(events.filter((e) => e.type === "partial")).toHaveLength(5);
    });
    it(`${ex.id}: quase no limiar já conta, porque a câmera erra alguns graus`, () => {
      const c = counterFor(ex);
      const events = synthFrames(ex, 5, depthFor(ex, 0.93), 0.006, 13).flatMap(
        (f) => c.update(f.lm, f.t).events,
      );
      expect(events.filter((e) => e.type === "rep")).toHaveLength(5);
      expect(events.filter((e) => e.type === "partial")).toHaveLength(0);
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

  it("agachamento com joelhos caindo para dentro gera aviso", () => {
    const ex = exerciseById("agachamento");
    // joelhos na metade do afastamento: razão joelhos/tornozelos de 0,46 a 0,65
    const frames = bend(synthFrames(ex, 3), [25, 26], (l) => ({ x: l.x * 0.5 }));
    const events = run(counterFor(ex), frames);
    expect(reps(events)).toHaveLength(3);
    expect(events.every((e) => e.issues.includes("Joelhos para fora, na linha dos pés"))).toBe(
      true,
    );
  });

  it("polichinelo sem abrir as pernas gera aviso", () => {
    const ex = exerciseById("polichinelo");
    const events = run(counterFor(ex), bend(synthFrames(ex, 3), [27, 28], closedLegs));
    expect(reps(events)).toHaveLength(3);
    expect(events.every((e) => e.issues.includes("Abra as pernas também"))).toBe(true);
  });

  it("verificação no fundo olha só o quadro mais fundo", () => {
    const ex = exerciseById("polichinelo");
    const rule = repRule(ex);
    // pernas fechadas em todo o caminho e abertas só perto do fundo: não reclama
    const frames = bend(synthFrames(ex, 3), [27, 28], (l, i, lm) => {
      const r = evalMetric(rule.metric, lm);
      const p = r ? (r.value - rule.rest) / (rule.peak - rule.rest) : 0;
      return p > 0.9 ? {} : closedLegs(l, i, lm);
    });
    const events = run(counterFor(ex), frames);
    expect(reps(events)).toHaveLength(3);
    expect(events.flatMap((e) => e.issues)).toEqual([]);
  });

  for (const id of ["afundo", "afundo-reverso"])
    it(`${id} com o tronco inclinado à frente gera aviso`, () => {
      const ex = exerciseById(id);
      // ombros 35 cm à frente do quadril: tronco a uns 35° da vertical
      const frames = bend(synthFrames(ex, 3), [11, 12], (l) => ({ z: l.z + 0.35 }));
      const events = run(counterFor(ex), frames);
      expect(reps(events)).toHaveLength(3);
      expect(events.every((e) => e.issues.includes("Tronco reto, olhe para frente"))).toBe(true);
    });

  it("um pico de dois quadros até o fundo é ruído, não repetição", () => {
    const ex = exerciseById("agachamento");
    const pose = POSES[ex.pose];
    const rand = rng(5);
    const frames: Frame[] = [];
    for (let i = 0; i < 90; i++) {
      const depth = i === 40 || i === 41 ? 1 : 0;
      frames.push({
        t: (i * 1000) / 30,
        lm: skeletonToLandmarks(pose({ depth, phase: 0, time: i / 30 }), 0.006, rand),
      });
    }
    // sem a duração mínima o tremor viraria repetição
    expect(run(new RepCounter(repRule(ex)), frames).length).toBeGreaterThan(0);
    expect(run(counterFor(ex), frames)).toHaveLength(0);
  });

  it("lado encoberto não atrapalha: a medida usa o lado visível", () => {
    const ex = exerciseById("agachamento");
    const rule = repRule(ex);
    // joelho esquerdo encoberto, com a posição chutada pelo detector
    const frames = bend(synthFrames(ex, 10), [25], () => ({ visibility: 0.1, x: 0.5 }));
    const lm = frames[0]?.lm ?? [];
    const right = evalMetric({ kind: "angle", at: ["hip", "knee", "ankle"], combine: "min" }, lm);
    expect(right).not.toBeNull();
    expect(evalMetric(rule.metric, lm)).toEqual(right);
    expect(reps(run(counterFor(ex), frames))).toHaveLength(10);
  });

  it("afastamento precisa dos dois lados", () => {
    const ex = exerciseById("agachamento");
    const lm = synthFrames(ex, 1)[0]?.lm ?? [];
    const spread = { kind: "spread", part: "knee", ref: "ankle" } as const;
    expect(evalMetric(spread, lm)?.value).toBeGreaterThan(0.8);
    expect(
      evalMetric(spread, bend([{ t: 0, lm }], [25], () => ({ visibility: 0.1 }))[0]?.lm ?? []),
    ).toBeNull();
  });

  it("perda curta do rastreamento no meio da repetição não a desfaz", () => {
    const ex = exerciseById("agachamento");
    // 400 ms sem medida perto do fundo, em todas as repetições
    const events = run(counterFor(ex), blackout(ex, synthFrames(ex, 5), 1.2, 0.4));
    expect(reps(events)).toHaveLength(5);
    expect(partials(events)).toHaveLength(0);
  });

  it("perda longa do rastreamento recomeça do topo", () => {
    const ex = exerciseById("agachamento");
    // 1,2 s sem medida no meio de cada repetição: nenhuma conta
    expect(run(counterFor(ex), blackout(ex, synthFrames(ex, 5), 0.96, 1.2))).toHaveLength(0);
  });

  it("visibilidade baixa no fundo do movimento não perde a repetição", () => {
    const ex = exerciseById("flexao");
    const rule = repRule(ex);
    const c = new RepCounter(rule);
    const events = synthFrames(ex, 5).flatMap((f) => {
      const r = evalMetric(rule.metric, f.lm);
      const p = r ? (r.value - rule.rest) / (rule.peak - rule.rest) : 0;
      // perto do fundo, o detector baixa a confiança em cotovelo e punho
      const lm = p > 0.6 ? f.lm.map((l) => ({ ...l, visibility: 0.4 })) : f.lm;
      return c.update(lm, f.t).events;
    });
    expect(events.filter((e) => e.type === "rep")).toHaveLength(5);
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
