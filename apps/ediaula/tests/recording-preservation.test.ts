import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { withStagedFiles } from "@informach/edi-desktop/files";
import { createDesktopJobs, JOB_PRESERVATION_MS } from "@informach/edi-desktop/jobs";
import { FRAGMENTED_MP4 } from "../src/shared/captureArgs.ts";
import type { CaptureMonitor, RecorderEvent } from "../src/shared/recording.ts";
import { JOURNAL_FILE, replayJournal } from "../src/shared/recordingJournal.ts";

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
    args = [...args.slice(0, dshow - 1), '-re', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', ...args.slice(mic + 1)];
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
const { FFMPEG, probe, run } = await import("../src/main/ffmpeg.ts");
const { qpc } = await import("../src/main/nativeHelper.ts");
hooks.deregister();
after(async () => {
  try {
    await recorder.cancel();
  } finally {
    await rm(root, { recursive: true });
  }
});

type Capture = { kind: "screen" | "mic"; child: { kill: (signal?: string) => boolean } };
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
  // Finalized: not offered again.
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
