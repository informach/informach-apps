import { describe, expect, it } from "vitest";
import { buildSteps, WORKOUTS, type Workout, workoutById } from "../catalog/workouts";
import { applySuggestion, evaluateSession, initialProgress } from "../engine/progression";
import { WorkoutRunner } from "../engine/runner";
import { newRecords, streakDays } from "../engine/stats";

function clock() {
  let t = 0;
  return { now: () => t, advance: (s: number) => (t += s * 1000) };
}

/** avança o relógio em passos de 100 ms chamando tick */
function run(r: WorkoutRunner, c: ReturnType<typeof clock>, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) {
    c.advance(0.1);
    r.tick();
  }
}

const simple: Workout = {
  id: "t",
  name: "Teste",
  subtitle: "",
  level: "Iniciante",
  focus: "",
  blocks: [
    { type: "sets", slot: "agachamento", sets: 2, target: 3, rest: 20 },
    { type: "sets", slot: "prancha", sets: 1, target: 10, rest: 15 },
  ],
};

describe("passos do treino", () => {
  it("séries com descanso e preparo inicial, sem descanso no fim", () => {
    const steps = buildSteps(simple);
    expect(steps.map((s) => s.kind)).toEqual([
      "rest",
      "exercise",
      "rest",
      "exercise",
      "rest",
      "exercise",
    ]);
    expect(steps[0]).toMatchObject({ label: "Prepare-se", next: "agachamento" });
    expect(steps[4]).toMatchObject({ seconds: 20, next: "prancha" });
  });
  it("trilhas usam o nível e o bônus do perfil", () => {
    const w = workoutById("primeiro-treino");
    const steps = buildSteps(w, { empurrar: { level: 2, bonus: 2 } });
    const push = steps.find((s) => s.kind === "exercise" && s.exerciseId.startsWith("flexao"));
    expect(push).toMatchObject({ exerciseId: "flexao", target: 10 });
  });
  it("todos os treinos prontos geram passos válidos", () => {
    for (const w of WORKOUTS) expect(buildSteps(w).length).toBeGreaterThan(1);
  });
});

describe("executor", () => {
  it("conduz séries, descanso, isometria e termina com registros", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(simple), c.now);
    const events: string[] = [];
    r.on((e) => events.push(e.type));
    r.start();
    run(r, c, 8.2); // preparo
    expect(r.step?.kind).toBe("exercise");
    r.addRep();
    r.addRep();
    r.addRep();
    run(r, c, 1);
    expect(r.step?.kind).toBe("rest");
    run(r, c, 20.2);
    r.addRep();
    r.addRep();
    r.addRep();
    r.addRep(-1);
    r.addRep();
    run(r, c, 1);
    run(r, c, 20.2);
    expect(r.isHold).toBe(true);
    r.setHolding(true);
    run(r, c, 6);
    r.setHolding(false); // saiu da posição: não conta
    run(r, c, 3);
    r.setHolding(true);
    run(r, c, 4.5);
    expect(r.done).toBe(true);
    expect(r.logs.map((l) => [l.exerciseId, l.reps, l.holdSeconds])).toEqual([
      ["agachamento", 3, 0],
      ["agachamento", 3, 0],
      ["prancha", 0, 10],
    ]);
    expect(events).toContain("countdown");
    expect(events[events.length - 1]).toBe("finish");
  });

  it("pausa congela o cronômetro", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(simple), c.now);
    r.start();
    run(r, c, 3);
    r.pause();
    run(r, c, 30);
    expect(r.step?.kind).toBe("rest");
    expect(Math.round(r.remaining ?? -1)).toBe(5);
    r.resume();
    run(r, c, 5.2);
    expect(r.step?.kind).toBe("exercise");
  });

  it("AMRAP avança no circuito e conta voltas", () => {
    const c = clock();
    const w = workoutById("amrap-8");
    const r = new WorkoutRunner(buildSteps(w), c.now);
    r.start();
    run(r, c, 8.2);
    expect(r.step?.kind).toBe("amrap");
    for (let i = 0; i < 15 + 10 + 5 + 3; i++) r.addRep();
    expect(r.amrapRounds).toBe(1);
    expect(r.exerciseId).toBe("polichinelo");
    run(r, c, 8 * 60 + 1);
    expect(r.done).toBe(true);
    expect(r.totalReps).toBe(33);
  });

  it("EMOM espera o minuto acabar mesmo com a meta cumprida", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(workoutById("emom-6")), c.now);
    r.start();
    run(r, c, 8.2);
    for (let i = 0; i < 6; i++) r.addRep();
    run(r, c, 10);
    expect(r.targetReached).toBe(true);
    expect(r.step?.kind).toBe("exercise");
    run(r, c, 50.5);
    expect(r.exerciseId).toBe("agachamento");
  });
});

describe("progressão e recordes", () => {
  const logs = (reps: number) =>
    [1, 2, 3].map(() => ({
      exerciseId: "flexao-inclinada",
      kind: "reps" as const,
      target: 8,
      reps,
      partials: 0,
      holdSeconds: 0,
      seconds: 30,
      issues: {},
    }));
  it("sugere bônus depois de duas sessões batendo a meta e depois o próximo nível", () => {
    let p = initialProgress();
    let r = evaluateSession(p, logs(8));
    expect(r.suggestions).toHaveLength(0);
    r = evaluateSession(r.progress, logs(9));
    expect(r.suggestions[0]).toMatchObject({ type: "bonus", from: 0, to: 2 });
    p = r.progress;
    for (let i = 0; i < 3; i++)
      p = applySuggestion(p, {
        chainId: "empurrar",
        type: "bonus",
        exerciseId: "flexao-inclinada",
        from: 0,
        to: 2 * (i + 1),
      });
    r = evaluateSession(evaluateSession(p, logs(8)).progress, logs(8));
    expect(r.suggestions[0]).toMatchObject({ type: "level", to: "flexao-joelhos" });
    expect(evaluateSession(p, logs(5)).progress.empurrar?.streak).toBe(0);
  });
  it("recordes e sequência de dias", () => {
    const day = 86_400_000;
    const now = new Date(2026, 9, 31, 12).getTime();
    const s = (d: number, reps: number) => ({
      startedAt: now - d * day,
      duration: 600,
      logs: logs(reps),
    });
    expect(streakDays([s(0, 5), s(1, 5), s(2, 5), s(4, 5)], now)).toBe(3);
    expect(streakDays([s(1, 5), s(2, 5)], now)).toBe(2);
    expect(newRecords([s(1, 8)], logs(9).slice(0, 1))).toEqual([
      { exerciseId: "flexao-inclinada", kind: "reps", value: 9 },
    ]);
    expect(newRecords([s(1, 9)], logs(9))).toEqual([]);
  });
});
