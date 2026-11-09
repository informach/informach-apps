import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import {
  alphaWebmArgs,
  findCursorFile,
  frameArgs,
  previewArgs,
  readClicks,
} from "../../src/main/pipelineVideo";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_BIN ?? (require("ffmpeg-static") as string);
const ffprobe =
  process.env.FFPROBE_BIN ?? (require("@derhuerst/ffprobe-static") as { path: string }).path;

let dir = "";
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "edisvg-demo-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function probe(file: string, entries: string): Promise<string> {
  const { stdout } = await run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    entries,
    "-of",
    "csv=p=0",
    file,
  ]);
  return stdout.trim();
}

test("a recording of EdiAula: its cursor file beside it, the clicks in the video's pixels", async () => {
  const video = join(dir, "a2rpdde6b564e-a2rpdde6b564e-tela.mp4");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1280x720:rate=30:duration=6",
    "-pix_fmt",
    "yuv420p",
    video,
  ]);
  // The cursor was recorded at 2560×1440 (a screen at 200%); the video is 1280×720.
  await writeFile(
    join(dir, "a2rpdde6b564e-cursor.json"),
    JSON.stringify({
      version: 2,
      width: 2560,
      height: 1440,
      clicks: [
        [3.5, 1000, 400, 0, 0.05],
        [1.25, 200, 100, 0, 0.05],
      ],
    }),
  );
  const cursor = findCursorFile(video);
  assert.equal(cursor, join(dir, "a2rpdde6b564e-cursor.json"));
  assert.deepEqual(await readClicks(cursor as string, { width: 1280, height: 720 }), [
    { t: 1.25, x: 100, y: 50 },
    { t: 3.5, x: 500, y: 200 },
  ]);
  // A video from elsewhere has no cursor beside it.
  const other = join(dir, "outro.mp4");
  await writeFile(other, "");
  assert.equal(findCursorFile(other), null);

  // The light copy for the preview: the first 4 s, 540 high, without sound.
  const preview = join(dir, "previa.mp4");
  await run(ffmpeg, previewArgs(video, 4, preview));
  assert.equal(await probe(preview, "stream=codec_name,width,height"), "h264,960,540");
  assert.ok(Math.abs(Number(await probe(preview, "format=duration")) - 4) < 0.1);
  // A frame for the assistant.
  const frame = join(dir, "quadro.jpg");
  await run(ffmpeg, frameArgs(video, 2, frame));
  assert.equal(await probe(frame, "stream=codec_name,width,height"), "mjpeg,1280,720");
});

test("the transparent layer: PNG frames with alpha become a VP9 WebM that keeps the alpha", async () => {
  const frames = join(dir, "quadros");
  await mkdir(frames, { recursive: true });
  // Ten frames of a half-transparent red square, numbered from 0 as the PNG export names them.
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red@0.5:size=320x180:rate=10:duration=1,format=rgba",
    "-start_number",
    "0",
    join(frames, "quadro-%05d.png"),
  ]);
  const out = join(dir, "camada.webm");
  await run(ffmpeg, alphaWebmArgs(frames, 10, out));
  assert.ok((await stat(out)).size > 0);
  assert.equal(await probe(out, "stream=codec_name,width,height"), "vp9,320,180");
  // The alpha travels as a side stream that VP9 decoders read: the tag says it is there.
  assert.match(await probe(out, "stream_tags=alpha_mode"), /^1$/);
  // Decoded with libvpx, the pixels really are half transparent.
  const { stdout } = await run(
    ffmpeg,
    [
      "-v",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-i",
      out,
      "-frames:v",
      "1",
      "-vf",
      "format=rgba,crop=1:1:100:100",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer" },
  );
  const alpha = (stdout as unknown as Buffer)[3] ?? 0;
  assert.ok(alpha > 100 && alpha < 155, `alpha ${alpha}`);
  assert.throws(() => alphaWebmArgs(frames, 0, out), /FPS inválido/);
});
