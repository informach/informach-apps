import { describe, expect, it } from "vitest";
import {
  buildSteps,
  seriesPlanejadas,
  WORKOUTS,
  type Workout,
  workoutById,
} from "../catalog/workouts";
import {
  applySuggestion,
  evaluateSession,
  initialProgress,
  PESO_PARA_DESCER,
  pendingSuggestions,
} from "../engine/progression";
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
  it("começa no exercício (o portão prepara) e não termina com descanso", () => {
    const steps = buildSteps(simple);
    expect(steps.map((s) => s.kind)).toEqual(["exercise", "rest", "exercise", "rest", "exercise"]);
    expect(steps[0]).toMatchObject({ exerciseId: "agachamento", target: 3 });
    expect(steps[3]).toMatchObject({ seconds: 20, next: "prancha" });
  });
  it("leve troca o salto por versão sem impacto e reduz a meta; forte aumenta", () => {
    const w: Workout = {
      ...simple,
      blocks: [{ type: "sets", slot: "agachamento-salto", sets: 1, target: 10, rest: 20 }],
    };
    expect(buildSteps(w, {}, { intensidade: "leve" })[0]).toMatchObject({
      exerciseId: "agachamento-sumo",
      target: 7,
    });
    expect(buildSteps(w, {}, { intensidade: "forte" })[0]).toMatchObject({
      exerciseId: "agachamento-salto",
      target: 12,
    });
    expect(buildSteps(w)[0]).toMatchObject({ exerciseId: "agachamento-salto", target: 10 });
  });
  it("aquecimento vem antes, sem meta, e não entra nas séries planejadas", () => {
    const steps = buildSteps(simple, {}, { aquecimento: true });
    const aquec = steps.filter((st) => st.kind === "exercise" && st.label === "Aquecimento");
    expect(aquec).toHaveLength(4);
    expect(aquec.every((st) => st.kind === "exercise" && st.target === undefined)).toBe(true);
    expect(steps[0]).toMatchObject({ label: "Aquecimento" });
    const { contagem, metas } = seriesPlanejadas(steps);
    expect(contagem.get("agachamento")).toBe(2);
    expect(metas.get("agachamento")).toEqual([3]);
    expect(contagem.has("corrida-estacionaria")).toBe(false);
    // o treino de aquecimento não ganha outro aquecimento
    const so = buildSteps(workoutById("aquecimento-5"), {}, { aquecimento: true });
    expect(so).toEqual(buildSteps(workoutById("aquecimento-5")));
  });
  it("trilhas usam o nível e o bônus do perfil", () => {
    const w = workoutById("primeiro-treino");
    const steps = buildSteps(w, { empurrar: { level: 2, bonus: 2 } });
    const push = steps.find((s) => s.kind === "exercise" && s.exerciseId.startsWith("flexao"));
    expect(push).toMatchObject({ exerciseId: "flexao", target: 10 });
  });
  it("todos os treinos prontos geram passos válidos", () => {
    for (const w of WORKOUTS) {
      const steps = buildSteps(w);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]?.kind).not.toBe("rest");
      expect(steps[steps.length - 1]?.kind).not.toBe("rest");
    }
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

  it("anuncia cada segundo da isometria só enquanto a pessoa está na posição", () => {
    const c = clock();
    const prancha = simple.blocks[1];
    if (!prancha) throw new Error("bloco de prancha ausente");
    const r = new WorkoutRunner(buildSteps({ ...simple, blocks: [prancha] }), c.now);
    const segundos: number[] = [];
    r.on((e) => {
      if (e.type === "hold-second") segundos.push(e.seconds);
    });
    r.start();
    while (!r.isHold) run(r, c, 1);
    r.setHolding(true);
    run(r, c, 4.05);
    r.setHolding(false); // saiu da posição: não conta nem fala
    run(r, c, 3);
    r.setHolding(true);
    run(r, c, 7);
    expect(segundos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.done).toBe(true);
  });

  it("pausa congela o cronômetro", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(simple), c.now);
    r.start();
    for (let i = 0; i < 3; i++) r.addRep();
    run(r, c, 1);
    expect(r.step?.kind).toBe("rest");
    const antes = Math.round(r.remaining ?? -1);
    r.pause();
    run(r, c, 30);
    expect(r.step?.kind).toBe("rest");
    expect(Math.round(r.remaining ?? -1)).toBe(antes);
    r.resume();
    run(r, c, antes + 0.2);
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

  it("voltar do descanso refaz a série sem registrá-la duas vezes", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(simple), c.now);
    r.start();
    run(r, c, 8.2);
    for (let i = 0; i < 3; i++) r.addRep();
    run(r, c, 1);
    expect(r.step?.kind).toBe("rest");
    expect(r.logs).toHaveLength(1);
    r.prev();
    expect(r.step?.kind).toBe("exercise");
    expect(r.logs).toHaveLength(0);
    for (let i = 0; i < 3; i++) r.addRep();
    run(r, c, 1);
    expect(r.logs.map((l) => l.reps)).toEqual([3]);
  });

  it("+15 s vale só para este descanso, sem mudar o passo", () => {
    const c = clock();
    const steps = buildSteps(simple);
    const r = new WorkoutRunner(steps, c.now);
    r.start();
    for (let i = 0; i < 3; i++) r.addRep();
    run(r, c, 1);
    expect(r.step?.kind).toBe("rest");
    const before = Math.round(r.remaining ?? -1);
    r.extendRest(15);
    expect(steps[1]?.kind === "rest" ? steps[1].seconds : -2).toBe(20);
    expect(Math.round(r.remaining ?? -1)).toBe(before + 15);
  });

  it("−1 no AMRAP também desconta do total e não comemora", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(workoutById("amrap-8")), c.now);
    const deltas: number[] = [];
    r.on((e) => {
      if (e.type === "rep") deltas.push(e.delta);
    });
    r.start();
    run(r, c, 8.2);
    r.addRep();
    r.addRep();
    r.addRep(-1);
    r.finish();
    expect(deltas).toEqual([1, 1, -1]);
    expect(r.totalReps).toBe(1);
  });

  it("o tempo do treino começa no start, não na montagem", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(simple), c.now, () => 1_700_000_000_000 + c.now());
    c.advance(30); // a tela montou e a pessoa demorou a começar
    expect(r.totalElapsed).toBe(0);
    r.start();
    run(r, c, 5);
    expect(Math.round(r.totalElapsed)).toBe(5);
    expect(r.startedWallAt).toBe(1_700_000_030_000);
  });

  it("encerrar registra a série em andamento", () => {
    const c = clock();
    const r = new WorkoutRunner(buildSteps(simple), c.now);
    r.start();
    run(r, c, 8.2);
    r.addRep();
    r.addRep();
    r.finish();
    expect(r.logs.map((l) => l.reps)).toEqual([2]);
    expect(r.done).toBe(true);
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
  it("série planejada e não feita é meta não batida", () => {
    const planejadas = new Map([["flexao-inclinada", 3]]);
    const r = evaluateSession(initialProgress(), logs(8).slice(0, 1), { planejadas });
    expect(r.progress.empurrar).toMatchObject({ streak: 0, struggle: 1 });
    const cheio = evaluateSession(initialProgress(), logs(8), { planejadas });
    expect(cheio.progress.empurrar).toMatchObject({ streak: 1, struggle: 0 });
  });
  it("fácil avança mais rápido; difícil não avança e pesa", () => {
    const facil = evaluateSession(initialProgress(), logs(8), { feeling: "facil" });
    expect(facil.progress.empurrar?.streak).toBe(2);
    expect(facil.suggestions[0]).toMatchObject({ type: "bonus" });
    const dificil = evaluateSession(initialProgress(), logs(8), { feeling: "dificil" });
    expect(dificil.progress.empurrar).toMatchObject({ streak: 0, struggle: 2 });
    expect(dificil.suggestions).toHaveLength(0);
  });
  it("sugere descer: primeiro tira o bônus, depois volta um nível", () => {
    let p = initialProgress();
    p.empurrar = { level: 1, bonus: 2, streak: 0, struggle: 0 };
    let r = evaluateSession(
      p,
      logs(5).map((l) => ({ ...l, exerciseId: "flexao-joelhos" })),
    );
    r = evaluateSession(
      r.progress,
      logs(5).map((l) => ({ ...l, exerciseId: "flexao-joelhos" })),
      { feeling: "dificil" },
    );
    expect(r.progress.empurrar?.struggle).toBeGreaterThanOrEqual(PESO_PARA_DESCER);
    const desce = r.suggestions[0];
    expect(desce).toMatchObject({ type: "down", bonusFrom: 2, bonusTo: 0 });
    if (!desce) throw new Error("sem sugestão");
    p = applySuggestion(r.progress, desce);
    expect(p.empurrar).toMatchObject({ level: 1, bonus: 0, struggle: 0 });
    p.empurrar = { level: 1, bonus: 0, streak: 0, struggle: PESO_PARA_DESCER };
    const volta = pendingSuggestions(p)[0];
    expect(volta).toMatchObject({ type: "down", from: "flexao-joelhos", to: "flexao-inclinada" });
    if (!volta) throw new Error("sem sugestão");
    expect(applySuggestion(p, volta).empurrar).toMatchObject({ level: 0, bonus: 0 });
    // no primeiro nível sem bônus não há para onde descer
    p.empurrar = { level: 0, bonus: 0, streak: 0, struggle: 9 };
    expect(pendingSuggestions(p).filter((x) => x.chainId === "empurrar")).toEqual([]);
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

describe("treinar junto", () => {
  it("rodízio por série, cada um com o seu nível, intensidade e meta", async () => {
    const { buildGroupSteps, soSeries } = await import("../catalog/workouts");
    const w = workoutById("primeiro-treino");
    expect(soSeries(w)).toBe(true);
    expect(soSeries(workoutById("amrap-8"))).toBe(false);
    const steps = buildGroupSteps(w, [
      { profileId: "a", name: "Ana", levels: {}, intensidade: "normal" },
      {
        profileId: "b",
        name: "Beto",
        levels: { pernas: { level: 1, bonus: 0 } },
        intensidade: "leve",
      },
    ]);
    const ex = steps.filter((s) => s.kind === "exercise");
    expect(ex).toHaveLength(2 * (3 + 3 + 3 + 2));
    expect(ex[0]).toMatchObject({ profileId: "a", exerciseId: "agachamento", target: 10, set: 1 });
    expect(ex[1]).toMatchObject({
      profileId: "b",
      exerciseId: "agachamento-sumo",
      target: 7,
      set: 1,
    });
    expect(ex[2]).toMatchObject({ profileId: "a", set: 2 });
    expect(steps[0]?.kind).toBe("exercise");
    expect(steps[1]).toMatchObject({ kind: "rest", seconds: 5, label: "Vez de Beto" });
    // o registro da série guarda de quem é
    const c = clock();
    const r = new WorkoutRunner(steps, c.now);
    r.start();
    r.addRep();
    r.next();
    expect(r.logs[0]?.profileId).toBe("a");
  });
});

describe("correções do review", () => {
  it("perfil leve sobe na trilha pelo exercício que fez no lugar (polichinelo → escalador)", async () => {
    const { trocaDaIntensidade } = await import("../catalog/workouts");
    const feitas = [1, 2, 3].map(() => ({
      exerciseId: "escalador",
      kind: "reps" as const,
      target: 10,
      reps: 10,
      partials: 0,
      holdSeconds: 0,
      seconds: 30,
      issues: {},
    }));
    const troca = (id: string) => trocaDaIntensidade(id, "leve");
    const planejadas = new Map([["escalador", 3]]);
    const r = evaluateSession(initialProgress(), feitas, { planejadas, troca });
    expect(r.progress.cardio).toMatchObject({ level: 0, streak: 1 });
    // sem a troca, as séries não eram achadas e a trilha ficava parada
    expect(evaluateSession(initialProgress(), feitas, { planejadas }).progress.cardio?.streak).toBe(
      0,
    );
  });

  it("parar nos alongamentos não marca o treino como interrompido", async () => {
    const { faltaTrabalho } = await import("../catalog/workouts");
    const steps = buildSteps(simple, {}, { voltaACalma: true });
    const primeiroAlongamento = steps.findIndex(
      (s) => s.kind === "exercise" && s.label === "Volta à calma",
    );
    expect(primeiroAlongamento).toBeGreaterThan(0);
    expect(faltaTrabalho(steps, primeiroAlongamento)).toBe(false);
    expect(faltaTrabalho(steps, primeiroAlongamento - 1)).toBe(false); // o descanso antes
    expect(faltaTrabalho(steps, 0)).toBe(true);
  });
});
