import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { FRAGMENTED_MP4 } from "../src/shared/captureArgs.ts";
import { parseLoopbackLine } from "../src/shared/helperProtocol.ts";
import { JOURNAL_FILE } from "../src/shared/recordingJournal.ts";

/**
 * The computer's sound on the native route (native/helper/AudioLoopback.cs): its lines, a WAV
 * part finalized like any part of a take (also one cut short by a crash, with the open-ended
 * header the helper keeps while recording) and, on Windows with the helper built, the helper
 * itself recording a few seconds (it only listens: nothing is played).
 */
const appDir = fileURLToPath(new URL("..", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "ediaula-system-loopback-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { isPackaged: false, getAppPath: () => ${JSON.stringify(appDir)}, getPath: () => ${JSON.stringify(root)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { FFMPEG, probe, run } = await import("../src/main/ffmpeg.ts");
const { finalizeTake } = await import("../src/main/recording/finalize.ts");
const { LoopbackClient, helperPath, processLoopbackAvailable, qpc } = await import(
  "../src/main/nativeHelper.ts"
);
hooks.deregister();
after(() => rm(root, { recursive: true, force: true }));

const RATE = 48000;

/** 16-bit stereo WAV header; sizes 0xFFFFFFFF say "until the end of the file". */
function wavHeader(dataBytes = 0xffffffff): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(dataBytes === 0xffffffff ? 0xffffffff : dataBytes + 36, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

/** `seconds` of silence with a 1 kHz beep of 0.2 s at `beep` seconds, stereo 16-bit. */
function pcm(seconds: number, beep: number): Buffer {
  const frames = Math.round(seconds * RATE);
  const out = Buffer.alloc(frames * 4);
  const from = Math.round(beep * RATE);
  for (let i = from; i < Math.min(frames, from + RATE / 5); i++) {
    const v = Math.round(12000 * Math.sin((2 * Math.PI * 1000 * i) / RATE));
    out.writeInt16LE(v, i * 4);
    out.writeInt16LE(v, i * 4 + 2);
  }
  return out;
}

/** First moment (s) the sound goes over a level, decoded at 8 kHz mono. */
async function onset(path: string): Promise<number> {
  const chunks: Buffer[] = [];
  await run(FFMPEG, ["-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], {
    onStdout: (chunk) => chunks.push(chunk),
  });
  const data = Buffer.concat(chunks);
  for (let i = 0; i + 1 < data.length; i += 2)
    if (Math.abs(data.readInt16LE(i)) > 3000) return i / 2 / 8000;
  return Number.NaN;
}

test("the loopback lines are read by their schema; anything else is left out", () => {
  assert.deepEqual(
    parseLoopbackLine('{"e":"aready","t":12.5,"pid":40,"v":"0.1.0","rate":48000,"ch":2}'),
    { e: "aready", t: 12.5, pid: 40, v: "0.1.0", rate: 48000, ch: 2 },
  );
  assert.deepEqual(parseLoopbackLine('{"e":"afirst","t":12.5}'), { e: "afirst", t: 12.5 });
  assert.equal(parseLoopbackLine('{"e":"ahb","t":13,"n":24000,"fill":0,"drop":12}')?.e, "ahb");
  assert.deepEqual(parseLoopbackLine('{"e":"aend","t":20,"n":360000}'), {
    e: "aend",
    t: 20,
    n: 360000,
  });
  assert.equal(parseLoopbackLine('{"e":"aerror","t":1,"msg":"recusou"}')?.e, "aerror");
  // Another rate, an unknown field, a hook line or broken JSON are not the loopback protocol.
  assert.equal(
    parseLoopbackLine('{"e":"aready","t":1,"pid":4,"v":"x","rate":44100,"ch":2}'),
    undefined,
  );
  assert.equal(parseLoopbackLine('{"e":"afirst","t":1,"x":2}'), undefined);
  assert.equal(parseLoopbackLine('{"e":"hb","t":1}'), undefined);
  assert.equal(parseLoopbackLine("{"), undefined);
});

/** A take of 3 s by the microphone, with the computer's sound starting 0.5 s after it. */
async function take(name: string, system: Buffer, end: boolean): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await run(FFMPEG, [
    ...["-y", "-v", "error", "-f", "lavfi"],
    ...["-i", "anullsrc=channel_layout=mono:sample_rate=48000", "-t", "3"],
    ...["-c:a", "aac", ...FRAGMENTED_MP4, "-f", "mp4", join(dir, "microfone-0.m4a")],
  ]);
  await writeFile(join(dir, "sistema-0.wav"), system);
  const q = qpc();
  const lines = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: q - 100,
      fps: 30,
      monitor: null,
      region: null,
      encoder: null,
      sources: { screen: false, microphone: "Mic", camera: null, system: true, keys: false },
    },
    { k: "first", src: "mic", part: 0, qpc: q, file: "microfone-0.m4a" },
    { k: "first", src: "system", part: 0, qpc: q + 500, file: "sistema-0.wav" },
    ...(end ? [{ k: "end", src: "system", part: 0, qpc: q + 3000 }] : []),
    { k: "stop", qpc: q + 3000 },
  ];
  await writeFile(join(dir, JOURNAL_FILE), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  return dir;
}

test("a WAV part of the native route lines up with the take like the other sound parts", async () => {
  const body = pcm(2.5, 1);
  const dir = await take("clean", Buffer.concat([wavHeader(body.length), body]), true);
  const result = await finalizeTake({ dir });
  assert.ok(result.systemAudio, JSON.stringify(result));
  assert.ok(Math.abs((await probe(result.systemAudio)).duration - result.duration) < 0.1);
  // The beep, 1 s into the part that began 0.5 s into the take.
  assert.ok(Math.abs((await onset(result.systemAudio)) - 1.5) < 0.05);
  // Lined up and checked: the part goes.
  assert.equal(existsSync(join(dir, "sistema-0.wav")), false);
});

test("a WAV part cut short by a crash (open-ended header, half a sample) is still read", async () => {
  const body = pcm(2.5, 1);
  const cut = Buffer.concat([wavHeader(), body.subarray(0, body.length - 4 * 4800 - 3)]);
  const dir = await take("crash", cut, false);
  const result = await finalizeTake({ dir, suspect: "all" });
  assert.ok(result.systemAudio, JSON.stringify(result));
  // Silence where the part has nothing: the take keeps its length.
  assert.ok(Math.abs((await probe(result.systemAudio)).duration - result.duration) < 0.1);
  assert.ok(Math.abs((await onset(result.systemAudio)) - 1.5) < 0.05);
});

const helper = helperPath();
const skipHelper =
  process.platform !== "win32"
    ? "Windows only"
    : !existsSync(helper)
      ? "helper not built (run the package test script)"
      : (await processLoopbackAvailable(helper))
        ? false
        : "this Windows has no process loopback";

/** The data size the header says, and the bytes after the header. */
async function header(path: string): Promise<{ said: number; held: number }> {
  const file = await open(path, "r");
  try {
    const head = Buffer.alloc(44);
    await file.read(head, 0, 44, 0);
    return { said: head.readUInt32LE(40), held: (await stat(path)).size - 44 };
  } finally {
    await file.close();
  }
}

test("the helper records the computer's sound on the wall clock and closes its header", {
  skip: skipHelper,
}, async () => {
  const file = join(root, "real.wav");
  const client = new LoopbackClient({ excludePid: process.pid, file, executable: helper });
  let first: number | undefined;
  let end: number | undefined;
  let beats = 0;
  client.on("first", (t) => {
    first = t;
  });
  client.on("end", (t) => {
    end = t;
  });
  client.on("beat", () => beats++);
  const failures: Error[] = [];
  client.on("failure", (e) => failures.push(e));
  await client.start();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const stopAt = qpc();
  await client.stop();
  assert.deepEqual(failures, []);
  assert.ok(first !== undefined && end !== undefined);
  assert.ok(beats >= 2, `heartbeats: ${beats}`);
  // Whatever played (or nothing at all), the file reaches the moment it was stopped.
  assert.ok(Math.abs(end - stopAt) < 150, `end ${end} vs stop ${stopAt}`);
  const { said, held } = await header(file);
  assert.equal(said, held);
  assert.equal(said, client.frames * 4);
  assert.ok(Math.abs(said / 4 / RATE - (end - first) / 1000) < 0.002);
  assert.ok(Math.abs((await probe(file)).duration - (end - first) / 1000) < 0.05);
});

test("a helper killed while recording leaves a WAV FFmpeg reads to its end", {
  skip: skipHelper,
}, async () => {
  const file = join(root, "killed.wav");
  const client = new LoopbackClient({ excludePid: process.pid, file, executable: helper });
  await client.start();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await client.kill();
  const { said, held } = await header(file);
  assert.equal(said, 0xffffffff);
  assert.ok(held > RATE * 4 * 0.5, `only ${held} bytes`);
  const chunks: Buffer[] = [];
  await run(FFMPEG, ["-v", "error", "-i", file, "-f", "s16le", "-"], {
    onStdout: (chunk) => chunks.push(chunk),
  });
  // What was handed to Windows by the last flush (every second) is all there.
  assert.ok(Buffer.concat(chunks).length >= RATE * 4 * 0.8, "nothing decoded");
});
