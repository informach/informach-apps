import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { createDesktopJobs, JOB_PRESERVATION_MS } from "@informach/edi-desktop/jobs";
import { FRAGMENTED_MP4, VOICE_MATROSKA } from "../src/shared/captureArgs.ts";
import type { CaptureMonitor, RecorderEvent } from "../src/shared/recording.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { JOURNAL_FILE, replayJournal } from "../src/shared/recordingJournal.ts";
import { timelineAt } from "../src/shared/timeline.ts";
import type { Asset } from "../src/shared/types.ts";
import { voiceTakes } from "../src/shared/voiceTakes.ts";

const root = await mkdtemp(join(tmpdir(), "ediaula-recording-preservation-"));
// Synthetic cursor helper: the hook protocol on the same clock, with heartbeats, until stdin ends.
// It mirrors its lines to the journal and, at each pause, writes there a click that never reached
// stdout: the recorder has to recover it from the journal.
const fakeHelper = `
const fs = require("node:fs");
const path = require("node:path");
const at = process.argv.indexOf("--journal");
const journal = at >= 0 ? path.join(process.argv[at + 1], "cursor.jsonl") : null;
const t = () => Number(process.hrtime.bigint()) / 1e6;
const line = (o, onlyJournal) => {
  const text = JSON.stringify(o) + "\\n";
  if (!onlyJournal) process.stdout.write(text);
  if (journal) fs.appendFileSync(journal, text);
};
line({ e: "ready", t: t(), pid: process.pid, v: "test", keys: false });
const beat = setInterval(() => line({ e: "hb", t: t(), q: 0, drop: 0, hook: "ok", re: 0, out: 0, jq: 0 }), 500);
let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  const lines = pending.split("\\n");
  pending = lines.pop();
  for (const command of lines) {
    const cmd = JSON.parse(command).cmd;
    if (cmd === "pause") {
      const now = t();
      line({ e: "d", t: now - 400, x: 5, y: 6, b: "left" }, true);
      line({ e: "u", t: now - 350, x: 5, y: 6, b: "left" }, true);
    }
    if (cmd === "pause" || cmd === "resume") line({ e: cmd, t: t() });
    line({ e: "ack", t: t(), cmd });
  }
});
process.stdin.on("end", () => {
  clearInterval(beat);
  line({ e: "bye", t: t(), drop: 0 });
});`;
// The OS adapter supplies a synthetic screen, microphone and cursor helper. The recorder, its
// FFmpeg processes (one per source), encoder detection, the journal, the finalization, MP4
// files and FFprobe are real. Every capture process is kept in globalThis.ediCaptures.
// With globalThis.ediBreakHardwareCapture set, recordings (not probes) with a hardware encoder
// fail before the first frame, as a driver that passed the probe might.
const spawnSource = `
import { spawn as nativeSpawn } from 'node:child_process';
export { execFile } from 'node:child_process';
export function spawn(bin, args, options) {
  if (bin.endsWith('ediaula-helper.exe'))
    return nativeSpawn(process.execPath, ['-e', ${JSON.stringify(fakeHelper)}, '--', ...args], options);
  let kind = null;
  const input = args.findIndex(value => value.startsWith('ddagrab='));
  if (input >= 0 && args.includes('-movflags')) kind = 'screen';
  if (input >= 0) {
    args = args.map(value => !value.startsWith('ddagrab=') ? value
      : value.includes('output_idx=99') ? 'missing_edi_capture_source' : 'color=c=blue:s=640x480:r=30');
    // Software frames stand in for Desktop Duplication's GPU frames, in the format the chosen
    // path hands the encoder: GPU-only steps become their system-memory twins.
    const vf = args.indexOf('-vf', input);
    if (vf < 0) {
      const map = args.findIndex((value, i) => value === '-map' && args[i + 1] === '0:v');
      args.splice(map >= 0 ? map + 2 : input + 1, 0, '-vf', 'format=nv12');
    } else
      args[vf + 1] = args[vf + 1].startsWith('hwdownload,') ? args[vf + 1].slice('hwdownload,'.length)
        : args[vf + 1].startsWith('scale_d3d11=') ? args[vf + 1].replace('scale_d3d11=format=nv12', 'format=nv12')
        : 'format=nv12,' + args[vf + 1];
    if (globalThis.ediBreakHardwareCapture && args.includes('-movflags'))
      args = args.map(value => ['h264_nvenc', 'h264_amf', 'h264_mf'].includes(value) ? 'h264_broken' : value);
    args.splice(input - 3, 0, '-re');
  }
  // A microphone: a tone in real time instead of the DirectShow device.
  const mic = args.findIndex(value => value.startsWith('audio='));
  if (mic >= 0) {
    kind = 'mic';
    const dshow = args.lastIndexOf('dshow', mic);
    const tone = globalThis.ediBreakMic ? 'missing_edi_mic_source' : 'sine=frequency=440:sample_rate=48000';
    args = [...args.slice(0, dshow - 1), '-re', '-f', 'lavfi', '-i', tone, ...args.slice(mic + 1)];
  }
  // A webcam: a test pattern in real time instead of the DirectShow device.
  const camera = args.findIndex(value => value.startsWith('video='));
  if (camera >= 0) {
    kind = 'camera';
    const dshow = args.lastIndexOf('dshow', camera);
    const pattern = globalThis.ediBreakCamera ? 'missing_edi_camera_source' : 'testsrc2=size=320x240:rate=30';
    args = [...args.slice(0, dshow - 1), '-re', '-f', 'lavfi', '-i', pattern, ...args.slice(camera + 1)];
  }
  const child = nativeSpawn(bin, args, options);
  if (kind) (globalThis.ediCaptures ??= []).push({ kind, child });
  return child;
}`;
const spawnUrl = `data:text/javascript,${encodeURIComponent(spawnSource)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(root)}, getAppPath: () => ${JSON.stringify(root)}, getGPUInfo: async () => ({ gpuDevice: [] }), getVersion: () => "0.0.0-test" };`)}`,
        shortCircuit: true,
      };
    if (specifier === "node:child_process" && context.parentURL !== spawnUrl)
      return { url: spawnUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const recorder = await import("../src/main/recorder.ts");
const { FFMPEG, FFPROBE, probe, run } = await import("../src/main/ffmpeg.ts");
const { qpc } = await import("../src/main/nativeHelper.ts");
const { RecordingSession } = await import("../src/main/recording/session.ts");
const { finalizeTake } = await import("../src/main/recording/finalize.ts");
hooks.deregister();
after(async () => {
  try {
    await recorder.cancel();
  } finally {
    await rm(root, { recursive: true });
  }
});

type Capture = {
  kind: "screen" | "mic" | "camera";
  child: { kill: (signal?: string) => boolean };
};
const captures = (): Capture[] =>
  (globalThis as unknown as { ediCaptures?: Capture[] }).ediCaptures ?? [];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const monitor: CaptureMonitor = {
  index: 0,
  output: 0,
  x: 0,
  y: 0,
  width: 640,
  height: 480,
  primary: true,
  label: "Synthetic",
};

test("expiração interrompe captura nativa e preserva MP4 legível mesmo com pausa concorrente", async () => {
  let preservation: Promise<void> | undefined;
  const jobs = createDesktopJobs({
    assertAccess: () => {},
    onStopError: (error) => {
      throw error;
    },
  });
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  const job = jobs.begin({
    preserveForMs: 0,
    stop: () => {
      preservation = recorder.preserve();
      return preservation;
    },
  });
  jobs.setAccess(false);
  await Promise.all([preservation, recorder.pause()]);
  await assert.rejects(recorder.resume(), /preservada/);
  const saved = await recorder.stop();
  job.finish();
  assert.ok(saved.duration > 0);
  assert.equal(saved.screen && (await probe(saved.screen)).hasVideo, true);
  const previous = await readFile(saved.screen ?? "");
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  const next = await recorder.stop();
  assert.notEqual(next.dir, saved.dir);
  assert.deepEqual(await readFile(saved.screen ?? ""), previous);
  assert.equal(next.screen && (await probe(next.screen)).hasVideo, true);
});

test("limite de preservação encerra FFmpeg real e aguarda handles antes de remover staging", async () => {
  const path = join(root, "existing.mp4");
  await writeFile(path, "previous export");
  let licensed = true;
  let now = 0;
  const cancellation = new AbortController();
  const jobs = createDesktopJobs({
    assertAccess: () => {
      if (!licensed) throw new Error("restricted");
    },
    onStopError: (error) => {
      throw error;
    },
    monotonic: () => now,
    wallClock: () => now,
  });
  const job = jobs.begin({ stop: () => cancellation.abort() });
  try {
    await assert.rejects(
      withStagedFiles(
        [path],
        async (staged) => {
          const output = staged.get(path);
          assert.ok(output);
          await run(
            FFMPEG,
            [
              "-v",
              "error",
              "-re",
              "-f",
              "lavfi",
              "-i",
              "color=s=128x128:r=30",
              "-t",
              "3600",
              "-c:v",
              "libx264",
              "-y",
              output,
            ],
            {
              signal: cancellation.signal,
              duration: 3600,
              onProgress: () => {
                if (!licensed) return;
                licensed = false;
                jobs.setAccess(false);
                now += JOB_PRESERVATION_MS;
                jobs.checkDeadlines();
              },
            },
          );
        },
        () => job.check(),
      ),
      /aborted/,
    );
    assert.equal(await readFile(path, "utf8"), "previous export");
  } finally {
    job.finish();
  }
});

test("cursor events missed in memory come back from the journal", async () => {
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  await wait(1500);
  const saved = await recorder.stop();
  assert.ok(saved.cursor);
  const cursor = JSON.parse(await readFile(saved.cursor, "utf8"));
  assert.equal(cursor.version, 2);
  // The click reached only the journal (written at the stop, 0.4 s before it).
  assert.equal(cursor.clicks.length, 1);
  assert.deepEqual(cursor.clicks[0].slice(1), [5, 6, 0, 0.05]);
  const journal = (await readFile(join(saved.dir, "cursor.jsonl"), "utf8")).trim().split("\n");
  const kinds = journal.map((line) => JSON.parse(line).e);
  assert.ok(kinds.includes("d") && kinds.includes("u"));
  assert.equal(saved.cursorIssues, undefined);
  assert.equal(
    replayJournal(await readFile(join(saved.dir, JOURNAL_FILE), "utf8")).finalized,
    true,
  );
});

test("pausing does not start another FFmpeg: the pause becomes a cut and the microphone comes apart, lined up", async () => {
  const before = captures().length;
  await recorder.prepare({ monitor: 0, fps: 30, microphone: "Fake Mic" }, [monitor]);
  await recorder.start();
  await wait(1200);
  await recorder.pause();
  const pausedAt = recorder.elapsed();
  await wait(1000);
  // The recorder's clock stood still during the pause.
  assert.ok(Math.abs(recorder.elapsed() - pausedAt) < 0.05);
  await recorder.resume();
  await wait(1000);
  const saved = await recorder.stop();
  const spawned = captures().slice(before);
  assert.equal(spawned.filter((c) => c.kind === "screen").length, 1);
  assert.equal(spawned.filter((c) => c.kind === "mic").length, 1);
  assert.equal(saved.version, 2);
  const [from, to] = saved.pauses[0];
  assert.ok(to - from > 0.8 && to - from < 1.5, `pause of ${to - from} s`);
  // Besides the pause, only what the processes wrote while closing, at the very end.
  for (const [a, b] of saved.pauses.slice(1)) {
    assert.equal(b, saved.duration);
    assert.ok(b - a < 0.6, `tail of ${b - a} s`);
  }
  assert.ok(saved.screen && saved.microphone);
  const screen = await probe(saved.screen);
  const mic = await probe(saved.microphone);
  assert.equal(screen.hasAudio, false, "the screen video carries no sound");
  assert.equal(mic.hasAudio, true);
  // The microphone starts at the take's second 0 and lasts as long.
  assert.ok(Math.abs(mic.duration - saved.duration) < 0.2, `${mic.duration} vs ${saved.duration}`);
  const cursor = JSON.parse(await readFile(saved.cursor ?? "", "utf8"));
  assert.deepEqual(cursor.pauses, saved.pauses);
  // The parts were joined and removed.
  await assert.rejects(stat(join(saved.dir, "tela-0.mp4")));
  await assert.rejects(stat(join(saved.dir, "microfone-0.m4a")));
});

test("the screen's FFmpeg dying pauses the take with a warning, and stopping still saves", async () => {
  const events: RecorderEvent[] = [];
  const unsubscribe = recorder.subscribe((m) => m.type === "event" && events.push(m.event));
  try {
    const before = captures().length;
    await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
    await recorder.start();
    // Past the first two-second fragment, which is what a part keeps when it is killed.
    await wait(3000);
    const screen = captures()
      .slice(before)
      .find((c) => c.kind === "screen");
    assert.ok(screen);
    screen.child.kill("SIGKILL");
    for (let i = 0; i < 50 && !events.length; i++) await wait(100);
    assert.equal(events[0]?.source, "screen");
    assert.deepEqual(events[0]?.actions, ["resume", "stop"]);
    assert.equal(recorder.status().phase, "failed");
    assert.deepEqual(recorder.status().failed, ["screen"]);
    const saved = await recorder.stop();
    assert.ok(saved.screen);
    const info = await probe(saved.screen);
    assert.equal(info.hasVideo, true);
    assert.ok(info.duration > 0.5);
    assert.match(saved.warnings?.join("\n") ?? "", /A tela parou/);
  } finally {
    unsubscribe();
  }
});

test("a take left behind by a crash is found, recovered with cursor data v2 and a readable MP4", async () => {
  const dir = join(recorder.recordingsDir(), "2026-10-17 10-00-00-crash");
  await mkdir(dir, { recursive: true });
  // The screen's FFmpeg killed mid-take, as by a crash: its file ends in an open fragment.
  const part = join(dir, "tela-0.mp4");
  const first = qpc();
  const capture = spawn(
    FFMPEG,
    [
      "-y",
      "-v",
      "error",
      "-re",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x240:r=30",
      "-t",
      "20",
      "-c:v",
      "libx264",
      "-g",
      "30",
      "-bf",
      "0",
      ...FRAGMENTED_MP4,
      "-f",
      "mp4",
      part,
    ],
    { windowsHide: true },
  );
  await wait(3500);
  capture.kill("SIGKILL");
  await new Promise((resolve) => capture.once("close", resolve));
  const lines = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: first - 1000,
      fps: 30,
      monitor: { x: 0, y: 0, width: 320, height: 240 },
      region: null,
      encoder: "CPU (x264)",
      sources: { screen: true, microphone: null, camera: null, system: false, keys: false },
    },
    { k: "first", src: "screen", part: 0, qpc: first, file: "tela-0.mp4" },
    { k: "marker", qpc: first + 1500, kind: "marker" },
  ];
  // The journal's last line was cut off.
  await writeFile(
    join(dir, JOURNAL_FILE),
    `${lines.map((l) => JSON.stringify(l)).join("\n")}\n{"k":"pa`,
  );
  const helper = [
    { e: "ready", t: first - 800, pid: 1, v: "test", keys: false },
    ...Array.from({ length: 8 }, (_, i) => ({
      e: "hb",
      t: first - 500 + i * 500,
      q: 0,
      drop: 0,
      hook: "ok",
      re: 0,
      out: 0,
      jq: 0,
    })),
    { e: "m", t: first + 500, x: 10, y: 20 },
    { e: "d", t: first + 1000, x: 10, y: 20, b: "left" },
    { e: "u", t: first + 1100, x: 10, y: 20, b: "left" },
  ].sort((a, b) => a.t - b.t);
  await writeFile(join(dir, "cursor.jsonl"), helper.map((l) => `${JSON.stringify(l)}\n`).join(""));

  const orphans = await recorder.orphans();
  const found = orphans.find((o) => o.dir === dir);
  assert.ok(found, "listed as an interrupted take");
  assert.deepEqual(found.sources, ["screen"]);
  const result = await recorder.recoverOrphan(dir);
  assert.ok(result.screen);
  const info = await probe(result.screen);
  assert.equal(info.hasVideo, true);
  assert.ok(info.duration > 1, `recovered ${info.duration} s`);
  const cursor = JSON.parse(await readFile(result.cursor ?? "", "utf8"));
  assert.equal(cursor.version, 2);
  assert.deepEqual(cursor.clicks, [[1, 10, 20, 0, 0.1]]);
  assert.deepEqual(result.markers, [{ t: 1.5, kind: "marker" }]);
  assert.match(result.warnings?.join(" ") ?? "", /interrompida/);
  // Finalized now, but offered until the editor imports it; then not any more.
  assert.equal((await recorder.orphans()).find((o) => o.dir === dir)?.finalized, true);
  await recorder.markImported(dir);
  assert.equal(
    (await recorder.orphans()).some((o) => o.dir === dir),
    false,
  );
  await assert.rejects(recorder.recoverOrphan(dir), /não é uma gravação interrompida/);
});

test("a take of the microphone alone records and finalizes on its own clock", async () => {
  await recorder.prepare({ fps: 30, microphone: "Fake Mic" }, []);
  await recorder.start();
  await wait(1500);
  const saved = await recorder.stop();
  assert.equal(saved.screen, undefined);
  assert.equal(saved.cursor, undefined);
  assert.ok(saved.microphone);
  const mic = await probe(saved.microphone);
  assert.equal(mic.hasAudio, true);
  assert.ok(saved.duration > 1);
  assert.ok(Math.abs(mic.duration - saved.duration) < 0.2, `${mic.duration} vs ${saved.duration}`);
});

test("discarding a take throws its folder away and leaves the recorder ready", async () => {
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  const dir = recorder.activeDir();
  assert.ok(dir);
  const thrown: string[] = [];
  await recorder.discard(async (d) => {
    thrown.push(d);
    await rm(d, { recursive: true, force: true });
  });
  assert.deepEqual(thrown, [dir]);
  assert.equal(recorder.isRecording(), false);
  await assert.rejects(stat(dir));
});

const live = (kind: "screen" | "mic", from: number): number =>
  captures()
    .slice(from)
    .filter(
      (c) =>
        c.kind === kind &&
        (c.child as unknown as { exitCode: number | null; signalCode: string | null }).exitCode ===
          null &&
        (c.child as unknown as { signalCode: string | null }).signalCode === null,
    ).length;
const until = async (ok: () => boolean, ms = 5000): Promise<void> => {
  for (let waited = 0; !ok() && waited < ms; waited += 50) await wait(50);
};

test("resuming after a partial failure never leaves two screens recording", async () => {
  const before = captures().length;
  await recorder.prepare({ monitor: 0, fps: 30, microphone: "Fake Mic" }, [monitor]);
  await recorder.start();
  await wait(2500);
  for (const c of captures().slice(before)) c.child.kill("SIGKILL");
  await until(() => recorder.status().failed.length === 2);
  assert.deepEqual([...recorder.status().failed].sort(), ["mic", "screen"]);
  // The screen opens, the microphone does not: the take stays paused, with no screen left over.
  Object.assign(globalThis, { ediBreakMic: true });
  try {
    await assert.rejects(recorder.resume(), /retomar/);
  } finally {
    Object.assign(globalThis, { ediBreakMic: false });
  }
  await until(() => live("screen", before) === 0);
  assert.equal(live("screen", before), 0);
  assert.equal(recorder.status().phase, "failed");
  // Trying again opens one of each.
  await recorder.resume();
  assert.equal(recorder.status().phase, "recording");
  assert.equal(live("screen", before), 1);
  assert.equal(live("mic", before), 1);
  await wait(2500);
  assert.equal(live("screen", before), 1);
  const saved = await recorder.stop();
  assert.ok(saved.screen && (await probe(saved.screen)).hasVideo);
  assert.ok(saved.microphone);
});

test("the take recording now is never offered as interrupted", async () => {
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  await recorder.start();
  await wait(500);
  const dir = recorder.activeDir();
  assert.ok(dir);
  assert.equal(
    (await recorder.orphans()).some((o) => o.dir === dir),
    false,
  );
  await assert.rejects(recorder.recoverOrphan(dir), /não é uma gravação interrompida/);
  await recorder.stop();
});

test("cancelling while the take is being prepared leaves nothing behind", async () => {
  const folders = (): string[] => readdirSync(recorder.recordingsDir());
  const before = folders();
  const preparing = recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  assert.equal(recorder.isPreparing(), true);
  await recorder.cancel();
  await assert.rejects(preparing, /cancelada/);
  assert.equal(recorder.isRecording(), false);
  assert.equal(recorder.status().phase, null);
  assert.deepEqual(folders(), before);
  // A take prepared and never started gives way to the next one.
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  const first = recorder.activeDir();
  await recorder.prepare({ monitor: 0, fps: 30, keys: true }, [monitor]);
  assert.notEqual(recorder.activeDir(), first);
  assert.equal(first && existsSync(first), false);
  await recorder.cancel();
  assert.deepEqual(folders(), before);
});

test("a journal that cannot be written does not stop the take, nor its stop", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-journal-fails-"));
  let lines = 0;
  const session = new RecordingSession({
    opts: { fps: 30, microphone: "Fake Mic" },
    monitor: null,
    dir,
    ffmpeg: FFMPEG,
    encoder: null,
    hook: null,
    // The first lines reach the file; from the first part's start on, the disk refuses.
    journalWriter: {
      write: (text) => {
        if (++lines > 2) throw Object.assign(new Error("EIO: falha de escrita"), { code: "EIO" });
        appendFileSync(join(dir, JOURNAL_FILE), text);
      },
      sync: () => undefined,
      close: () => undefined,
    },
  });
  const events: RecorderEvent[] = [];
  session.on("event", (e) => events.push(e));
  try {
    await session.start();
    await wait(1200);
    const saved = await session.stop();
    assert.ok(saved.microphone);
    assert.match(saved.warnings?.join("\n") ?? "", /diário da gravação não pôde ser gravado/);
    assert.equal(events.filter((e) => /diário/.test(e.message)).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a part that cannot be removed after `finalized` is only a warning: the take is kept", async () => {
  const dir = join(recorder.recordingsDir(), "2026-10-18 09-00-00-busy");
  await mkdir(dir, { recursive: true });
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:a",
    "aac",
    ...FRAGMENTED_MP4,
    "-f",
    "mp4",
    join(dir, "microfone-0.m4a"),
  ]);
  const q = qpc();
  const begin = {
    k: "begin",
    v: 1,
    at: Date.now(),
    qpc: q - 100,
    fps: 30,
    monitor: null,
    region: null,
    encoder: null,
    sources: { screen: false, microphone: "Mic", camera: null, system: false, keys: false },
  };
  await writeFile(
    join(dir, JOURNAL_FILE),
    `${[
      begin,
      { k: "first", src: "mic", part: 0, qpc: q, file: "microfone-0.m4a" },
      { k: "stop", qpc: q + 5000 },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n")}\n`,
  );
  const result = await finalizeTake({
    dir,
    remove: async () => {
      throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    },
  });
  assert.ok(result.microphone);
  assert.match(result.warnings?.join(" ") ?? "", /Não consegui apagar partes já copiadas.*EBUSY/);
  assert.equal(existsSync(join(dir, "microfone-0.m4a")), true);
  const replay = replayJournal(await readFile(join(dir, JOURNAL_FILE), "utf8"));
  assert.equal(replay.finalized, true);
  // Finished and never imported: offered again, to import as it is.
  const offered = (await recorder.orphans()).find((o) => o.dir === dir);
  assert.equal(offered?.finalized, true);
  assert.equal((await recorder.recoverOrphan(dir)).microphone, result.microphone);
  await recorder.markImported(dir);
  assert.equal(
    (await recorder.orphans()).some((o) => o.dir === dir),
    false,
  );
});

/** First moment (s) a decoded stream goes over `limit`: luma of 16×16 frames, or 8 kHz samples. */
async function onset(path: string, kind: "video" | "audio"): Promise<number> {
  const chunks: Buffer[] = [];
  await run(
    FFMPEG,
    kind === "video"
      ? ["-v", "error", "-i", path, "-vf", "scale=16:16,format=gray", "-f", "rawvideo", "-"]
      : ["-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
    { onStdout: (chunk) => chunks.push(chunk) },
  );
  const data = Buffer.concat(chunks);
  if (kind === "video") {
    for (let f = 0; (f + 1) * 256 <= data.length; f++) {
      let sum = 0;
      for (let i = 0; i < 256; i++) sum += data[f * 256 + i];
      if (sum / 256 > 128) return f / 30;
    }
  } else
    for (let i = 0; i + 1 < data.length; i += 2)
      if (Math.abs(data.readInt16LE(i)) > 3000) return i / 2 / 8000;
  return Number.NaN;
}

test("a flash and a beep made at the same instant land on the same frame after import", async () => {
  const dir = join(recorder.recordingsDir(), "2026-10-18 10-00-00-sync");
  await mkdir(dir, { recursive: true });
  // The screen turns white 2.0 s into its part; the microphone, which started 0.3 s later,
  // beeps 1.7 s into its own: the same instant on the shared clock.
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x240:r=30:d=3,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(t,2)'",
    "-c:v",
    "libx264",
    "-g",
    "30",
    "-bf",
    "0",
    ...FRAGMENTED_MP4,
    "-f",
    "mp4",
    join(dir, "tela-0.mp4"),
  ]);
  await run(FFMPEG, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='if(gte(t,1.7),0.5*sin(2*PI*1000*t),0)':s=48000:d=3",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    ...FRAGMENTED_MP4,
    "-f",
    "mp4",
    join(dir, "microfone-0.m4a"),
  ]);
  const q = qpc();
  const lines = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: q - 500,
      fps: 30,
      monitor: { x: 0, y: 0, width: 320, height: 240 },
      region: null,
      encoder: "CPU (x264)",
      sources: { screen: true, microphone: "Mic", camera: null, system: false, keys: false },
    },
    { k: "first", src: "screen", part: 0, qpc: q, file: "tela-0.mp4" },
    { k: "first", src: "mic", part: 0, qpc: q + 300, file: "microfone-0.m4a" },
    // Paused from 0.5 s to 1.0 s of the take: the import cuts it from both.
    { k: "pause", qpc: q + 500 },
    { k: "resume", qpc: q + 1000 },
    { k: "stop", qpc: q + 3000 },
  ];
  await writeFile(join(dir, JOURNAL_FILE), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  const result = await finalizeTake({ dir });
  assert.ok(result.screen && result.microphone);
  const flash = await onset(result.screen, "video");
  const beep = await onset(result.microphone, "audio");
  assert.ok(Math.abs(flash - 2) < 1 / 30 + 1e-6, `flash at ${flash} s`);
  assert.ok(Math.abs(beep - flash) < 1 / 30, `beep at ${beep} s, flash at ${flash} s`);
  // On the timeline, after the pause was cut.
  const asset = (id: string, path: string, kind: Asset["kind"], duration: number): Asset => ({
    id,
    name: id,
    path,
    kind,
    duration,
    width: 320,
    height: 240,
    fps: 30,
    hasVideo: kind === "video",
    hasAudio: kind === "audio",
    size: 1,
    proxyStatus: "none",
  });
  const layout = layoutRecording(
    { tracks: [], clips: [] },
    [
      asset("screen", result.screen, "video", (await probe(result.screen)).duration),
      asset("mic", result.microphone, "audio", (await probe(result.microphone)).duration),
    ],
    result,
  );
  const clipAt = (assetId: string, src: number) =>
    layout.placed.find((c) => c.assetId === assetId && src >= c.in && src < c.in + c.duration);
  const screenClip = clipAt("screen", flash);
  const voiceClip = clipAt("mic", beep);
  assert.ok(screenClip && voiceClip);
  const onTimeline = { flash: timelineAt(screenClip, flash), beep: timelineAt(voiceClip, beep) };
  assert.ok(Math.abs(onTimeline.flash - 1.5) < 1 / 30 + 1e-6, `flash at ${onTimeline.flash}`);
  assert.ok(Math.abs(onTimeline.beep - onTimeline.flash) < 1 / 30, JSON.stringify(onTimeline));
});

test("a hardware encoder that passed the probe but fails to record gives way to the next path", async (context) => {
  await recorder.prepare({ monitor: 0, fps: 30 }, [monitor]);
  const cache = JSON.parse(await readFile(join(root, "encoders.json"), "utf8"));
  const chosen = cache.profiles["0:640x480@30"].encoder;
  if (chosen.codec === "libx264") {
    await recorder.cancel();
    context.skip("x264 was chosen here: there is no hardware path to fail");
    return;
  }
  Object.assign(globalThis, { ediBreakHardwareCapture: true });
  try {
    await recorder.start();
  } finally {
    Object.assign(globalThis, { ediBreakHardwareCapture: false });
  }
  const saved = await recorder.stop();
  assert.equal(saved.screen && (await probe(saved.screen)).videoCodec, "h264");
  assert.match(saved.encoderIssues?.[0] ?? "", /não abriu a gravação; foi usado CPU \(x264\)/);
  const after = JSON.parse(await readFile(join(root, "encoders.json"), "utf8"));
  assert.ok(after.failures.includes(`${chosen.codec}|${chosen.conversion}`));
  assert.equal(after.profiles["0:640x480@30"], undefined, "detected again next time");
});

test("erro nativo antes do primeiro quadro rejeita a gravação sem rejeição background tardia", async () => {
  await assert.rejects(
    (async () => {
      await recorder.prepare({ monitor: 0, fps: 30 }, [{ ...monitor, output: 99 }]);
      await recorder.start();
    })(),
    /tela|filter|Invalid|Error/i,
  );
  await recorder.cancel();
  assert.equal(recorder.isRecording(), false);
});

test("a voice-only take keeps the microphone as PCM, with its lines, its redo and the 16 kHz copy", async () => {
  let follow = 0;
  const lines: number[] = [];
  const unsubscribe = recorder.subscribe((m) => {
    if (m.type === "follow") follow += m.chunk.length;
    if (m.type === "line") lines.push(m.index);
  });
  try {
    await recorder.prepare({ fps: 30, microphone: "Fake Mic", mode: "voice", follow: true }, []);
    await recorder.start();
    recorder.teleprompterLine(0);
    await wait(900);
    recorder.teleprompterLine(1);
    await wait(700);
    recorder.mark("retake");
    await wait(700);
    const saved = await recorder.stop();
    assert.equal(saved.mode, "voice");
    assert.match(saved.microphone ?? "", /voz\.wav$/);
    const out = await run(FFPROBE, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_streams",
      saved.microphone ?? "",
    ]);
    const [stream] = JSON.parse(out).streams;
    assert.equal(stream.codec_name, "pcm_s16le");
    assert.equal(stream.sample_rate, "48000");
    assert.equal(stream.channels, 1);
    assert.ok(Math.abs(Number(stream.duration) - saved.duration) < 0.2);
    assert.deepEqual(lines, [0, 1]);
    // At least a second of the 16 kHz copy reached the follower.
    assert.ok(follow >= 16000 * 2, `${follow} bytes`);
    const takes = voiceTakes(saved);
    assert.deepEqual(
      takes.map((t) => [t.line, !!t.retake]),
      [
        [0, false],
        [1, true],
        [1, false],
      ],
    );
    await assert.rejects(stat(join(saved.dir, "voz-0.mkv")), "the part was replaced by voz.wav");
  } finally {
    unsubscribe();
  }
});

test("a voice and camera take records the presenter beside the voice, both on the take's clock", async () => {
  await recorder.prepare(
    { fps: 30, microphone: "Fake Mic", camera: "Fake Cam", mode: "voicecam", follow: false },
    [],
  );
  await recorder.start();
  recorder.teleprompterLine(0);
  await wait(1200);
  recorder.teleprompterLine(1);
  await wait(1200);
  const saved = await recorder.stop();
  assert.equal(saved.mode, "voicecam");
  assert.equal(saved.screen, undefined);
  assert.match(saved.microphone ?? "", /voz\.wav$/, "the voice kept as PCM, as in Só voz");
  const [part] = saved.cameraParts ?? [];
  assert.ok(part, "the camera recorded in a process of its own");
  const camera = await probe(part.path);
  assert.equal(camera.hasVideo, true);
  // Opened with the voice, on the same clock.
  assert.ok(part.at >= 0 && part.at < 0.6, `camera from ${part.at} s`);
  assert.ok(
    Math.abs(part.at + part.duration - saved.duration) < 0.6,
    `camera to ${part.at + part.duration} s, take ${saved.duration} s`,
  );
  assert.deepEqual(
    voiceTakes(saved).map((t) => t.line),
    [0, 1],
  );
  // Imported: the voice on "Voz" from the take's second 0, the camera on "Apresentador" from
  // where it started, muted.
  const asset = (id: string, path: string, kind: Asset["kind"], duration: number): Asset => ({
    id,
    name: id,
    path,
    kind,
    duration,
    width: 320,
    height: 240,
    fps: 30,
    hasVideo: kind === "video",
    hasAudio: kind === "audio",
    size: 1,
    proxyStatus: "none",
  });
  const voice = asset(
    "voz",
    saved.microphone ?? "",
    "audio",
    (await probe(saved.microphone ?? "")).duration,
  );
  const cam = asset("cam", part.path, "video", camera.duration);
  const layout = layoutRecording({ tracks: [], clips: [] }, [voice, cam], saved, 0);
  const presenter = layout.tracks.find((t) => t.name === "Apresentador");
  const voiceTrack = layout.tracks.find((t) => t.name === "Voz");
  const camClip = layout.placed.find((c) => c.trackId === presenter?.id);
  const voiceClip = layout.placed.find((c) => c.trackId === voiceTrack?.id);
  assert.ok(camClip && voiceClip);
  assert.equal(voiceClip.start, 0);
  assert.equal(camClip.volume, 0);
  assert.ok(
    Math.abs(camClip.start - part.at) < 1e-3,
    "the camera keeps its place against the voice",
  );
});

test('"Voz e câmera" refuses to start without its camera, as without its microphone', async () => {
  Object.assign(globalThis, { ediBreakCamera: true });
  try {
    await recorder.prepare(
      { fps: 30, microphone: "Fake Mic", camera: "Fake Cam", mode: "voicecam", follow: false },
      [],
    );
    await assert.rejects(recorder.start(), /A câmera não abriu/);
  } finally {
    Object.assign(globalThis, { ediBreakCamera: false });
    await recorder.cancel();
  }
  assert.equal(recorder.isRecording(), false);
});

test('"Voz e câmera": the camera stopping pauses the take with Retomar and Parar e salvar', async () => {
  const events: RecorderEvent[] = [];
  const unsubscribe = recorder.subscribe((m) => {
    if (m.type === "event") events.push(m.event);
  });
  try {
    await recorder.prepare(
      { fps: 30, microphone: "Fake Mic", camera: "Fake Cam", mode: "voicecam", follow: false },
      [],
    );
    await recorder.start();
    // Past the first two-second fragment, so the part that dies holds something.
    await wait(2600);
    const camera = captures()
      .filter((c) => c.kind === "camera")
      .at(-1);
    assert.ok(camera, "the camera's process");
    camera.child.kill("SIGKILL");
    for (let i = 0; i < 50 && !events.some((e) => e.source === "camera"); i++) await wait(100);
    const stopped = events.find((e) => e.source === "camera");
    assert.equal(stopped?.level, "error");
    assert.deepEqual(stopped?.actions, ["resume", "stop"]);
    assert.equal(recorder.status().phase, "failed");
    // Resuming opens the camera again, and the take goes on with it.
    await recorder.resume();
    assert.equal(recorder.status().phase, "recording");
    await wait(800);
    const saved = await recorder.stop();
    assert.equal(saved.mode, "voicecam");
    assert.equal(saved.cameraParts?.length, 2, "a part before the failure and one after");
  } finally {
    unsubscribe();
  }
});

test("a voice take cut short by a crash is recovered from its Matroska part", async () => {
  const dir = join(recorder.recordingsDir(), "2026-10-18 10-00-00-voz");
  await mkdir(dir, { recursive: true });
  const part = join(dir, "voz-0.mkv");
  const first = qpc();
  const capture = spawn(
    FFMPEG,
    [
      "-y",
      "-v",
      "error",
      "-re",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:sample_rate=48000",
      "-t",
      "20",
      ...VOICE_MATROSKA,
      part,
    ],
    { windowsHide: true },
  );
  await wait(2500);
  capture.kill("SIGKILL");
  await new Promise((resolve) => capture.once("close", resolve));
  const journal = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: first - 500,
      fps: 30,
      monitor: null,
      region: null,
      encoder: null,
      sources: { screen: false, microphone: "Fake Mic", camera: null, system: false, keys: false },
      mode: "voice",
    },
    { k: "first", src: "mic", part: 0, qpc: first, file: "voz-0.mkv" },
    { k: "line", qpc: first + 100, index: 2 },
  ];
  await writeFile(join(dir, JOURNAL_FILE), `${journal.map((l) => JSON.stringify(l)).join("\n")}\n`);
  const found = (await recorder.orphans()).find((o) => o.dir === dir);
  assert.deepEqual(found?.sources, ["mic"]);
  const result = await recorder.recoverOrphan(dir);
  assert.equal(result.mode, "voice");
  assert.match(result.microphone ?? "", /voz\.wav$/);
  const info = await probe(result.microphone ?? "");
  assert.ok(info.duration > 1.5, `recovered ${info.duration} s`);
  assert.deepEqual(result.lines, [{ t: 0.1, index: 2 }]);
});

test("a voice and camera take cut short by a crash comes back with the voice and the presenter", async () => {
  const dir = join(recorder.recordingsDir(), "2026-10-18 10-30-00-voz-e-camera");
  await mkdir(dir, { recursive: true });
  const first = qpc();
  const capture = spawn(
    FFMPEG,
    [
      ...["-y", "-v", "error", "-re", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000"],
      ...["-re", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-t", "20"],
      ...["-map", "0:a", ...VOICE_MATROSKA, join(dir, "voz-0.mkv")],
      ...["-map", "1:v", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"],
      ...FRAGMENTED_MP4,
      join(dir, "camera-0.mp4"),
    ],
    { windowsHide: true },
  );
  await wait(3000);
  capture.kill("SIGKILL");
  await new Promise((resolve) => capture.once("close", resolve));
  const journal = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: first - 500,
      fps: 30,
      monitor: null,
      region: null,
      encoder: null,
      sources: {
        screen: false,
        microphone: "Fake Mic",
        camera: "Fake Cam",
        system: false,
        keys: false,
      },
      mode: "voicecam",
    },
    { k: "first", src: "mic", part: 0, qpc: first, file: "voz-0.mkv" },
    { k: "first", src: "camera", part: 0, qpc: first, file: "camera-0.mp4" },
  ];
  await writeFile(join(dir, JOURNAL_FILE), `${journal.map((l) => JSON.stringify(l)).join("\n")}\n`);
  const found = (await recorder.orphans()).find((o) => o.dir === dir);
  assert.ok(
    found?.sources.includes("mic") && found.sources.includes("camera"),
    String(found?.sources),
  );
  const result = await recorder.recoverOrphan(dir);
  assert.equal(result.mode, "voicecam");
  assert.match(result.microphone ?? "", /voz\.wav$/);
  assert.equal(result.cameraParts?.length, 1);
  assert.equal(result.cameraParts?.[0].at, 0);
});

/**
 * The native route of the computer's sound (main/nativeHelper.ts LoopbackClient) stood in for:
 * a WAV on the shared clock from `first`, with a beep 0.5 s in, written when it is stopped.
 */
class FakeLoopback extends EventEmitter<{
  first: [number];
  beat: [{ e: "ahb"; t: number; n: number; fill: number; drop: number }];
  end: [number];
  failure: [Error];
}> {
  private origin = 0;
  private readonly file: string;
  constructor(file: string) {
    super();
    this.file = file;
  }
  async start(): Promise<void> {
    this.origin = qpc();
    setTimeout(() => this.emit("first", this.origin), 0);
  }
  async stop(): Promise<void> {
    const end = qpc();
    const frames = Math.round(((end - this.origin) / 1000) * 48000);
    const data = Buffer.alloc(frames * 4);
    for (let i = 24000; i < Math.min(frames, 24000 + 9600); i++) {
      const v = Math.round(12000 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
      data.writeInt16LE(v, i * 4);
      data.writeInt16LE(v, i * 4 + 2);
    }
    const h = Buffer.alloc(44);
    h.write("RIFF", 0);
    h.writeUInt32LE(36 + data.length, 4);
    h.write("WAVEfmt ", 8);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(2, 22);
    h.writeUInt32LE(48000, 24);
    h.writeUInt32LE(192000, 28);
    h.writeUInt16LE(4, 32);
    h.writeUInt16LE(16, 34);
    h.write("data", 36);
    h.writeUInt32LE(data.length, 40);
    await writeFile(this.file, Buffer.concat([h, data]));
    this.emit("end", this.origin + (frames / 48000) * 1000);
  }
  async kill(): Promise<void> {}
}

test("the native route's computer sound goes in the journal and lines up with the take", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-native-system-"));
  const loopbacks: FakeLoopback[] = [];
  const session = new RecordingSession({
    opts: {
      fps: 30,
      microphone: "Fake Mic",
      systemAudio: true,
      systemAudioRoute: "native",
    },
    monitor: null,
    dir,
    ffmpeg: FFMPEG,
    encoder: null,
    hook: null,
    loopback: (file) => {
      const fake = new FakeLoopback(file);
      loopbacks.push(fake);
      return fake;
    },
  });
  try {
    await session.start();
    await wait(1500);
    const saved = await session.stop();
    assert.equal(loopbacks.length, 1);
    assert.ok(saved.systemAudio, JSON.stringify(saved));
    const replay = replayJournal(await readFile(join(dir, JOURNAL_FILE), "utf8"));
    assert.equal(replay.parts.system[0]?.file, "sistema-0.wav");
    assert.ok(replay.parts.system[0]?.end !== undefined);
    assert.ok(Math.abs((await probe(saved.systemAudio)).duration - saved.duration) < 0.15);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a native capture of the computer's sound that stops is a warning: the take goes on", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-native-system-fails-"));
  let fake: FakeLoopback | undefined;
  const session = new RecordingSession({
    opts: { fps: 30, microphone: "Fake Mic", systemAudio: true, systemAudioRoute: "native" },
    monitor: null,
    dir,
    ffmpeg: FFMPEG,
    encoder: null,
    hook: null,
    loopback: (file) => {
      fake = new FakeLoopback(file);
      return fake;
    },
  });
  const events: RecorderEvent[] = [];
  session.on("event", (e) => events.push(e));
  try {
    await session.start();
    await wait(300);
    fake?.emit("failure", new Error("o Windows recusou"));
    assert.equal(session.status().phase, "recording");
    const saved = await session.stop();
    assert.ok(saved.microphone);
    assert.match(
      events.map((e) => e.message).join("\n"),
      /O áudio do PC parou \(o Windows recusou\)/,
    );
    assert.match(saved.warnings?.join("\n") ?? "", /O áudio do PC parou: o Windows recusou/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
