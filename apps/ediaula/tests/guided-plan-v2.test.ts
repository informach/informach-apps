import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameClock } from "../src/shared/frameClock.ts";
import {
  type GuidedCondition,
  type GuidedPlanV2,
  type GuidedStepV2,
  guidedPlanSchema,
  guidedStoreSchema,
  migratePlan,
  narrationOffset,
  normalizePlan,
  parseChord,
  planTiming,
  schedulePlan,
  stepsBefore,
} from "../src/shared/guidedPlan.ts";
import {
  GUIDED_DEFAULTS,
  type GuidedPlan,
  type GuidedTarget,
  scheduleGuided,
} from "../src/shared/guidedRecording.ts";
import {
  FailureStreak,
  type GuidedDriver,
  type GuidedRunLog,
  instantClock,
  runGuided,
  videoClock,
} from "../src/shared/guidedRunner.ts";
import type { Locator, Point } from "../src/shared/locators.ts";

const locator = (text: string, url = "http://127.0.0.1:8000/aula"): Locator => ({
  strategies: [{ by: "text", value: text }],
  url,
  point: { u: 0.5, v: 0.5 },
  fingerprint: {
    tag: "button",
    text,
    rect: { x: 0, y: 0, width: 80, height: 30 },
    view: { width: 1920, height: 1080 },
    cursor: "pointer",
  },
});
const on = (text: string) => ({ locator: locator(text) });

const webPlan = (steps: GuidedStepV2[], patch: Partial<GuidedPlanV2> = {}): GuidedPlanV2 => ({
  version: 2,
  id: "plano-1",
  name: "Blocos",
  mode: "web",
  url: "http://127.0.0.1:8000/aula",
  viewport: { width: 1920, height: 1080 },
  fps: 30,
  steps,
  tempos: { ...GUIDED_DEFAULTS },
  ...patch,
});

const screenTarget: GuidedTarget = {
  x: 500,
  y: 300,
  window: "123",
  title: "Aula",
  left: 0,
  top: 0,
  width: 1920,
  height: 1080,
  browser: {
    selector: "main > button:nth-of-type(2)",
    url: "https://plataforma.example/aula?x=1",
    kind: "element",
    u: 0.5,
    v: 0.5,
    label: "Próxima",
  },
};
const v1: GuidedPlan = {
  ...GUIDED_DEFAULTS,
  steps: [
    { id: "1", at: 0, speech: "Clique aqui", action: "click", target: screenTarget },
    {
      id: "2",
      at: 5,
      speechAt: 4,
      speech: "Tecle",
      action: "key",
      value: "Enter",
      target: screenTarget,
    },
    { id: "3", at: 10, speech: "Digite", action: "type", value: "oi", target: screenTarget },
  ],
};

test("a version 1 plan migrates to a screen plan with the same schedule", () => {
  const plan = migratePlan(v1, "p1", "Antigo");
  assert.equal(plan.version, 2);
  assert.equal(plan.mode, "screen");
  assert.equal(plan.url, "https://plataforma.example/aula?x=1");
  assert.deepEqual(plan.tempos, { ...GUIDED_DEFAULTS });
  assert.equal(plan.steps[1].chord, "Enter");
  assert.equal(plan.steps[1].value, undefined);
  assert.equal(plan.steps[2].value, "oi");
  // The marked element keeps its text and selector; the structural path never stands alone.
  assert.deepEqual(
    plan.steps[0].target?.locator?.strategies.map((s) => s.by),
    ["text", "css"],
  );
  assert.equal(plan.steps[0].target?.screen?.window, "123");
  const before = scheduleGuided(v1);
  const after = schedulePlan(plan);
  assert.equal(after.lead, before.lead);
  assert.equal(after.duration, before.duration);
  after.steps.forEach((s, i) => {
    for (const key of ["moveAt", "arriveAt", "speechAt", "actAt", "endAt"] as const)
      assert.equal(s[key], before.steps[i][key], `${key} of step ${i + 1}`);
  });
  // Read through the schema, a stored version 1 plan comes back as version 2.
  const parsed = guidedPlanSchema.parse(JSON.parse(JSON.stringify(v1)));
  assert.equal((parsed as GuidedPlanV2).version, 2);
  assert.equal(normalizePlan({ steps: "não" }), null);
  const store = guidedStoreSchema.parse({ plans: [v1, plan], runs: [] });
  assert.equal(store.plans.length, 2);
});

test("the schedule of drags, scrolls, waits, double clicks and shortcuts", () => {
  const until: GuidedCondition = { locator: locator("Pronto"), state: "visible" };
  const plan = webPlan([
    { id: "a", at: 0, speech: "Abra", action: "doubleClick", target: on("Arquivo") },
    {
      id: "b",
      at: 5,
      speech: "Arraste",
      action: "drag",
      target: {
        locator: {
          ...locator("mover passos"),
          strategies: [{ by: "blockly", text: "mover passos", area: "flyout" }],
        },
      },
      to: { point: { x: 100, y: 80, space: "workspace" } },
    },
    { id: "c", at: 10, speech: "Role", action: "scroll", delta: { x: 0, y: 300 } },
    { id: "d", at: 14, speech: "Espere", action: "wait", until },
    { id: "e", at: 16, speech: "Desfaça", action: "key", chord: "Ctrl+Shift+Z" },
  ]);
  const s = schedulePlan(plan);
  const [dbl, drag, scroll, wait, key] = s.steps;
  assert.equal(s.lead, 2.5);
  assert.ok(dbl.moves && dbl.moveAt < dbl.arriveAt && dbl.arriveAt < dbl.actAt);
  // The drag moves for `move` seconds after its moment; three wheel steps take 0.24 s.
  assert.equal(drag.endAt, drag.actAt + plan.tempos.after + plan.tempos.move);
  assert.ok(Math.abs(scroll.endAt - (scroll.actAt + plan.tempos.after + 0.24)) < 1e-9);
  // Without a target nothing moves: the step starts at its own moment.
  for (const step of [scroll, wait, key]) {
    assert.equal(step.moves, false);
    assert.equal(step.moveAt, step.actAt);
  }
  assert.equal(s.duration, key.endAt);

  const broken =
    (step: Partial<GuidedStepV2>, mode: GuidedPlanV2["mode"] = "web") =>
    () =>
      schedulePlan(
        webPlan([{ id: "x", at: 0, speech: "", action: "click", target: on("Ok"), ...step }], {
          mode,
        }),
      );
  assert.throws(broken({ action: "drag" }), /arrasto termina/);
  assert.throws(broken({ action: "wait", target: undefined }), /elemento a esperar/);
  assert.throws(broken({ action: "scroll", target: undefined }), /quanto rolar/);
  assert.throws(broken({ action: "key", chord: "Ctrl+" }), /tecla/);
  assert.throws(broken({ target: undefined }), /Marque o alvo/);
  assert.throws(
    broken({ target: { screen: screenTarget }, expect: until }, "screen"),
    /janela da aula/,
  );
  assert.throws(broken({ timeout: 500 }), /tempo máximo/);
  assert.throws(() => schedulePlan(webPlan(plan.steps, { url: "file:///c:/aula.html" })), /http/);
  assert.throws(() =>
    schedulePlan(webPlan(plan.steps, { viewport: { width: 1921, height: 1080 } })),
  );
});

test("shortcuts become the page's key events and the editor's label", () => {
  const undo = parseChord("ctrl + shift + z");
  assert.ok(undo);
  assert.equal(undo.key, "Z");
  assert.equal(undo.code, "KeyZ");
  assert.equal(undo.vk, 90);
  assert.equal(undo.modifiers, 2 | 8);
  assert.equal(undo.text, undefined);
  assert.equal(undo.label, "Ctrl+Shift+Z");
  const enter = parseChord("Enter");
  assert.deepEqual([enter?.key, enter?.vk, enter?.text, enter?.modifiers], ["Enter", 13, "\r", 0]);
  assert.equal(parseChord("Alt+ArrowLeft")?.label, "Alt+←");
  assert.equal(parseChord("F5")?.vk, 116);
  assert.equal(parseChord("a")?.text, "a");
  assert.equal(parseChord("Shift+a")?.key, "A");
  assert.equal(parseChord("Shift+a")?.label, "A");
  assert.equal(parseChord("Shift+Tab")?.label, "Shift+Tab");
  assert.equal(parseChord("shift+enter")?.label, "Shift+Enter");
  assert.equal(parseChord("Tab")?.label, "Tab");
  assert.equal(parseChord("Win+D")?.modifiers, 4);
  for (const bad of ["", "Ctrl+", "Ctrl+Ctrl+A", "Foo", "Ctrl+Shift", "F25"])
    assert.equal(parseChord(bad), null, bad);
});

/** Wall clock, timers and the frame writer of a simulated take. */
function simulation(fps = 30) {
  let now = 0;
  const timers: { at: number; resolve: () => void }[] = [];
  const frames = new FrameClock(fps, () => now);
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => timers.push({ at: now + ms, resolve }));
  /** Runs the wall clock in 5 ms steps until `work` settles. */
  async function drive<T>(work: Promise<T>): Promise<T> {
    let settled = false;
    const done = work.finally(() => {
      settled = true;
    });
    // Keeps the rejection for the await below.
    done.catch(() => undefined);
    for (let i = 0; !settled && i < 400_000; i++) {
      now += 5;
      for (const t of timers.filter((x) => x.at <= now)) {
        timers.splice(timers.indexOf(t), 1);
        t.resolve();
      }
      const n = frames.tick();
      for (let k = 0; k < n; k++) frames.frame();
      await new Promise((r) => setImmediate(r));
    }
    return done;
  }
  return { frames, sleep, drive, now: () => now };
}

/** A lesson page: every target has a point, some take a while to show up. */
class FakePage implements GuidedDriver {
  readonly space = "page";
  readonly events: { t: number; op: string; x?: number; y?: number; step?: string }[] = [];
  pointer: Point = { x: 0, y: 0 };
  readonly slow = new Map<string, number>();
  /** Where a target is by the time it is looked up again just before the action. */
  readonly moved = new Map<string, Point>();
  /** Milliseconds of every lookup just before the action (a few protocol round trips). */
  lookup = 0;
  private readonly clock: FrameClock | null;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly points: Record<string, Point>;
  constructor(
    clock: FrameClock | null,
    sleep: (ms: number) => Promise<void>,
    points: Record<string, Point>,
  ) {
    this.clock = clock;
    this.sleep = sleep;
    this.points = points;
  }
  private time = (): number => this.clock?.time() ?? -1;
  async sample() {
    return this.pointer;
  }
  async locate(target: { locator?: Locator }, phase: "approach" | "act") {
    const name = target.locator?.fingerprint.text ?? "";
    const delay = phase === "approach" ? (this.slow.get(name) ?? 0) : this.lookup;
    if (delay) await this.sleep(delay);
    this.events.push({ t: this.time(), op: `locate-${phase}`, step: name });
    const point = (phase === "act" && this.moved.get(name)) || this.points[name];
    if (!point) throw new Error(`Não encontrei "${name}" na página.`);
    return point;
  }
  async destination(step: GuidedStepV2) {
    const p = step.to?.point;
    return p ? { x: p.x, y: p.y } : this.points[step.to?.target?.locator?.fingerprint.text ?? ""];
  }
  glide(from: Point, to: Point, duration: number, drag?: boolean): Promise<void> {
    this.events.push({ t: this.time(), op: drag ? "drag" : "glide", ...to });
    const clock = this.clock;
    if (!clock || duration <= 0) {
      this.pointer = to;
      return Promise.resolve();
    }
    const t0 = clock.time();
    return new Promise((resolve) => {
      const off = clock.onFrame((t) => {
        const u = Math.min(1, (t - t0) / duration);
        this.pointer = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
        if (u < 1) return false;
        off();
        resolve();
        return true;
      });
    });
  }
  async ready() {}
  async click(p: Point, button: string, count: number) {
    this.events.push({ t: this.time(), op: `${button}-${count}`, ...p });
  }
  async press(p: Point) {
    this.events.push({ t: this.time(), op: "press", ...p });
  }
  async release(p: Point) {
    this.events.push({ t: this.time(), op: "release", ...p });
  }
  async wheel(p: Point, _dx: number, dy: number) {
    this.events.push({ t: this.time(), op: `wheel-${dy}`, ...p });
  }
  async key(chord: { label: string }) {
    this.events.push({ t: this.time(), op: `key-${chord.label}` });
  }
  async text(char: string) {
    this.events.push({ t: this.time(), op: `text-${char}` });
  }
  async check() {
    return true;
  }
  async until(condition: GuidedCondition) {
    const delay = this.slow.get(condition.locator.fingerprint.text) ?? 0;
    if (delay) await this.sleep(delay);
    this.events.push({ t: this.time(), op: "until" });
  }
}

const points = {
  Começar: { x: 300, y: 200 },
  Próxima: { x: 900, y: 600 },
  Pronto: { x: 0, y: 0 },
  Nome: { x: 500, y: 500 },
};

test("on the video's clock a late target holds the writer and the click stays on its second", async () => {
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  page.slow.set("Próxima", 1500);
  const plan = webPlan([
    { id: "a", at: 0, speech: "Comece", action: "click", target: on("Começar") },
    { id: "b", at: 4, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const schedule = schedulePlan(plan);
  const controller = new AbortController();
  const clock = videoClock(sim.frames, controller.signal);
  const steps: string[] = [];
  const log: GuidedRunLog = {
    step: (index, status) => steps.push(`${index}:${status}`),
    act: () => undefined,
  };
  sim.frames.start();
  await sim.drive(runGuided(plan, page, clock, controller.signal, { log }));
  const clicks = page.events.filter((e) => e.op === "left-1");
  assert.deepEqual(
    clicks.map((c) => c.t),
    schedule.steps.map((s) => s.actAt),
  );
  assert.deepEqual(
    clicks.map((c) => [c.x, c.y]),
    [
      [300, 200],
      [900, 600],
    ],
  );
  // The writer held at the moment the movement had to start, for the rest of the lookup.
  assert.equal(sim.frames.holds.length, 1);
  const [hold] = sim.frames.holds;
  assert.equal(hold.reason, "locate");
  assert.equal(hold.step, 1);
  assert.ok(Math.abs(hold.at - schedule.steps[1].moveAt) < 1e-9);
  assert.ok(hold.duration > 1 && hold.duration < 1.5, `held ${hold.duration}`);
  // The video lasts what the schedule says, whatever the holds.
  assert.ok(Math.abs(sim.frames.time() - schedule.duration) <= 1 / 30);
  assert.deepEqual(steps, ["0:start", "0:done", "1:start", "1:done"]);
});

test("a wait holds only past its own time, then the drag, scroll and shortcut follow", async () => {
  const sim = simulation(60);
  const page = new FakePage(sim.frames, sim.sleep, points);
  page.slow.set("Pronto", 3000);
  const plan = webPlan(
    [
      { id: "a", at: 0, speech: "Abra", action: "doubleClick", target: on("Começar") },
      {
        id: "b",
        at: 4,
        speech: "Arraste",
        action: "drag",
        target: on("Nome"),
        to: { target: on("Próxima") },
      },
      { id: "c", at: 9, speech: "Role", action: "scroll", delta: { x: 0, y: 250 } },
      {
        id: "d",
        at: 12,
        speech: "Espere",
        action: "wait",
        until: { locator: locator("Pronto"), state: "visible" },
      },
      { id: "e", at: 15, speech: "Desfaça", action: "key", chord: "Ctrl+Z" },
    ],
    { fps: 60 },
  );
  const schedule = schedulePlan(plan);
  const controller = new AbortController();
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal),
  );
  const ops = page.events.map((e) => e.op).filter((op) => !op.startsWith("locate"));
  assert.deepEqual(ops, [
    "glide",
    "left-2",
    "glide",
    "press",
    "drag",
    "release",
    "wheel-83.33333333333333",
    "wheel-83.33333333333333",
    "wheel-83.33333333333333",
    "until",
    "key-Ctrl+Z",
  ]);
  const at = (op: string) => page.events.find((e) => e.op === op)?.t;
  assert.equal(at("press"), schedule.steps[1].actAt);
  assert.deepEqual(
    page.events.filter((e) => e.op === "release").map((e) => [e.x, e.y]),
    [[900, 600]],
  );
  // The wait had `after` seconds of its own (1.5 s): it held for the other 1.5 s.
  const wait = sim.frames.holds.find((h) => h.reason === "wait");
  assert.ok(wait);
  assert.ok(Math.abs(wait.at - schedule.steps[3].endAt) < 1e-9);
  assert.ok(Math.abs(wait.duration - 1.5) < 0.05, `held ${wait.duration}`);
  assert.equal(at("key-Ctrl+Z"), schedule.steps[4].actAt);
});

test("a target the page moved before the click is followed, and the take goes on", async () => {
  // The reviewer's case: the video held at the click while the correction waited on the video.
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  page.lookup = 30;
  page.moved.set("Começar", { x: 300, y: 240 });
  const plan = webPlan([
    { id: "a", at: 2, speech: "Clique", action: "click", target: on("Começar") },
    { id: "b", at: 6, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const schedule = schedulePlan(plan);
  const controller = new AbortController();
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal),
  );
  const clicks = page.events.filter((e) => e.op === "left-1");
  assert.deepEqual(
    clicks.map((c) => [c.x, c.y]),
    [
      [300, 240],
      [900, 600],
    ],
  );
  assert.deepEqual(
    clicks.map((c) => c.t),
    schedule.steps.map((s) => s.actAt),
  );
  // The pointer went where the button is now before the click, and the video never stuck there.
  const before = page.events.filter((e) => e.op === "glide" && e.t <= clicks[0].t).at(-1);
  assert.deepEqual([before?.x, before?.y], [300, 240]);
  assert.ok(Math.abs(sim.frames.time() - schedule.duration) <= 1 / 30);
  assert.ok(sim.frames.holds.every((h) => h.duration < 0.2));
});

test("checking the plan goes past a failing step, and stops after three in a row", async () => {
  const streak = new FailureStreak(3);
  streak.start(0);
  assert.equal(streak.fail(0), true);
  streak.start(1);
  streak.start(2);
  assert.equal(streak.fail(2), true, "a step that worked ends the streak");
  streak.start(3);
  assert.equal(streak.fail(3), true);
  streak.start(4);
  assert.equal(streak.fail(4), false);

  const plan = webPlan([
    { id: "a", at: 0, speech: "Comece", action: "click", target: on("Falta 1") },
    { id: "b", at: 5, speech: "Comece", action: "click", target: on("Começar") },
    { id: "c", at: 10, speech: "Siga", action: "click", target: on("Falta 2") },
    { id: "d", at: 15, speech: "Siga", action: "click", target: on("Falta 3") },
    { id: "e", at: 20, speech: "Siga", action: "click", target: on("Falta 4") },
    { id: "f", at: 25, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const page = new FakePage(null, async () => undefined, points);
  const controller = new AbortController();
  const checked = new FailureStreak(3);
  const failed: number[] = [];
  await runGuided(
    plan,
    page,
    { ...instantClock(controller.signal), step: (index) => checked.start(index) },
    controller.signal,
    {
      onFailure: async (index) => {
        failed.push(index);
        return checked.fail(index);
      },
    },
  );
  assert.deepEqual(failed, [0, 2, 3, 4]);
  // Step 2 was done; the last step is never reached.
  assert.deepEqual(
    page.events.filter((e) => e.op === "left-1").map((e) => [e.x, e.y]),
    [[300, 200]],
  );
});

test("continuing from a step replays the earlier ones untimed, then times the take from it", async () => {
  const plan = webPlan([
    { id: "a", at: 0, speech: "Comece", action: "click", target: on("Começar") },
    { id: "b", at: 5, speech: "Digite", action: "type", value: "Ana", target: on("Nome") },
    { id: "c", at: 12, speechAt: 10, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const full = schedulePlan(plan);
  const resumed = schedulePlan(plan, 2);
  assert.equal(resumed.base, 10);
  assert.equal(resumed.steps.length, 1);
  assert.equal(resumed.steps[0].index, 2);
  // The phrase of step 3 is the take's narration second 0, after the same lead.
  assert.equal(resumed.steps[0].speechAt, resumed.lead);
  assert.equal(resumed.steps[0].actAt - resumed.steps[0].speechAt, 2);
  assert.equal(narrationOffset(resumed), resumed.lead - 10);
  assert.equal(narrationOffset(full), full.lead);
  assert.deepEqual(
    stepsBefore(plan, 2).map((s) => s.id),
    ["a", "b"],
  );
  assert.throws(() => schedulePlan(plan, 3), /inicial/);

  // The preparation: no clock, no pauses between actions, only the order.
  const prep = new FakePage(null, async () => undefined, points);
  const controller = new AbortController();
  await runGuided(plan, prep, instantClock(controller.signal), controller.signal, { to: 2 });
  assert.deepEqual(
    prep.events.map((e) => e.op).filter((op) => !op.startsWith("locate")),
    ["glide", "left-1", "glide", "left-1", "text-A", "text-n", "text-a"],
  );
  // Then the take from step 3.
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal, {
      from: 2,
    }),
  );
  assert.deepEqual(
    page.events.filter((e) => e.op === "left-1").map((e) => e.t),
    [resumed.steps[0].actAt],
  );
  assert.ok(Math.abs(sim.frames.time() - resumed.duration) <= 1 / 30);
});

test("stopping the take rejects at once; the timing signature ignores targets", async () => {
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  const plan = webPlan([
    { id: "a", at: 0, speech: "Comece", action: "click", target: on("Começar") },
    { id: "b", at: 30, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const controller = new AbortController();
  sim.frames.start();
  const run = runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal);
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(sim.drive(run), /interrompida/);
  assert.equal(page.events.filter((e) => e.op === "left-1").length <= 1, true);

  const moved = structuredClone(plan);
  moved.steps[1].target = on("Outro");
  assert.equal(planTiming(moved), planTiming(plan));
  moved.steps[1].at = 31;
  assert.notEqual(planTiming(moved), planTiming(plan));
  assert.notEqual(planTiming({ ...plan, tempos: { ...plan.tempos, after: 2 } }), planTiming(plan));
});
