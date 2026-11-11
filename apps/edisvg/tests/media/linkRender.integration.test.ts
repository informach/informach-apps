import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { readManifest } from "@informach/edi-link/node";
import {
  cancelRender,
  finishRender,
  registerLink,
  renderFrame,
  startRender,
} from "../../src/main/linkRender";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = process.env.FFMPEG_BIN ?? (require("ffmpeg-static") as string);

let root = "";
let project = "";
before(async () => {
  root = await mkdtemp(join(tmpdir(), "edisvg-vinculo-"));
  project = join(root, "Aula 3.edisvg");
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A 32×32 RGBA frame: the left half opaque red, the right half transparent. */
function frame(): Uint8Array {
  const out = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 16; x++) out.set([220, 30, 40, 255], (y * 32 + x) * 4);
  return out;
}

/** The RGBA of a pixel of the first frame, decoded with libvpx (it keeps the alpha). */
async function pixel(file: string, x: number, y: number): Promise<number[]> {
  const { stdout } = await run(
    ffmpeg,
    [
      "-c:v",
      "libvpx-vp9",
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

const spec = (hash: string) => ({
  animationId: "animation-parte6",
  hash,
  width: 32,
  height: 32,
  fps: 10,
  frames: 5,
});

async function render(hash: string) {
  const id = await startRender(ffmpeg, project, "project-aula3", spec(hash));
  for (let i = 0; i < 5; i++) await renderFrame(id, frame());
  return finishRender(id, 1_731_000_000_000);
}

test("a linked animation renders beside the project as a WebM with transparency, in the manifest", async () => {
  // Not linked yet: nothing renders.
  await assert.rejects(
    startRender(ffmpeg, project, "project-aula3", spec("0000000000000001")),
    /não está vinculada/,
  );
  await registerLink(project, "project-aula3", {
    animationId: "animation-parte6",
    artboardId: "artboard-parte6",
    name: "Parte 6",
    requestId: "pedido-0001",
  });
  const item = await render("0000000000000001");
  const folder = join(root, "Aula 3 · renders");
  assert.equal(item.render?.file, "animation-parte6-0000000000000001.webm");
  assert.equal(item.render?.duration, 0.5);
  const manifest = await readManifest(folder);
  assert.equal(manifest?.projectId, "project-aula3");
  assert.deepEqual(
    manifest?.items.map((i) => [i.animationId, i.requestId, i.render?.hash]),
    [["animation-parte6", "pedido-0001", "0000000000000001"]],
  );
  const file = join(folder, "animation-parte6-0000000000000001.webm");
  assert.ok(((await pixel(file, 4, 4))[3] ?? 0) > 200, "the drawn half is opaque");
  assert.ok(((await pixel(file, 24, 4))[3] ?? 255) < 30, "the empty half stays transparent");
});

test("each new render replaces the one before in the manifest; two stay on the disk, never a half one", async () => {
  await render("0000000000000002");
  await render("0000000000000003");
  const folder = join(root, "Aula 3 · renders");
  assert.deepEqual((await readdir(folder)).sort(), [
    "animation-parte6-0000000000000002.webm",
    "animation-parte6-0000000000000003.webm",
    "vinculos.json",
  ]);
  assert.equal((await readManifest(folder))?.items[0]?.render?.hash, "0000000000000003");
  // Stopped half way: nothing of it stays, the manifest keeps the last whole render.
  const id = await startRender(ffmpeg, project, "project-aula3", spec("0000000000000004"));
  await renderFrame(id, frame());
  await cancelRender(id);
  assert.equal((await readdir(folder)).filter((n) => n.includes("0000000000000004")).length, 0);
  // Missing frames are refused, and no file is left.
  const short = await startRender(ffmpeg, project, "project-aula3", spec("0000000000000005"));
  await renderFrame(short, frame());
  await assert.rejects(finishRender(short), /Faltaram quadros/);
  assert.equal((await readManifest(folder))?.items[0]?.render?.hash, "0000000000000003");
});
