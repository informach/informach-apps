import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FxAssets } from "../src/main/export/fxAssets.ts";
import { renderSegments, type SegmentJob } from "../src/main/export/renderSegments.ts";
import { SegmentCache } from "../src/main/export/segmentCache.ts";
import { exportProject, frameRate } from "../src/shared/export/frames.ts";
import { planSegments } from "../src/shared/export/segments.ts";
import { clipFrames } from "../src/shared/export/videoPlan.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";
import { syntheticLesson } from "./fixtures/lesson.ts";

const r = frameRate(30);
const spec: ExportSpec = {
  outPath: "C:/out/aula.mp4",
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: 8000,
  normalizeLoudness: false,
  encoder: "x264",
};

async function setup() {
  const side = await mkdtemp(join(tmpdir(), "ediaula-cache-"));
  const paths = {
    screen: join(side, "tela.mp4"),
    camera: join(side, "camera.mp4"),
    mic: join(side, "mic.wav"),
  };
  for (const path of Object.values(paths)) await writeFile(path, "media");
  const { project } = syntheticLesson({ minutes: 3, cuts: 24, ...paths });
  const cache = new SegmentCache(join(side, "segments"));
  const rendered: string[] = [];
  const run = async (args: string[]): Promise<string> => {
    const out = args.at(-1);
    if (!out) throw new Error("no output");
    if (args.includes("-an")) rendered.push(out);
    await writeFile(out, "segment");
    return "";
  };
  const job = (p: Project): SegmentJob => {
    const derived = exportProject(p, r);
    return {
      project: derived,
      spec,
      rate: r,
      windows: planSegments(derived, spec),
      encoder: "x264",
      concurrency: 3,
      threads: 4,
      cache,
      fx: new FxAssets(join(side, "fx"), run),
      work: side,
      media: () => undefined,
      filterScriptOption: "-/filter_complex",
      ffmpegVersion: "ffmpeg version test",
      run,
      slot: (work) => work(),
      checkInputs: async (plan) => plan.inputArgs,
      check: () => {},
      progress: () => {},
      signal: new AbortController().signal,
    };
  };
  return { side, paths, project, cache, rendered, job };
}

test("a second export renders no segment, and editing a clip renders only the segments showing it", async () => {
  const s = await setup();
  try {
    const first = s.job(s.project);
    const files = await renderSegments(first);
    assert.equal(s.rendered.length, first.windows.length);
    assert.ok(first.windows.length >= 8, `${first.windows.length} segments`);
    s.cache.release(files);

    s.rendered.length = 0;
    const again = await renderSegments(s.job(s.project));
    assert.equal(s.rendered.length, 0, "everything came from the cache");
    assert.deepEqual(again, files);
    s.cache.release(again);

    // A new border colour on one piece of the camera.
    const edited = structuredClone(s.project);
    const derived = exportProject(edited, r);
    const piece = derived.clips
      .filter((c) => c.trackId === "v2")
      .sort((a, b) => a.start - b.start)[5];
    // Pieces of a cut clip share their transform object; an edit gives the piece its own.
    const target = edited.clips.find((c) => c.id === piece.id);
    assert.ok(target?.transform);
    target.transform = { ...target.transform, border: "#3D6BFF" };
    const showing = first.windows.filter((w) => clipFrames(piece, r, w)).length;
    s.rendered.length = 0;
    s.cache.release(await renderSegments(s.job(edited)));
    assert.equal(s.rendered.length, showing);
    assert.ok(showing >= 1 && showing < first.windows.length);

    // A media file that changed on disk renders everything that shows it again.
    await utimes(s.paths.camera, new Date(), new Date(Date.now() + 5000));
    s.rendered.length = 0;
    s.cache.release(await renderSegments(s.job(s.project)));
    assert.equal(s.rendered.length, first.windows.length);
  } finally {
    await rm(s.side, { recursive: true });
  }
});

test("the cache keeps to its size, dropping the least recently used segments first", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-lru-"));
  try {
    let clock = 0;
    const cache = new SegmentCache(dir, 25, () => ++clock);
    await cache.load();
    const key = (i: number): string => String(i).padStart(64, "0");
    for (let i = 0; i < 4; i++) {
      await writeFile(cache.partPath(key(i), "mp4"), "0123456789");
      cache.release([await cache.commit(key(i), "mp4")]);
    }
    // Segment 0 is read again: 1 becomes the oldest.
    const reused = await cache.get(key(0), "mp4");
    assert.ok(reused);
    // Pinned while an export reads it: never pruned under it.
    assert.equal(await cache.prune(), 20);
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith(".mp4")).sort(), [
      `${key(0)}.mp4`,
      `${key(3)}.mp4`,
    ]);
    cache.release([reused]);
    // A leftover .part file is removed when the cache is opened again.
    await writeFile(join(dir, `${key(9)}.part.mp4`), "half");
    const reopened = new SegmentCache(dir, 25);
    assert.equal(await reopened.get(key(9), "mp4"), null);
    assert.ok(!(await readdir(dir)).some((f) => f.includes(".part.")));
    assert.ok(await reopened.get(key(3), "mp4"));
    assert.equal(await reopened.clear(), 10, "the one in use stays");
  } finally {
    await rm(dir, { recursive: true });
  }
});
