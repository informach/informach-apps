import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUIDED_DEFAULTS,
  type GuidedPlan,
  type GuidedTarget,
  scheduleGuided,
  smoothPointer,
  stepsFromScript,
  stepsFromWords,
} from "../src/shared/guidedRecording.ts";
import { executeGuided, type GuidedDriver } from "../src/shared/guidedRunner.ts";

const target: GuidedTarget = {
  x: 500,
  y: 300,
  window: "123",
  title: "Aula",
  left: 0,
  top: 0,
  width: 1920,
  height: 1080,
};
const plan: GuidedPlan = {
  ...GUIDED_DEFAULTS,
  steps: [
    { id: "1", at: 0, speech: "Clique aqui", action: "click", target },
    { id: "2", at: 5, speech: "Próxima", action: "click", target },
  ],
};

test("cursor arrives before speech/click and leaves time to understand the result", () => {
  const result = scheduleGuided(plan);
  assert.equal(result.lead, 2.5);
  assert.equal(result.steps[0].moveAt, 0.5);
  assert.equal(result.steps[0].arriveAt, 1.7);
  assert.equal(result.steps[0].actAt, 2.5);
  assert.equal(result.steps[0].endAt, 4);
  assert.ok(result.steps[1].moveAt > result.steps[0].endAt);
});

test("rejects compressed timings, missing targets, nonfinite input and unknown keys", () => {
  assert.throws(
    () => scheduleGuided({ ...plan, steps: [plan.steps[0], { ...plan.steps[1], at: 1 }] }),
    /próximas/,
  );
  assert.throws(
    () => scheduleGuided({ ...plan, steps: [{ ...plan.steps[0], target: undefined }] }),
    /alvo/,
  );
  assert.throws(() => scheduleGuided({ ...plan, move: NaN }));
  assert.throws(() =>
    scheduleGuided({ ...plan, steps: [{ ...plan.steps[0], action: "key", value: "F10" }] }),
  );
  assert.throws(() => scheduleGuided({ ...plan, audio: { path: "voice.wav", duration: 2 } }));
});

test("script proposes readable steps; transcript uses actual click word times", () => {
  const script = stepsFromScript("Observe o farol.\nClique em Próxima parte.");
  assert.equal(script[0].action, "point");
  assert.equal(script[1].action, "click");
  assert.ok(script[1].at >= 5);
  assert.equal(script[1].target, undefined);
  const audio = stepsFromWords([
    { text: "Agora", start: 2, end: 2.5, p: 1 },
    { text: "clique", start: 3, end: 3.4, p: 1 },
    { text: "aqui.", start: 3.5, end: 4, p: 1 },
  ]);
  assert.equal(audio[0].at, 3);
  assert.equal(audio[0].speech, "Agora clique aqui.");
  assert.equal(stepsFromScript("Não clique neste botão.")[0].action, "point");
  assert.equal(
    stepsFromWords([
      { text: "Não", start: 0, end: 1, p: 1 },
      { text: "clique", start: 1, end: 2, p: 1 },
    ]).length,
    0,
  );
});

test("smooth pointer is bounded, monotonic and slows down at both ends", () => {
  assert.equal(smoothPointer(-1), 0);
  assert.equal(smoothPointer(2), 1);
  assert.ok(smoothPointer(0.1) < 0.1);
  assert.ok(smoothPointer(0.9) > 0.9);
  for (let i = 1; i <= 100; i++) assert.ok(smoothPointer(i / 100) >= smoothPointer((i - 1) / 100));
});

function simulation() {
  let time = 0;
  let paused = false;
  const events: { at: number; op: string; x?: unknown; y?: unknown }[] = [];
  const controller = new AbortController();
  const input: GuidedDriver = {
    async command<T>(c: Record<string, unknown>): Promise<T> {
      events.push({ at: time, op: String(c.op), x: c.x, y: c.y });
      return (c.op === "sample" ? { ...target, x: 0, y: 0 } : undefined) as T;
    },
  };
  return {
    events,
    controller,
    input,
    time: () => time,
    paused: () => paused,
    setPaused: (v: boolean) => {
      paused = v;
    },
    advance: async (ms: number) => {
      if (!paused) time += ms / 1000;
    },
  };
}

test("runner moves smoothly, dwells before each click and preserves post-click observation", async () => {
  const s = simulation();
  await executeGuided(plan, s.input, s.time, s.paused, s.controller.signal, s.advance);
  const clicks = s.events.filter((e) => e.op === "click");
  assert.equal(clicks.length, 2);
  for (const click of clicks) {
    const moves = s.events.filter((e) => e.op === "move" && e.at < click.at);
    const last = moves.at(-1)!;
    assert.ok(moves.length > 20);
    assert.equal(last.x, target.x);
    assert.equal(last.y, target.y);
    assert.ok(click.at - last.at >= plan.dwell - 0.001);
  }
  assert.ok(s.time() - clicks.at(-1)!.at >= plan.after - 0.001);
});

test("pause freezes execution; cancellation during movement prevents all later clicks", async () => {
  const s = simulation();
  let sleeps = 0;
  let pauseEvents = 0;
  await assert.rejects(
    executeGuided(plan, s.input, s.time, s.paused, s.controller.signal, async (ms) => {
      sleeps++;
      if (sleeps === 50) {
        s.setPaused(true);
        pauseEvents = s.events.length;
      }
      if (sleeps > 50 && sleeps < 65) assert.equal(s.events.length, pauseEvents);
      if (sleeps === 65) {
        s.setPaused(false);
        s.controller.abort();
      }
      await s.advance(ms);
    }),
    /interrompida/,
  );
  assert.equal(s.events.filter((e) => e.op === "click").length, 0);
});

test("late execution stops rather than catching up with rapid actions", async () => {
  const s = simulation();
  await assert.rejects(
    executeGuided(plan, s.input, s.time, s.paused, s.controller.signal, async () => {
      await s.advance(5000);
    }),
    /atrasou/,
  );
  assert.equal(s.events.filter((e) => e.op === "click").length, 0);
});

test("browser targets are resolved again and movement follows their current location", async () => {
  const s = simulation();
  let resolutions = 0;
  await executeGuided(
    { ...plan, steps: [plan.steps[0]] },
    s.input,
    s.time,
    s.paused,
    s.controller.signal,
    s.advance,
    async (t) => {
      resolutions++;
      return { ...t, x: 650, y: 400 };
    },
  );
  assert.equal(resolutions, 2);
  assert.equal(s.events.filter((e) => e.op === "move").at(-1)?.x, 650);
  assert.equal(s.events.filter((e) => e.op === "click").length, 1);
});

test("a target that moves during the dwell is not clicked", async () => {
  const s = simulation();
  let resolutions = 0;
  await assert.rejects(
    executeGuided(
      { ...plan, steps: [plan.steps[0]] },
      s.input,
      s.time,
      s.paused,
      s.controller.signal,
      s.advance,
      async (t) => {
        return { ...t, x: t.x + resolutions++ * 100 };
      },
    ),
    /moveu/,
  );
  assert.equal(s.events.filter((e) => e.op === "click").length, 0);
});

test("separate phrase start anticipates speech while retaining the actual click cue", async () => {
  const p = { ...plan, steps: [{ ...plan.steps[0], at: 3, speechAt: 1 }] };
  const schedule = scheduleGuided(p);
  const step = schedule.steps[0];
  assert.equal(step.arriveAt, step.speechAt - GUIDED_DEFAULTS.anticipation);
  assert.equal(step.actAt, schedule.lead + 3);
  const s = simulation();
  await executeGuided(p, s.input, s.time, s.paused, s.controller.signal, s.advance);
  const arrival = s.events.filter((e) => e.op === "move").at(-1)!;
  assert.ok(arrival.at <= step.speechAt - GUIDED_DEFAULTS.anticipation + 0.04);
  assert.ok(s.events.find((e) => e.op === "click")!.at >= step.actAt);
});

test("phrase timing validation includes overlap, invalid values and legacy plans", () => {
  for (const speechAt of [-1, NaN, Infinity, 2]) {
    assert.throws(
      () => scheduleGuided({ ...plan, steps: [{ ...plan.steps[0], at: 1, speechAt }] }),
      /fala/,
    );
  }
  for (const anticipation of [0, NaN, Infinity, 6])
    assert.throws(() => scheduleGuided({ ...plan, anticipation }), /Antecipação/);
  assert.throws(
    () =>
      scheduleGuided({ ...plan, steps: [plan.steps[0], { ...plan.steps[1], at: 5, speechAt: 1 }] }),
    /próximas/,
  );
  assert.deepEqual(scheduleGuided({ ...plan, anticipation: undefined }), scheduleGuided(plan));
});

test("transcription anticipates the phrase without crossing sentence or silence boundaries", () => {
  const word = (text: string, start: number, end = start + 0.2) => ({ text, start, end, p: 1 });
  assert.equal(stepsFromWords([word("Agora", 1), word("clique", 1.3)])[0].speechAt, 1);
  assert.equal(stepsFromWords([word("Observe.", 1), word("Clique", 1.3)])[0].speechAt, 1.3);
  assert.equal(stepsFromWords([word("Observe", 1), word("Clique", 2)])[0].speechAt, 2);
  assert.equal(stepsFromWords([word("Não,", 1), word("clique", 1.3)]).length, 0);
});

test("slow browser lookup stops before movement instead of consuming the speech anticipation", async () => {
  const s = simulation();
  await assert.rejects(
    executeGuided(plan, s.input, s.time, s.paused, s.controller.signal, s.advance, async (t) => {
      await s.advance(700);
      return t;
    }),
    /localização.*atrasou/,
  );
  assert.equal(s.events.filter((e) => e.op === "move" || e.op === "click").length, 0);
});

test("a stall during movement stops without jumping to the target or clicking", async () => {
  const s = simulation();
  let stalled = false;
  await assert.rejects(
    executeGuided(plan, s.input, s.time, s.paused, s.controller.signal, async (ms) => {
      if (!stalled && s.events.some((e) => e.op === "move")) {
        stalled = true;
        await s.advance(2000);
      } else await s.advance(ms);
    }),
    /salto do cursor/,
  );
  assert.equal(s.events.filter((e) => e.op === "click").length, 0);
  assert.notEqual(s.events.filter((e) => e.op === "move").at(-1)?.x, target.x);
});

test("cancellation during key focus verification prevents the key from being sent", async () => {
  const s = simulation();
  const input: GuidedDriver = {
    async command<T>(command: Record<string, unknown>): Promise<T> {
      const result = await s.input.command<T>(command);
      if (command.focus) s.controller.abort();
      return result;
    },
  };
  await assert.rejects(
    executeGuided(
      { ...plan, steps: [{ ...plan.steps[0], action: "key", value: "Enter" }] },
      input,
      s.time,
      s.paused,
      s.controller.signal,
      s.advance,
    ),
    /interrompida/,
  );
  assert.equal(s.events.filter((e) => e.op === "key").length, 0);
});
