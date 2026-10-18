import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DEFAULT_KEY, keyId } from "../src/shared/chroma.ts";
import {
  confidenceToAlpha,
  keyFrames,
  maskFramesArgs,
  maskSize,
  PERSON_KEY,
  personKeyArgs,
} from "../src/shared/personKey.ts";

/**
 * "Remover fundo com IA local" (shared/personKey.ts): the pure parts, the model and licenses
 * shipped with the app, and the whole way on a synthetic video: the frames FFmpeg decodes for the
 * model, the model itself in Electron as the editor's worker runs it (a person-like silhouette must
 * give a mask that is not empty), and the encoder that writes the camera with that mask as alpha.
 */

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static") as string;
const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const SEGMENTATION = join(app, "resources", "segmentation");
const MODEL = join(SEGMENTATION, "selfie_segmenter.tflite");
const VISION = join(app, "node_modules", "@mediapipe", "tasks-vision");

test("o tamanho da máscara segue a forma do vídeo dentro de 256, com lados pares", () => {
  assert.deepEqual(maskSize(1280, 720), { width: 256, height: 144 });
  assert.deepEqual(maskSize(640, 480), { width: 256, height: 192 });
  assert.deepEqual(maskSize(1080, 1920), { width: 144, height: 256 });
  assert.deepEqual(maskSize(0, 0), { width: 256, height: 144 });
  assert.equal(keyFrames(10, 30), 300);
  assert.equal(keyFrames(2, 0), 60);
});

test("a confiança vira alfa com borda suave, sem passar de 0 a 255", () => {
  const out = new Uint8Array(7);
  confidenceToAlpha([0, 0.3, 0.4, 0.5, 0.6, 0.7, 1], out);
  assert.deepEqual([...out.slice(0, 2)], [0, 0]);
  assert.equal(out[3], 128);
  assert.ok(out[2] > 0 && out[2] < out[3] && out[4] > out[3] && out[4] < 255);
  assert.deepEqual([...out.slice(5)], [255, 255]);
});

test("a remoção por IA tem um cache próprio, que não se confunde com a por cor", () => {
  const color = keyId({ ...DEFAULT_KEY, color: "#00B140" });
  assert.notEqual(keyId(PERSON_KEY), color);
  // The color fields of the person key do not change its cache.
  assert.equal(keyId({ ...PERSON_KEY, color: "#123456", threshold: 0.9 }), keyId(PERSON_KEY));
});

test("o modelo e a biblioteca vão com a licença Apache 2.0 e o modelo confere", async () => {
  const sums = await readFile(join(SEGMENTATION, "SHA256SUMS"), "utf8");
  const digest = createHash("sha256")
    .update(await readFile(MODEL))
    .digest("hex");
  assert.equal(sums.trim(), `${digest}  selfie_segmenter.tflite`);
  const license = await readFile(join(SEGMENTATION, "LICENSE"), "utf8");
  assert.match(license, /^\s*Apache License\s+Version 2\.0, January 2004/);
  const manifest = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  const version = manifest.dependencies["@mediapipe/tasks-vision"];
  assert.match(version, /^\d+\.\d+\.\d+$/, "versão exata");
  const installed = JSON.parse(await readFile(join(VISION, "package.json"), "utf8"));
  assert.equal(installed.version, version);
  assert.equal(installed.license, "Apache-2.0");
});

/** Raw output of FFmpeg with these arguments. */
function ffmpeg(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err || `código ${code}`)),
    );
    child.stdin.on("error", () => undefined);
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

/**
 * Head with eyes and mouth, neck and shoulders, in skin and a dark shirt over a green wall, as a
 * webcam would see. Without the face the model at 256 pixels does not take it for a person.
 */
function silhouette(): string {
  const head = "lte(((X-320)/62)^2+((Y-175)/80)^2,1)";
  const neck = "lte(abs(X-320),28)*between(Y,230,310)";
  const body = "gt(Y,290)*lte(((X-320)/210)^2+((Y-560)/270)^2,1)";
  const hair = "lte(((X-320)/66)^2+((Y-150)/62)^2,1)*lt(Y,140)";
  const eyes = "(lte(((X-297)/9)^2+((Y-170)/6)^2,1)+lte(((X-343)/9)^2+((Y-170)/6)^2,1))";
  const mouth = "lte(((X-320)/18)^2+((Y-212)/5)^2,1)";
  // The figure sways a little, so the frames are not all the same.
  const sway = (e: string): string =>
    e.replace(/X-(\d+)/g, (_m, x: string) => `X-${x}-12*sin(2*PI*T)`);
  const pick = (h: number, s: number, b: number, lips: number, rest: string): string =>
    `if(${sway(eyes)},30,if(${sway(mouth)},${lips},if(${sway(hair)},${h},if(${sway(head)}+${sway(neck)},${s},if(${sway(body)},${b},${rest})))))`;
  return `geq=r='${pick(50, 224, 40, 150, "r(X,Y)")}':g='${pick(35, 172, 60, 70, "g(X,Y)")}':b='${pick(25, 138, 110, 70, "b(X,Y)")}'`;
}

test("a IA local acha a pessoa num vídeo sintético e o arquivo sai com alfa", {
  skip: process.platform !== "win32" ? "Windows only" : false,
  timeout: 120_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-person-key-test-"));
  try {
    const video = join(dir, "camera.mp4");
    const fps = 15;
    const seconds = 2;
    await ffmpeg([
      ...["-v", "error", "-y", "-f", "lavfi"],
      ...["-i", `color=c=0x2e7d32:s=640x480:d=${seconds}:r=${fps},format=rgb24`],
      ...["-vf", silhouette(), "-c:v", "libx264", "-pix_fmt", "yuv420p", video],
    ]);
    const media = { path: video, width: 640, height: 480, fps, duration: seconds };
    const m = maskSize(media.width, media.height);
    const total = keyFrames(media.duration, media.fps);

    // The frames the model sees, as the main process decodes them.
    const frames = await ffmpeg(maskFramesArgs(media));
    assert.equal(frames.length, total * m.width * m.height * 4, "quadros para a IA");
    const framesFile = join(dir, "frames.rgba");
    await writeFile(framesFile, frames);

    const confidenceFile = join(dir, "confidence.f32");
    const electron: unknown = require("electron");
    assert.equal(typeof electron, "string");
    const { stdout } = await run(
      String(electron),
      [
        join(here, "helpers", "person-key-harness.cjs"),
        `--frames=${framesFile}`,
        `--width=${m.width}`,
        `--height=${m.height}`,
        `--model=${MODEL}`,
        `--vision=${VISION}`,
        `--out=${confidenceFile}`,
      ],
      { windowsHide: true, timeout: 90_000 },
    );
    const line = stdout.split("\n").find((l) => l.startsWith("TIMES "));
    assert.ok(line, stdout);
    const timing = JSON.parse(line.slice("TIMES ".length)) as { load: number; times: number[] };
    const raw = await readFile(confidenceFile);
    const confidence = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    const pixels = m.width * m.height;
    assert.equal(confidence.length, total * pixels);
    const masks = new Uint8Array(total * pixels);
    confidenceToAlpha(confidence, masks);
    // The person is found: a good part of the frame, the head inside it and a corner out of it.
    let person = 0;
    for (const v of masks) if (v >= 128) person++;
    const share = person / masks.length;
    const head = masks[Math.round((175 / 480) * m.height) * m.width + m.width / 2];
    assert.ok(share > 0.05 && share < 0.8, `parte da pessoa no quadro: ${share}`);
    assert.ok(head > 128, `cabeça: ${head}`);
    assert.equal(masks[2 * m.width + 2], 0, "canto");
    const steady = timing.times.slice(3);
    const average = steady.reduce((s, t) => s + t, 0) / steady.length;
    console.log(
      `[IA local] ${m.width}×${m.height}: ${average.toFixed(1)} ms por quadro (${Math.round(1000 / average)} quadros por segundo), carga ${Math.round(timing.load)} ms, ${Math.round(share * 100)}% do quadro é pessoa`,
    );

    // The camera written with the masks as alpha: VP9 with an alpha channel that follows them.
    const out = join(dir, "camera-key.webm");
    await ffmpeg(personKeyArgs({ ...media, out }), Buffer.from(masks.buffer));
    const alpha = await ffmpeg([
      ...["-v", "error", "-c:v", "libvpx-vp9", "-i", out],
      ...["-vf", "alphaextract,scale=64:48", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    ]);
    assert.equal(alpha.length, total * 64 * 48, "quadros com alfa");
    const first = alpha.subarray(0, 64 * 48);
    assert.ok(first[2 * 64 + 2] < 16, `canto transparente: ${first[2 * 64 + 2]}`);
    assert.ok(first[Math.round((175 / 480) * 48) * 64 + 32] > 200, "cabeça opaca");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
