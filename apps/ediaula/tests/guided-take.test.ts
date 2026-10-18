import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pageCaptureArgs } from "../src/shared/captureArgs.ts";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import {
  GUIDED_LOG_FILE,
  type GuidedLogLine,
  normalizeGuidedRun,
} from "../src/shared/guidedCursor.ts";
import { JOURNAL_FILE } from "../src/shared/recordingJournal.ts";

/**
 * A guided take in the lesson window is a take like any other: sessao.jsonl with one screen
 * part and no monitor, the MP4 written from raw frames, and guided-log.jsonl. Finalizing it
 * (after a stop, or after a crash) makes cursor.json and guided-run.json from the log.
 */

const root = await mkdtemp(join(tmpdir(), "ediaula-guided-take-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { isPackaged: false, getPath: () => ${JSON.stringify(root)}, getAppPath: () => ${JSON.stringify(root)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { FFMPEG, probe } = await import("../src/main/ffmpeg.ts");
const { qpc } = await import("../src/main/nativeHelper.ts");
const { finalizeTake } = await import("../src/main/recording/finalize.ts");
const { recoverOrphan, scanOrphans } = await import("../src/main/recording/recovery.ts");
hooks.deregister();
after(() => rm(root, { recursive: true, force: true }));

const viewport = { width: 320, height: 240 };
const fps = 30;
const seconds = 3;

/** The screen part as the take writes it: raw BGRA frames on stdin, through the page's args. */
async function writePart(dir: string): Promise<void> {
  const child = spawn(
    FFMPEG,
    pageCaptureArgs({ ...viewport, fps, codec: "libx264", file: join(dir, "tela-0.mp4") }),
    { windowsHide: true },
  );
  child.stderr.resume();
  const frame = Buffer.alloc(viewport.width * viewport.height * 4);
  for (let i = 0; i < seconds * fps; i++) {
    frame.fill(i * 2);
    if (!child.stdin.write(frame)) await new Promise((r) => child.stdin.once("drain", r));
  }
  child.stdin.end();
  const code = await new Promise((resolve) => child.once("close", resolve));
  assert.equal(code, 0);
}

const log: GuidedLogLine[] = [
  {
    k: "begin",
    v: 1,
    planId: "plano-1",
    planName: "Blocos",
    timing: "0badc0de",
    fps,
    viewport,
    from: 0,
    narrationOffset: 1.5,
    steps: [
      { index: 0, id: "a", speech: "Clique", action: "click", start: 0.2, act: 1.5, end: 2.5 },
    ],
  },
  { k: "move", t: 0, x: 160, y: 120 },
  { k: "step", t: 0, index: 0, status: "start" },
  { k: "glide", t: 0.2, until: 1, from: { x: 160, y: 120 }, to: { x: 40, y: 30 } },
  { k: "down", t: 1.5, x: 40, y: 30, b: 0 },
  { k: "up", t: 1.5, x: 40, y: 30, b: 0 },
  { k: "act", t: 1.5, until: 1.5, kind: "click", step: 0 },
];

async function take(name: string, stopped: boolean): Promise<string> {
  const dir = join(root, "Gravações", name);
  await mkdir(dir, { recursive: true });
  await writePart(dir);
  const first = qpc() - seconds * 1000;
  const journal = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: first - 500,
      fps,
      monitor: null,
      region: null,
      encoder: "CPU (x264)",
      sources: { screen: true, microphone: null, camera: null, system: false, keys: true },
    },
    { k: "first", src: "screen", part: 0, qpc: first, file: "tela-0.mp4" },
    ...(stopped ? [{ k: "stop", qpc: qpc() + 2000 }] : []),
  ];
  await writeFile(join(dir, JOURNAL_FILE), journal.map((l) => `${JSON.stringify(l)}\n`).join(""));
  const lines = stopped
    ? [
        ...log,
        { k: "step", t: 2.5, index: 0, status: "done" } as const,
        { k: "hold", at: 0.2, duration: 1.25, reason: "locate", step: 0 } as const,
        { k: "end", t: seconds, status: "done" } as const,
      ]
    : log;
  // A crash cuts the log's last line in half.
  await writeFile(
    join(dir, GUIDED_LOG_FILE),
    `${lines.map((l) => JSON.stringify(l)).join("\n")}\n${stopped ? "" : '{"k":"step","t":2'}`,
  );
  return dir;
}

test("a stopped guided take is finalized with the cursor and guided-run.json made from its log", async () => {
  const dir = await take("2026-10-18 09-00-00-guiada", true);
  const result = await finalizeTake({ dir });
  assert.ok(result.screen && result.cursor && result.guidedRun);
  const info = await probe(result.screen);
  assert.ok(Math.abs(info.duration - seconds) < 0.05, `${info.duration} s`);
  assert.equal(Math.round(info.fps), fps);
  const cursor = normalizeCursorData(JSON.parse(await readFile(result.cursor, "utf8")));
  assert.deepEqual([cursor.width, cursor.height], [320, 240]);
  assert.deepEqual(cursor.clicks, [[1.5, 40, 30, 0, 0]]);
  const at = [...cursor.moves].reverse().find((m) => m[0] <= 1.5);
  assert.deepEqual(at?.slice(1, 3), [40, 30]);
  const run = normalizeGuidedRun(JSON.parse(await readFile(result.guidedRun, "utf8")));
  assert.equal(run.status, "done");
  assert.equal(run.steps[0].status, "done");
  assert.deepEqual(run.holds, [{ at: 0.2, duration: 1.25, reason: "locate", step: 0 }]);
  assert.equal(run.duration, result.duration);
  // Nothing of the take is cut: the video's time already left the holds out.
  assert.deepEqual(result.pauses, []);
});

test("a guided take left by a crash is offered and recovered with its cursor", async () => {
  const dir = await take("2026-10-18 09-05-00-guiada", false);
  const found = (await scanOrphans(join(root, "Gravações"))).find((o) => o.dir === dir);
  assert.ok(found, "listed as an interrupted take");
  assert.deepEqual(found.sources, ["screen"]);
  const result = await recoverOrphan(dir);
  assert.ok(result.cursor && result.guidedRun);
  const cursor = normalizeCursorData(JSON.parse(await readFile(result.cursor, "utf8")));
  assert.deepEqual(cursor.clicks, [[1.5, 40, 30, 0, 0]]);
  const run = normalizeGuidedRun(JSON.parse(await readFile(result.guidedRun, "utf8")));
  // It never got to the end: stopped, with its step still under way.
  assert.equal(run.status, "stopped");
  assert.equal(run.steps[0].status, "pending");
  assert.match(result.warnings?.join(" ") ?? "", /interrompida/);
});
