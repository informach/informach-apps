import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import {
  cancelDelivery,
  deliveryFrame,
  finishDelivery,
  startDelivery,
  writeDelivery,
} from "../../src/main/lessonDelivery";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_BIN ?? (require("ffmpeg-static") as string);
const ffprobe =
  process.env.FFPROBE_BIN ?? (require("@derhuerst/ffprobe-static") as { path: string }).path;

let inbox = "";
before(async () => {
  inbox = await mkdtemp(join(tmpdir(), "edisvg-entrega-"));
});
after(async () => {
  await rm(inbox, { recursive: true, force: true });
});

/** A 32×32 RGBA frame: the left half opaque red, the right half transparent. */
function frame(): Uint8Array {
  const out = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 16; x++) out.set([220, 30, 40, 255], (y * 32 + x) * 4);
  return out;
}

/** The RGBA of a pixel of the first frame, decoded with libvpx when it is a WebM (keeps alpha). */
async function pixel(file: string, x: number, y: number): Promise<number[]> {
  const { stdout } = await run(
    ffmpeg,
    [
      ...(file.endsWith(".webm") ? ["-c:v", "libvpx-vp9"] : []),
      "-v",
      "error",
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `crop=2:2:${x}:${y},format=rgba`,
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer" },
  );
  return [...(stdout as Buffer).subarray(0, 4)];
}

const spec = (kind: "game-scene" | "screen-demo") => ({
  lessonId: "pgte1jhfsnary",
  clipId: `animation-${kind}`,
  kind,
  width: 32,
  height: 32,
  fps: 30,
  frames: 6,
});

test("a demonstration goes as a WebM with transparency, a scene as an MP4, frame by frame", async () => {
  const files: string[] = [];
  for (const kind of ["screen-demo", "game-scene"] as const) {
    const id = await startDelivery(ffmpeg, inbox, spec(kind), 1_731_000_000_000);
    for (let i = 0; i < 6; i++) await deliveryFrame(id, frame());
    files.push(await finishDelivery(id));
  }
  assert.deepEqual(files, [
    "animation-screen-demo-1731000000000.webm",
    "animation-game-scene-1731000000000.mp4",
  ]);
  const folder = join(inbox, "pgte1jhfsnary");
  const [webm, mp4] = files.map((name) => join(folder, name)) as [string, string];
  const probe = async (file: string) =>
    (
      await run(ffprobe, [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,width,height,nb_read_frames:stream_tags=alpha_mode",
        "-count_frames",
        "-of",
        "json",
        file,
      ])
    ).stdout;
  const demo = JSON.parse(await probe(webm)).streams[0];
  assert.equal(demo.codec_name, "vp9");
  assert.equal(demo.tags?.alpha_mode, "1");
  assert.equal(Number(demo.nb_read_frames), 6);
  const scene = JSON.parse(await probe(mp4)).streams[0];
  assert.equal(scene.codec_name, "h264");
  assert.equal(Number(scene.nb_read_frames), 6);
  // The layer keeps its transparency; the scene is opaque.
  const [r, , , a] = await pixel(webm, 4, 10);
  assert.ok((r ?? 0) > 180 && a === 255, `opaque red ${r} ${a}`);
  assert.equal((await pixel(webm, 24, 10))[3], 0);
  assert.equal((await pixel(mp4, 24, 10))[3], 255);

  await writeDelivery(inbox, {
    version: 1,
    lessonId: "pgte1jhfsnary",
    sentAt: 1_731_000_000_000,
    items: [
      {
        clipId: "animation-screen-demo",
        kind: "screen-demo",
        file: files[0],
        name: "Narração · Demonstração",
        start: 489.717,
        duration: 0.2,
        section: 5,
      },
    ],
  });
  const manifest = JSON.parse(await readFile(join(folder, "envio.json"), "utf8"));
  assert.equal(manifest.items[0].file, files[0]);
});

test("frames of the wrong size, too many, or too few are refused; a cancel leaves nothing", async () => {
  const id = await startDelivery(ffmpeg, inbox, { ...spec("screen-demo"), lessonId: "outra" }, 1);
  await assert.rejects(deliveryFrame(id, new Uint8Array(10)), /tamanho errado/);
  await deliveryFrame(id, frame());
  await assert.rejects(finishDelivery(id), /Faltaram quadros/);
  const stopped = await startDelivery(
    ffmpeg,
    inbox,
    { ...spec("game-scene"), lessonId: "outra" },
    2,
  );
  await deliveryFrame(stopped, frame());
  await cancelDelivery(stopped);
  assert.deepEqual(await readdir(join(inbox, "outra")), []);
  await assert.rejects(startDelivery(ffmpeg, inbox, { ...spec("game-scene"), lessonId: "../x" }));
  await assert.rejects(
    writeDelivery(inbox, {
      version: 1,
      lessonId: "outra",
      sentAt: 3,
      items: [
        {
          clipId: "animation-x",
          kind: "game-scene",
          file: "animation-x-1731000000000.mp4",
          name: "x",
          start: 0,
          duration: 1,
          section: 0,
        },
      ],
    }),
    /não está na pasta da aula/,
  );
});
