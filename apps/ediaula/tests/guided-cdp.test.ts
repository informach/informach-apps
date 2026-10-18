import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebContents } from "electron";
import { CdpDriver, CdpTimeout, WebDriver } from "../src/main/guidedCdp.ts";
import { FrameClock } from "../src/shared/frameClock.ts";
import type { GuidedLogLine } from "../src/shared/guidedCursor.ts";
import type { GuidedCondition } from "../src/shared/guidedPlan.ts";
import type { Locator, Point } from "../src/shared/locators.ts";

/**
 * The lesson page's protocol without a window: a webContents whose debugger answers what the
 * test says, and records every command.
 */
function fakeContents(answer: (method: string, params?: Record<string, unknown>) => unknown) {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const sent: { method: string; params?: Record<string, unknown> }[] = [];
  const state = { url: "http://127.0.0.1:8000/aula", waiting: false };
  const wc = {
    isDestroyed: () => false,
    getURL: () => state.url,
    isWaitingForResponse: () => state.waiting,
    debugger: {
      isAttached: () => true,
      attach: () => undefined,
      detach: () => undefined,
      on: (event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      },
      off: () => undefined,
      sendCommand: async (method: string, params?: Record<string, unknown>) => {
        sent.push({ method, params });
        return answer(method, params);
      },
    },
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of handlers.get(event) ?? []) fn({}, ...args);
  };
  return { wc, sent, state, emit };
}

const locator = (url = "http://127.0.0.1:8000/aula"): Locator => ({
  strategies: [{ by: "text", value: "Pronto" }],
  url,
  point: { u: 0.5, v: 0.5 },
  fingerprint: {
    tag: "p",
    text: "Pronto",
    rect: { x: 0, y: 0, width: 80, height: 30 },
    view: { width: 1280, height: 720 },
    cursor: "auto",
  },
});

test("a command the page does not answer gives up in time instead of hanging the step", async () => {
  const page = fakeContents(() => new Promise(() => undefined));
  // The fake has what CdpDriver uses of a webContents.
  const cdp = new CdpDriver(page.wc as unknown as WebContents);
  await assert.rejects(cdp.send("Runtime.evaluate", {}, 30), CdpTimeout);
  await assert.rejects(cdp.send("Runtime.evaluate", {}, 30), /não respondeu a tempo/);
});

test("a question the page asks is refused and reported; a message is accepted", async () => {
  const page = fakeContents(() => ({}));
  const cdp = new CdpDriver(page.wc as unknown as WebContents);
  await cdp.attach();
  page.emit("message", "Page.javascriptDialogOpening", { type: "alert", message: "Salvo" });
  assert.equal(cdp.takeDialog(), null);
  page.emit("message", "Page.javascriptDialogOpening", {
    type: "confirm",
    message: "Apagar tudo?",
  });
  assert.match(cdp.takeDialog() ?? "", /pergunta \(“Apagar tudo\?”\) e o EdiAula a recusou/);
  assert.equal(cdp.takeDialog(), null, "reported once");
  assert.deepEqual(
    page.sent.filter((s) => s.method === "Page.handleJavaScriptDialog").map((s) => s.params),
    [{ accept: true }, { accept: false }],
  );
  // Closing the developer tools' hold on the window ends the automation with a clear message.
  page.emit("detach", "devtools");
  assert.match(cdp.detachedError?.message ?? "", /ferramentas de desenvolvedor/);
  await assert.rejects(cdp.send("Page.enable"), /ferramentas de desenvolvedor/);
});

test("while the next page loads nothing holds yet, not even “hidden”", async () => {
  const page = fakeContents(() => ({}));
  const cdp = new CdpDriver(page.wc as unknown as WebContents);
  const hidden: GuidedCondition = {
    locator: locator("http://127.0.0.1:8000/fim"),
    state: "hidden",
  };
  page.state.waiting = true;
  assert.equal(await cdp.check(hidden), false);
  // Another page came and it is not the one with the element: the element is indeed hidden.
  page.state.waiting = false;
  assert.equal(await cdp.check(hidden), true);
  assert.equal(await cdp.check({ ...hidden, state: "visible" }), false);
});

/** What WebDriver uses of CdpDriver, answering as a test needs. */
function fakeCdp(find: () => Promise<unknown>) {
  const sent: string[] = [];
  const cdp = {
    detachedError: null as Error | null,
    dialog: null as string | null,
    takeDialog() {
      const d = this.dialog;
      this.dialog = null;
      return d;
    },
    find,
    check: async () => {
      throw new CdpTimeout("Runtime.evaluate");
    },
    async mouse(type: string, p: { x: number; y: number }, o: { clickCount?: number } = {}) {
      sent.push(`${type}@${p.x},${p.y}#${o.clickCount ?? 0}`);
    },
    async typed(char: string, code = "", vk = 0, modifiers = 0) {
      sent.push(`typed:${char}:${code}:${vk}:${modifiers}`);
    },
    async chord(chord: { key: string; text?: string }) {
      sent.push(`chord:${chord.key}:${JSON.stringify(chord.text ?? "")}`);
    },
    cursorAt: async () => ({ cursor: "default", editable: false }),
    blocklyCanvas: async () => null,
  };
  return { cdp, sent };
}

const viewport = { width: 1280, height: 720 };

test("a page busy for a moment is waited for; only the protocol going away ends the step", async () => {
  let calls = 0;
  const point = { x: 10, y: 20 };
  const busy = fakeCdp(async () => {
    calls++;
    if (calls < 3) throw new CdpTimeout("Runtime.callFunctionOn");
    return { ok: true, point, candidate: {}, canvas: null };
  });
  const controller = new AbortController();
  const driver = new WebDriver(busy.cdp as unknown as CdpDriver, {
    viewport,
    signal: controller.signal,
  });
  assert.deepEqual(await driver.locate({ locator: locator() }, "act", 5), point);
  assert.equal(calls, 3);
  // Past the deadline the message says the page did not answer.
  const never = fakeCdp(async () => {
    throw new CdpTimeout("Runtime.callFunctionOn");
  });
  const late = new WebDriver(never.cdp as unknown as CdpDriver, {
    viewport,
    signal: controller.signal,
  });
  await assert.rejects(late.locate({ locator: locator() }, "act", 0.25), /não respondeu a tempo/);
  // The protocol going away ends it at once.
  const gone = new Error("A automação da janela da aula foi desligada (target closed).");
  const detached = fakeCdp(async () => {
    throw gone;
  });
  detached.cdp.detachedError = gone;
  const driverGone = new WebDriver(detached.cdp as unknown as CdpDriver, {
    viewport,
    signal: controller.signal,
  });
  const started = Date.now();
  await assert.rejects(driverGone.locate({ locator: locator() }, "act", 30), /desligada/);
  assert.ok(Date.now() - started < 1000);
  // So does a question the page asked.
  const asked = fakeCdp(async () => ({ ok: false, message: "ainda não", navigating: false }));
  asked.cdp.dialog = "A página abriu uma pergunta";
  const driverAsked = new WebDriver(asked.cdp as unknown as CdpDriver, {
    viewport,
    signal: controller.signal,
  });
  await assert.rejects(driverAsked.locate({ locator: locator() }, "act", 30), /pergunta/);
  // A check that times out is "not yet", not a failure.
  assert.equal(await driver.check({ locator: locator(), state: "visible" }), false);
});

test("typing sends a key down and up per character; a double click is two clicks", async () => {
  const { cdp, sent } = fakeCdp(async () => ({ ok: false, message: "", navigating: false }));
  const controller = new AbortController();
  const driver = new WebDriver(cdp as unknown as CdpDriver, {
    viewport,
    signal: controller.signal,
  });
  for (const char of "Aa 1") await driver.text(char);
  assert.deepEqual(sent, ["typed:A:KeyA:65:8", "typed:a:KeyA:65:0", 'chord: :" "', 'chord:1:"1"']);
  sent.length = 0;
  await driver.click({ x: 5, y: 6 }, "left", 2);
  assert.deepEqual(sent, [
    "mousePressed@5,6#1",
    "mouseReleased@5,6#1",
    "mousePressed@5,6#2",
    "mouseReleased@5,6#2",
  ]);
});

test("in a drag every frame shows the block where the drawn hand is", async () => {
  // A page that takes longer than a frame (40 ms at 30 fps) to paint each pointer move.
  let now = 0;
  const timers: { at: number; run: () => void }[] = [];
  const clock = new FrameClock(30, () => now);
  const sent: Point[] = [];
  /** Where the page has drawn the block so far: the frames are written with this picture. */
  let shown: Point | null = null;
  const { cdp } = fakeCdp(async () => ({ ok: false, message: "", navigating: false }));
  cdp.mouse = async (type: string, p: Point) => {
    if (type === "mouseMoved") sent.push(p);
  };
  const paintAfter = () =>
    new Promise<void>((resolve) => {
      const drawn = sent.at(-1) ?? null;
      timers.push({
        at: now + 40,
        run: () => {
          shown = drawn;
          resolve();
        },
      });
    });
  const log: GuidedLogLine[] = [];
  const controller = new AbortController();
  const driver = new WebDriver(cdp as unknown as CdpDriver, {
    viewport,
    signal: controller.signal,
    clock,
    log: (line) => log.push(line),
    paintAfter,
  });
  const from = { x: 100, y: 100 };
  driver.pointer = from;
  clock.start();
  const frames: { t: number; hand: Point; block: Point }[] = [];
  let done = false;
  const glide = driver.glide(from, { x: 400, y: 160 }, 0.5, true).then(() => {
    done = true;
  });
  for (let i = 0; i < 20_000 && !done; i++) {
    now += 5;
    for (const timer of timers.filter((x) => x.at <= now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.run();
    }
    const n = clock.tick();
    for (let k = 0; k < n; k++) {
      const t = clock.frame();
      frames.push({ t, hand: driver.pointer, block: shown ?? from });
      if (clock.woke || clock.holding) break;
    }
    await new Promise((r) => setImmediate(r));
  }
  await glide;
  assert.equal(frames.length, 16, "0.5 s at 30 fps, and the frame where it ends");
  for (const f of frames) assert.deepEqual(f.block, f.hand, `frame at ${f.t.toFixed(3)} s`);
  // The video's seconds are the plan's; the waits for the page only took wall time.
  assert.ok(Math.abs(clock.time() - 16 / 30) < 1e-9);
  assert.ok(now > 500 * (40 / 33), `took ${now} ms`);
  // The log has the drag where it really was, and no hold of a few milliseconds each.
  assert.deepEqual(
    log.filter((l) => l.k === "glide").map((l) => [l.t, l.k === "glide" && l.drag]),
    [[0, true]],
  );
  assert.equal(clock.holds.length, 0);
});
