import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type HookEvent, parseHookLine } from "../src/shared/helperProtocol.ts";

// Real helper, real hooks and real SendInput. Only Electron's app paths are replaced. Synthetic
// input carries a test mark that the hook records and then withholds from every other app.
const appDir = fileURLToPath(new URL("..", import.meta.url));
const executable = join(appDir, "resources", "native", "ediaula-helper.exe");
const skip =
  process.platform !== "win32"
    ? "Windows only"
    : !existsSync(executable)
      ? "helper not built (run the package test script)"
      : false;
/**
 * Cases that send real clicks and wheel turns (withheld from other apps by the test mark) run only
 * when asked: on the Windows runner through edi:media:test, or with EDIAULA_NATIVE_INPUT_TESTS=1.
 */
const skipInput =
  skip ||
  (process.env.EDIAULA_NATIVE_INPUT_TESTS === "1"
    ? false
    : "sends real input; set EDIAULA_NATIVE_INPUT_TESTS=1");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { isPackaged: false, getAppPath: () => ${JSON.stringify(appDir)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { HookClient, InputClient, helperPath, listDisplays, qpc } = await import(
  "../src/main/nativeHelper.ts"
);
hooks.deregister();

const root = await mkdtemp(join(tmpdir(), "ediaula-native-helper-"));
const running = new Set<{ kill: () => boolean; exitCode: number | null }>();
after(async () => {
  // A failed assertion must not leave a hook installed or the journal locked.
  for (const child of running) if (child.exitCode === null) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await rm(root, { recursive: true, force: true });
});
const TEST_TAG = 0x45444941;

/** Hook mode under the test's control: stdout can be left unread on purpose. */
function startHook(args: string[]) {
  const child = spawn(executable, ["hook", ...args], { windowsHide: true });
  running.add(child);
  const events: HookEvent[] = [];
  const invalid: string[] = [];
  let pending = "";
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseHookLine(line);
      if (event) events.push(event);
      else invalid.push(line);
    }
  });
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  return { child, events, invalid, closed, stderr: () => stderr };
}

async function until(condition: () => boolean, ms: number, what: string): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function journal(dir: string): Promise<HookEvent[]> {
  const text = await readFile(join(dir, "cursor.jsonl"), "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const event = parseHookLine(line);
      assert.ok(event, `journal line outside the protocol: ${line}`);
      return event;
    });
}

test("the development app resolves the helper inside resources/native", { skip }, () => {
  assert.equal(helperPath(), executable);
});

test("list reports monitors and the Desktop Duplication outputs that show them", {
  skip,
  timeout: 20000,
}, async () => {
  const list = await listDisplays(executable);
  assert.ok(list.monitors.length >= 1);
  assert.equal(list.monitors.filter((m) => m.primary).length, 1);
  const devices = new Set(list.monitors.map((m) => m.device));
  for (const output of list.outputs.filter((o) => o.attached))
    assert.ok(devices.has(output.device), `output ${output.device} is a listed monitor`);
  for (const window of list.windows) assert.match(window.hwnd, /^\d+$/);
});

test("hook: READY on the shared clock, heartbeats, journal on disk and exit when stdin closes", {
  skip,
  timeout: 20000,
}, async () => {
  const dir = join(root, "ready");
  const hook = startHook(["--journal", dir]);
  let readyAt = 0;
  await until(
    () => {
      if (!readyAt && hook.events[0]?.e === "ready") readyAt = qpc();
      return readyAt > 0;
    },
    5000,
    "READY",
  );
  const ready = hook.events[0];
  assert.equal(ready.e, "ready");
  if (ready.e !== "ready") return;
  // QueryPerformanceCounter on both sides: the same clock, not just a similar one.
  assert.ok(Math.abs(readyAt - ready.t) < 200, `clock difference ${readyAt - ready.t} ms`);
  await until(() => hook.events.filter((e) => e.e === "hb").length >= 2, 3000, "heartbeats");
  const closing = qpc();
  hook.child.stdin.end();
  assert.equal(await hook.closed, 0);
  assert.ok(qpc() - closing < 3000, "exits promptly once the app is gone");
  assert.equal(hook.events.at(-1)?.e, "bye");
  assert.deepEqual(hook.invalid, []);
  const written = await journal(dir);
  assert.equal(written[0].e, "ready");
  assert.equal(written.at(-1)?.e, "bye");
  assert.equal(written.length, hook.events.length);
});

test("a stalled reader blocks neither the hook nor the journal, and no click is lost", {
  skip: skipInput,
  timeout: 60000,
}, async () => {
  const dir = join(root, "stall");
  const hook = startHook(["--journal", dir, "--test-tag", String(TEST_TAG)]);
  await until(() => hook.events[0]?.e === "ready", 5000, "READY");
  // Stop reading: the pipe fills and the helper's stdout thread has to wait.
  hook.child.stdout.pause();
  const delivered = hook.events.length;
  const input = new InputClient(executable, TEST_TAG);
  // Enough lines to fill the pipe and Node's own buffer many times over.
  const clicks = 60;
  const wheels = 5000;
  const stalledFrom = qpc();
  try {
    for (let i = 0; i < wheels; i++) {
      await input.command({ op: "wheel", delta: i % 2 ? 120 : -120 });
      if (i % Math.floor(wheels / clicks) === 0 && i / Math.floor(wheels / clicks) < clicks)
        await input.command({ op: "click" });
    }
    // At least 3 s of stall, and two journal flush intervals (200 ms) after the last click.
    const sentAt = qpc();
    while (qpc() - stalledFrom < 3000 || qpc() - sentAt < 400)
      await new Promise((resolve) => setTimeout(resolve, 50));
    const duringStall = await journal(dir);
    assert.equal(hook.events.length, delivered, "nothing was read while stalled");
    assert.equal(duringStall.filter((e) => e.e === "d" && e.inj).length, clicks);
  } finally {
    input.close();
  }
  const stalledUntil = qpc();
  hook.child.stdout.resume();
  hook.child.stdin.end();
  assert.equal(await hook.closed, 0, hook.stderr());
  const injected = (kind: HookEvent["e"]) =>
    hook.events.filter((e) => e.e === kind && "inj" in e && e.inj).length;
  assert.equal(injected("d"), clicks);
  assert.equal(injected("u"), clicks);
  assert.equal(injected("w"), wheels);
  assert.equal(hook.events.filter((e) => e.e === "health" && e.hook === "dead").length, 0);
  const beats = hook.events.filter(
    (e): e is Extract<HookEvent, { e: "hb" }> =>
      e.e === "hb" && e.t > stalledFrom && e.t < stalledUntil,
  );
  assert.ok(beats.length >= 4, "the writer kept its heartbeat while stdout was blocked");
  assert.ok(
    beats.some((b) => b.out > 0),
    "lines waited for the reader instead of blocking the hook",
  );
  assert.ok(beats.every((b) => b.hook === "ok" && b.drop === 0));
  assert.equal((await journal(dir)).length, hook.events.length);
});

test("selftest captures the hand, an alpha cursor and an inverting cursor with stable hashes", {
  skip,
  timeout: 20000,
}, async () => {
  const run = async (out: string) => {
    const { stdout } = await promisify(execFile)(executable, ["selftest", "--out", out], {
      windowsHide: true,
    });
    return JSON.parse(stdout) as {
      cursors: {
        name: string;
        id: string;
        w: number;
        h: number;
        hx: number;
        hy: number;
        inv: number;
        file: string;
        center: number[];
        ring: number[];
        corner: number[];
      }[];
    };
  };
  const first = await run(join(root, "self-1"));
  const second = await run(join(root, "self-2"));
  assert.deepEqual(
    first.cursors.map((c) => c.id),
    second.cursors.map((c) => c.id),
  );
  const [hand, alpha, mono] = first.cursors;
  assert.equal(hand.name, "hand");
  assert.match(hand.id, /^[0-9a-f]{16}$/);
  assert.deepEqual([alpha.w, alpha.h, alpha.hx, alpha.hy], [32, 32, 3, 5]);
  assert.deepEqual(alpha.center, [255, 0, 0, 255]);
  assert.equal(alpha.ring[1], 255);
  assert.ok(Math.abs(alpha.ring[3] - 128) <= 2, `half-transparent ring: ${alpha.ring}`);
  assert.deepEqual(alpha.corner, [0, 0, 0, 0]);
  assert.equal(alpha.inv, 0);
  assert.equal(mono.inv, 64);
  assert.deepEqual(mono.center, [0, 0, 0, 255]);
  for (const cursor of first.cursors) {
    const png = readFileSync(cursor.file);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [cursor.w, cursor.h]);
  }
});

test("HookClient restarts a helper that died, appends to the same journal and resends filters", {
  skip,
  timeout: 30000,
}, async () => {
  const dir = join(root, "restart");
  const client = new HookClient({ journal: dir });
  const events: HookEvent[] = [];
  const restarts: string[] = [];
  client.on("event", (event) => events.push(event));
  client.on("restart", ({ reason }) => restarts.push(reason));
  try {
    const ready = await client.start();
    client.send({ cmd: "keys", block: [{ vk: 0x78, m: 0 }], allow: [] });
    await until(() => events.some((e) => e.e === "ack"), 3000, "first ack");
    // The journal reaches the file every 200 ms; a kill loses at most that much.
    await new Promise((resolve) => setTimeout(resolve, 400));
    process.kill(ready.pid);
    await until(() => events.filter((e) => e.e === "ready").length === 2, 10000, "restart");
    await until(() => events.filter((e) => e.e === "ack").length === 2, 3000, "resent filter");
    assert.equal(restarts.length, 1);
    assert.equal(client.restartCount, 1);
    assert.equal(client.failure, undefined);
  } finally {
    await client.stop();
  }
  const written = await journal(dir);
  assert.equal(written.filter((e) => e.e === "ready").length, 2);
  assert.equal(written.at(-1)?.e, "bye");
});

test("pause keeps only the shape, resume records where the pointer is", {
  skip,
  timeout: 20000,
}, async () => {
  const dir = join(root, "pause");
  const hook = startHook(["--paused", "--journal", dir]);
  await until(() => hook.events[0]?.e === "ready", 5000, "READY");
  hook.child.stdin.write(`${JSON.stringify({ cmd: "resume" })}\n`);
  await until(() => hook.events.some((e) => e.e === "ack"), 3000, "resume ack");
  hook.child.stdin.write(`${JSON.stringify({ cmd: "pause" })}\n`);
  await until(() => hook.events.filter((e) => e.e === "ack").length === 2, 3000, "pause ack");
  hook.child.stdin.end();
  assert.equal(await hook.closed, 0);
  const kinds = hook.events.map((e) => e.e);
  const resume = kinds.indexOf("resume");
  assert.ok(resume > 0 && kinds.indexOf("pause") > resume);
  // Resuming records the pointer at once, read by polling (after its shape, when that changed).
  const here = hook.events.slice(resume + 1).find((e) => e.e === "m");
  assert.ok(here?.e === "m" && here.src === "p", JSON.stringify(here));
});

test("a restarted helper appends to a journal that another one still holds, on a line of its own", {
  skip,
  timeout: 20000,
}, async () => {
  const dir = join(root, "shared-journal");
  await mkdir(dir, { recursive: true });
  // A killed helper may leave half a line behind.
  await writeFile(join(dir, "cursor.jsonl"), '{"e":"hb","t":1');
  const first = startHook(["--journal", dir]);
  await until(() => first.events[0]?.e === "ready", 5000, "first READY");
  const second = startHook(["--journal", dir]);
  await until(() => second.events[0]?.e === "ready", 5000, "second READY while the first runs");
  second.child.stdin.end();
  first.child.stdin.end();
  assert.equal(await second.closed, 0, second.stderr());
  assert.equal(await first.closed, 0, first.stderr());
  const lines = (await readFile(join(dir, "cursor.jsonl"), "utf8")).split("\n").filter(Boolean);
  assert.equal(lines[0], '{"e":"hb","t":1');
  for (const line of lines.slice(1)) assert.ok(parseHookLine(line), line);
  assert.equal(lines.filter((line) => line.includes('"e":"ready"')).length, 2);
});

test("unfront skips windows that are gone and reports what it put back", { skip }, async () => {
  const { stdout } = await promisify(execFile)(executable, ["unfront", "0", "not-a-window"], {
    windowsHide: true,
  });
  assert.deepEqual(JSON.parse(stdout), { e: "unfront", hwnds: [] });
});

/** Cases for the privacy rule of the keys shown on screen: [case, shown]. */
const KEY_CASES: [Record<string, unknown>, boolean][] = [
  [{ vk: 0x43, mods: 1 }, true], // Ctrl+C
  [{ vk: 0x46, mods: 2 }, true], // Alt+F (menu)
  [{ vk: 0x44, mods: 8 }, true], // Win+D
  [{ vk: 0x54, mods: 5 }, true], // Ctrl+Shift+T
  [{ vk: 0x45, mods: 3, printable: true }, false], // Ctrl+Alt+E types € on many layouts
  [{ vk: 0x51, mods: 3, rightAlt: true, altGrLayout: true }, false], // AltGr+Q types @
  [{ vk: 0x51, mods: 3, rightAlt: true, altGrLayout: false }, true], // Ctrl+Alt+Q, no AltGr layout
  [{ vk: 0x2e, mods: 3, extended: true }, true], // Ctrl+Alt+Del style shortcut, prints nothing
  [{ vk: 0x61, mods: 2 }, false], // Alt+keypad 1: typing a character by its code
  [{ vk: 0x23, mods: 2 }, false], // Alt+keypad End (Num Lock off), same
  [{ vk: 0x23, mods: 2, extended: true }, true], // Alt+End from the navigation block
  [{ vk: 0x61, mods: 1 }, true], // Ctrl+keypad 1
  [{ vk: 0x20, mods: 0 }, false], // Space alone: could be a text field
  [{ vk: 0x08, mods: 0 }, false], // Backspace alone
  [{ vk: 0x20, mods: 4 }, false], // Shift+Space is typing too
  [{ vk: 0x20, mods: 2 }, true], // Alt+Space opens the window menu
  [{ vk: 0x0d, mods: 0 }, true], // Enter
  [{ vk: 0x09, mods: 4 }, true], // Shift+Tab
  [{ vk: 0x25, mods: 0 }, true], // Left arrow
  [{ vk: 0x2e, mods: 0, extended: true }, true], // Delete
  [{ vk: 0x70, mods: 0 }, true], // F1
  [{ vk: 0x41, mods: 0 }, false], // a
  [{ vk: 0x41, mods: 4 }, false], // A
  [{ vk: 0xa2, mods: 1 }, false], // Ctrl alone
];

test("the key rule shows shortcuts and navigation and never typing", { skip }, async () => {
  const child = spawn(executable, ["keyrule"], { windowsHide: true });
  const answers: boolean[] = [];
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) answers.push(JSON.parse(line).log);
  });
  for (const [input] of KEY_CASES) child.stdin.write(`${JSON.stringify(input)}\n`);
  child.stdin.end();
  assert.equal(await new Promise((resolve) => child.once("close", resolve)), 0);
  assert.deepEqual(
    answers.map((shown, i) => [KEY_CASES[i][0], shown]),
    KEY_CASES,
  );
});

/** Keys and whether they count as typing (only the moment is ever written). */
const TYPING_CASES: [Record<string, unknown>, boolean][] = [
  [{ vk: 0x41, mods: 0 }, true], // a
  [{ vk: 0x41, mods: 4 }, true], // A
  [{ vk: 0x31, mods: 0 }, true], // 1
  [{ vk: 0x20, mods: 0 }, true], // Space
  [{ vk: 0x08, mods: 0 }, true], // Backspace
  [{ vk: 0xbe, mods: 0 }, true], // .
  [{ vk: 0x51, mods: 3, rightAlt: true, altGrLayout: true }, true], // AltGr+Q types @
  [{ vk: 0x61, mods: 2 }, true], // Alt+keypad 1 types by code
  [{ vk: 0x43, mods: 1 }, false], // Ctrl+C is a shortcut, shown as a key instead
  [{ vk: 0x25, mods: 0 }, false], // Left arrow
  [{ vk: 0x70, mods: 0 }, false], // F1
  [{ vk: 0x14, mods: 0 }, false], // Caps Lock writes nothing
  [{ vk: 0x41, mods: 8 }, false], // Win+A
  [{ vk: 0xa0, mods: 4 }, false], // Shift alone
];

/** Runs cases through the helper's key rule test mode. */
async function keyRule(cases: Record<string, unknown>[]): Promise<Record<string, boolean>[]> {
  const child = spawn(executable, ["keyrule"], { windowsHide: true });
  const answers: Record<string, boolean>[] = [];
  let pending = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) answers.push(JSON.parse(line));
  });
  for (const input of cases) child.stdin.write(`${JSON.stringify(input)}\n`);
  child.stdin.end();
  assert.equal(await new Promise((resolve) => child.once("close", resolve)), 0);
  return answers;
}

test("typing is only a moment, at most one every half second, never the key", {
  skip,
}, async () => {
  const answers = await keyRule(TYPING_CASES.map(([input]) => input));
  assert.deepEqual(
    answers.map((a, i) => [TYPING_CASES[i][0], a.typing]),
    TYPING_CASES,
  );
  for (const a of answers) assert.ok(!(a.typing && a.log), "never both a key and typing");
  // Ten letters in a second become two moments.
  const burst = Array.from({ length: 10 }, (_, i) => ({
    vk: 0x41 + i,
    mods: 0,
    t: 1000 + i * 100,
  }));
  const gated = await keyRule([
    ...burst,
    { vk: 0x43, mods: 1, t: 2100 },
    { vk: 0x41, mods: 0, t: 2200 },
  ]);
  assert.deepEqual(
    gated.map((a) => a.emit),
    [true, false, false, false, false, true, false, false, false, false, false, true],
  );
});

test("HookClient rejects a helper that never becomes ready", { skip, timeout: 20000 }, async () => {
  const client = new HookClient({ executable: join(root, "missing-helper.exe") });
  await assert.rejects(client.start(), /capturador de cursor/);
  await client.kill();
});
