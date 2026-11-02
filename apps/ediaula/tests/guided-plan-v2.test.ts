import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameClock } from "../src/shared/frameClock.ts";
import { alignedAt, type GuidedLapse, takeNotices } from "../src/shared/guidedLapse.ts";
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

test("in the lesson window the hand leaves when the phrase starts and the take lasts as the voice", () => {
  const plan = webPlan(
    [
      // "Compare o que acontece": a phrase long enough for the whole move and rest.
      {
        id: "a",
        at: 33.11,
        speechAt: 32.16,
        speech: "Aponte",
        action: "point",
        target: on("Ligar"),
      },
      // A long phrase: the hand still leaves when it starts, then rests until the word.
      { id: "b", at: 41.31, speechAt: 37.5, speech: "Clique", action: "click", target: on("Zap") },
      // A phrase of one word: a quicker hand and a shorter rest, leaving only a little early.
      { id: "c", at: 43.2, speechAt: 43.0, speech: "Volte", action: "click", target: on("Voltar") },
    ],
    { audio: { path: "C:/voz.wav", duration: 45.5 } },
  );
  const s = schedulePlan(plan);
  assert.equal(s.lead, 0);
  assert.equal(narrationOffset(s), 0);
  const [a, b, c] = s.steps;
  for (const step of [a, b]) {
    assert.equal(step.moveAt, step.speechAt);
    assert.ok(step.arriveAt < step.actAt);
  }
  assert.ok(a.arriveAt - a.moveAt <= plan.tempos.move + 1e-9);
  assert.ok(Math.abs(b.arriveAt - (b.speechAt + plan.tempos.move)) < 1e-9);
  assert.ok(c.speechAt - c.moveAt <= 0.35 + 1e-9);
  assert.ok(c.arriveAt - c.moveAt >= 0.35 - 1e-9 && c.arriveAt < c.actAt);
  // The video ends with the voice, not `after` past it.
  assert.equal(s.duration, 45.5);
  // A phrase at the voice's very start: the video starts just early enough for the hand.
  const early = schedulePlan(
    webPlan([{ id: "a", at: 0.1, speechAt: 0, speech: "Já", action: "click", target: on("Ok") }]),
  );
  assert.ok(early.lead > 0 && early.lead < 1);
  assert.ok(Math.abs(early.steps[0].moveAt) < 1e-9);
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
  // The lesson window's video starts with the voice, early only by the quickest hand and rest
  // for the click on its very first second.
  assert.equal(s.lead, 0.5);
  assert.ok(dbl.moves && dbl.moveAt < dbl.arriveAt && dbl.arriveAt < dbl.actAt);
  // The drag moves for `move` seconds after its moment.
  assert.equal(drag.endAt, drag.actAt + plan.tempos.after + plan.tempos.move);
  // Three wheel steps take 0.24 s; a plan whose hand moves as a person's scrolls smoothly
  // (shared/humanMotion.ts scrollSeconds), and older plans keep their timing signature.
  assert.ok(Math.abs(scroll.endAt - (scroll.actAt + plan.tempos.after + 0.24)) < 1e-9);
  const human = { ...plan, tempos: { ...plan.tempos, motion: "crianca" as const } };
  const smooth = schedulePlan(human).steps[2];
  assert.ok(Math.abs(smooth.endAt - (smooth.actAt + plan.tempos.after + 0.35)) < 1e-9);
  assert.notEqual(planTiming(human), planTiming(plan));
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
  async function drive<T>(work: Promise<T>, onTick?: (ms: number) => void): Promise<T> {
    let settled = false;
    const done = work.finally(() => {
      settled = true;
    });
    // Keeps the rejection for the await below.
    done.catch(() => undefined);
    for (let i = 0; !settled && i < 400_000; i++) {
      now += 5;
      onTick?.(now);
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

test("a wait that cuts holds only past its own time, then the drag, scroll and shortcut follow", async () => {
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
        wait: { policy: "cut" },
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

test("a wait past its time is recorded and goes in sped up, the next action on its second", async () => {
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  page.slow.set("Pronto", 5000);
  const plan = webPlan([
    {
      id: "a",
      at: 0,
      speech: "Verifique",
      action: "click",
      target: on("Começar"),
      expect: { locator: locator("Pronto"), state: "visible" },
    },
    { id: "b", at: 4, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const schedule = schedulePlan(plan);
  const controller = new AbortController();
  const lapses: GuidedLapse[] = [];
  const acts: { t: number; step: number }[] = [];
  const log: GuidedRunLog = {
    step: () => undefined,
    act: (_kind, t, _until, step) => acts.push({ t, step }),
    lapse: (from, to, narration, step) => lapses.push({ from, to, narration, step }),
  };
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal, { log }),
  );
  // Nothing held: the page's five seconds are in the video.
  assert.equal(sim.frames.holds.filter((h) => h.reason === "wait").length, 0);
  assert.equal(lapses.length, 1);
  const [lapse] = lapses;
  const [a, b] = schedule.steps;
  assert.equal(lapse.step, 0);
  assert.ok(Math.abs(lapse.from - a.actAt) <= 1 / 30, `from ${lapse.from}`);
  assert.ok(Math.abs(lapse.to - lapse.from - 5) < 0.1, `lasted ${lapse.to - lapse.from}`);
  // Under the line it gets the time the narration had until the next step.
  assert.ok(Math.abs(lapse.narration - (b.moveAt - a.actAt)) < 0.1, `under ${lapse.narration}`);
  // The next click is on its second of the narration once the lapse is sped up.
  const click = page.events.filter((e) => e.op === "left-1")[1];
  assert.ok(Math.abs(alignedAt(lapses, click.t) - b.actAt) <= 1 / 30 + 0.01, `at ${click.t}`);
  // The log keeps every interaction on the video's seconds, as the cursor and the clicks are.
  assert.equal(acts.find((a) => a.step === 1)?.t, click.t);
  const shift = lapse.to - lapse.from - lapse.narration;
  assert.ok(Math.abs(sim.frames.time() - (schedule.duration + shift)) <= 0.05);
});

test("a click already done never goes in sped up: no action shows before its word", async () => {
  // The page scrolls each target into view first, on camera (two seconds of the video).
  const sim = simulation(30);
  const page = Object.assign(new FakePage(sim.frames, sim.sleep, points), {
    reveal: () => sim.sleep(2000),
  });
  // Three clicks on words close together ("clique em jogador, desça e clique em escolhido").
  const plan = webPlan([
    { id: "a", at: 0, speech: "Comece", action: "click", target: on("Começar") },
    { id: "b", at: 1, speech: "Clique", action: "click", target: on("Próxima") },
    { id: "c", at: 2, speech: "Escolha", action: "click", target: on("Nome") },
  ]);
  const schedule = schedulePlan(plan);
  const controller = new AbortController();
  const lapses: GuidedLapse[] = [];
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal, {
      log: {
        step: () => undefined,
        act: () => undefined,
        lapse: (from, to, narration, step) => lapses.push({ from, to, narration, step }),
      },
    }),
  );
  assert.ok(lapses.length > 0);
  const clicks = page.events.filter((e) => e.op === "left-1");
  assert.equal(clicks.length, 3);
  for (const [i, click] of clicks.entries()) {
    const at = alignedAt(lapses, click.t);
    const due = schedule.steps[i].actAt;
    // Never before its second of the narration; late only by what the page took.
    assert.ok(at >= due - 1 / 30 - 0.01, `click ${i + 1} at ${at}, due ${due}`);
    // No lapse covers a click (one may end right on it, to the millisecond it is written in).
    assert.ok(
      !lapses.some((l) => click.t > l.from + 0.01 && click.t < l.to - 0.01),
      `click ${i + 1}`,
    );
  }
});

test("steps closer than their actions run one after the other, the excess sped up", async () => {
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  const text = "a".repeat(50);
  const plan = webPlan([
    { id: "a", at: 0, speech: "Escreva", action: "type", value: text, target: on("Nome") },
    { id: "b", at: 3.5, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const schedule = schedulePlan(plan);
  const [a, b] = schedule.steps;
  assert.ok(b.overlap && b.overlap > 2, `overlap ${b.overlap}`);
  // The screen cannot speed anything up: there it is still refused.
  assert.throws(
    () =>
      schedulePlan(
        webPlan(
          plan.steps.map((s) => ({ ...s, target: { screen: screenTarget } })),
          { mode: "screen" },
        ),
      ),
    /muito próximas/,
  );
  const controller = new AbortController();
  const lapses: GuidedLapse[] = [];
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal, {
      log: {
        step: () => undefined,
        act: () => undefined,
        lapse: (from, to, narration, step) => lapses.push({ from, to, narration, step }),
      },
    }),
  );
  assert.equal(page.events.filter((e) => e.op.startsWith("text-")).length, 50);
  assert.equal(lapses.length, 1);
  assert.equal(lapses[0].step, 0);
  assert.ok(Math.abs(lapses[0].from - a.actAt) <= 1 / 30);
  // The typing's own click first, then the step's.
  const click = page.events.filter((e) => e.op === "left-1")[1];
  assert.ok(click);
  assert.ok(Math.abs(alignedAt(lapses, click.t) - b.actAt) <= 1 / 30 + 0.01, `at ${click.t}`);
  // "Verificar plano" says so on the step whose typing goes in sped up.
  const [notice] = takeNotices(plan, schedule, new Map([[1, { seconds: 2, room: 0.5 }]]));
  assert.equal(notice.index, 0);
  assert.equal(notice.notice, true);
  assert.match(notice.message, /etapa 2 começa 2,5 s antes de esta terminar: .*(tela sem voz)/);
  const waited = takeNotices(plan, schedule, new Map([[1, { seconds: 2, room: 0.5 }]]))[1];
  assert.match(waited.message, /levou 2 s .* dá 0,5 s: o resto entra acelerado/);
  const cut = takeNotices(
    { ...plan, steps: plan.steps.map((s) => ({ ...s, wait: { policy: "cut" as const } })) },
    schedule,
    new Map([[1, { seconds: 2, room: 0.5 }]]),
  )[1];
  assert.match(cut.message, /cortada do vídeo/);
});

test("a platform's action: its gestures in order, the first on the phrase, the rest by the hand", async () => {
  const sim = simulation(30);
  class BridgePage extends FakePage {
    asked: string[] = [];
    idles = 0;
    async platform(action: string, id: string) {
      this.asked.push(action);
      return [
        { id: `${id}-1`, speech: "", at: 0, action: "click" as const, target: on("Começar") },
        { id: `${id}-2`, speech: "", at: 0, action: "click" as const, target: on("Próxima") },
      ];
    }
    async idle() {
      this.idles++;
    }
  }
  const page = new BridgePage(sim.frames, sim.sleep, points);
  const plan = webPlan([
    { id: "a", at: 2, speech: "Olha aqui", action: "platform", platform: "ampliar jogo" },
    { id: "b", at: 9, speech: "Agora", action: "click", target: on("Nome") },
  ]);
  const schedule = schedulePlan(plan);
  const [a, b] = schedule.steps;
  // The platform's action is scheduled as one that moves: the hand leaves before the phrase.
  assert.equal(a.moves, true);
  assert.ok(a.moveAt < a.actAt);
  const controller = new AbortController();
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal),
  );
  assert.deepEqual(page.asked, ["ampliar jogo"]);
  assert.equal(page.idles, 1);
  const clicks = page.events.filter((e) => e.op === "left-1");
  assert.deepEqual(
    clicks.map((c) => [c.x, c.y]),
    [
      [300, 200],
      [900, 600],
      [500, 500],
    ],
  );
  assert.equal(clicks[0].t, a.actAt);
  // The second gesture comes after the first one's look and the hand's move and hover.
  const { move, dwell } = plan.tempos;
  assert.ok(clicks[1].t >= a.actAt + 0.4 + 0.25 + move + dwell - 1 / 30, `at ${clicks[1].t}`);
  assert.equal(clicks[2].t, b.actAt);
  // On the screen, or without a bridge, it says where it works.
  await assert.rejects(
    runGuided(
      plan,
      new FakePage(null, sim.sleep, points),
      instantClock(controller.signal),
      controller.signal,
    ),
    /janela da aula/,
  );
});

test("a platform's action that continues: the page is asked again after the gestures before it", async () => {
  const sim = simulation(30);
  class BridgePage extends FakePage {
    asked: string[] = [];
    async platform(action: string, id: string) {
      this.asked.push(action);
      // A field is clicked first; what it opened says how to choose (a list or a text box).
      return action === "trocar campo"
        ? [
            { id: `${id}-1`, speech: "", at: 0, action: "click" as const, target: on("Começar") },
            { id: `${id}-2`, speech: "", at: 0, action: "platform" as const, platform: "escolher" },
          ]
        : [
            {
              id: `${id}-1`,
              speech: "",
              at: 0,
              action: "click" as const,
              target: on("Próxima"),
              timeout: 180,
            },
          ];
    }
    idles: number[] = [];
    async idle(timeout: number) {
      this.idles.push(timeout);
    }
  }
  const page = new BridgePage(sim.frames, sim.sleep, points);
  const plan = webPlan([
    { id: "a", at: 2, speech: "Troque", action: "platform", platform: "trocar campo" },
  ]);
  const controller = new AbortController();
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal),
  );
  assert.deepEqual(page.asked, ["trocar campo", "escolher"]);
  // A gesture that waits long (the check on the server) waits that long for the busy page too.
  assert.deepEqual(page.idles, [8, 180]);
  assert.deepEqual(
    page.events.filter((e) => e.op === "left-1").map((c) => [c.x, c.y]),
    [
      [300, 200],
      [900, 600],
    ],
  );
});

test("replacing a field's text selects all of it before typing", async () => {
  const sim = simulation(30);
  const page = new FakePage(sim.frames, sim.sleep, points);
  const plan = webPlan([
    {
      id: "a",
      at: 0,
      speech: "Troque",
      action: "type",
      value: "0",
      replace: true,
      target: on("Nome"),
    },
  ]);
  const controller = new AbortController();
  sim.frames.start();
  await sim.drive(
    runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal),
  );
  assert.deepEqual(
    page.events.map((e) => e.op).filter((op) => !op.startsWith("locate") && op !== "glide"),
    ["left-1", "key-Ctrl+A", "text-0"],
  );
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
  // Stopped while the run waits for the first phrase (the fake hand's glide ignores the signal).
  const plan = webPlan([
    { id: "a", at: 2, speech: "Comece", action: "click", target: on("Começar") },
    { id: "b", at: 30, speech: "Avance", action: "click", target: on("Próxima") },
  ]);
  const controller = new AbortController();
  sim.frames.start();
  const run = runGuided(plan, page, videoClock(sim.frames, controller.signal), controller.signal);
  await assert.rejects(
    sim.drive(run, (ms) => {
      if (ms === 20) controller.abort();
    }),
    /interrompida/,
  );
  assert.equal(page.events.filter((e) => e.op === "left-1").length <= 1, true);

  const moved = structuredClone(plan);
  moved.steps[1].target = on("Outro");
  assert.equal(planTiming(moved), planTiming(plan));
  moved.steps[1].at = 31;
  assert.notEqual(planTiming(moved), planTiming(plan));
  assert.notEqual(planTiming({ ...plan, tempos: { ...plan.tempos, after: 2 } }), planTiming(plan));
});

test("a drag stopped or failing midway always lets the button go", async () => {
  const plan = webPlan([
    {
      id: "a",
      at: 0,
      speech: "Arraste",
      action: "drag",
      target: on("Nome"),
      to: { target: on("Próxima") },
    },
  ]);
  for (const ending of ["abort", "fail"] as const) {
    const controller = new AbortController();
    const page = new FakePage(null, async () => undefined, points);
    page.glide = async (_from, to, _duration, drag) => {
      page.events.push({ t: -1, op: drag ? "drag" : "glide", ...to });
      if (!drag) {
        page.pointer = to;
        return;
      }
      page.pointer = { x: 700, y: 550 };
      if (ending === "abort") controller.abort();
      throw new Error(ending === "abort" ? "Automação interrompida." : "O cursor travou.");
    };
    await assert.rejects(
      runGuided(plan, page, instantClock(controller.signal), controller.signal),
      ending === "abort" ? /interrompida/ : /travou/,
    );
    const ops = page.events.map((e) => e.op).filter((op) => !op.startsWith("locate"));
    assert.deepEqual(ops, ["glide", "press", "drag", "release"], ending);
    // Let go where the pointer stopped, not at the drop.
    assert.deepEqual(
      page.events.filter((e) => e.op === "release").map((e) => [e.x, e.y]),
      [[700, 550]],
    );
  }
});

test("a release that fails after a broken drag is reported with the first error", async () => {
  const plan = webPlan([
    {
      id: "a",
      at: 0,
      speech: "Arraste",
      action: "drag",
      target: on("Nome"),
      to: { target: on("Próxima") },
    },
  ]);
  const controller = new AbortController();
  const page = new FakePage(null, async () => undefined, points);
  page.glide = async (_from, to, _duration, drag) => {
    if (drag) throw new Error("O cursor travou.");
    page.pointer = to;
  };
  page.release = async () => {
    throw new Error("Sem resposta.");
  };
  await assert.rejects(
    runGuided(plan, page, instantClock(controller.signal), controller.signal),
    /O cursor travou\. O botão do mouse pode ter ficado pressionado: Sem resposta\./,
  );
});
