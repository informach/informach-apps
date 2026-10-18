import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  truncate,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { intact, streamHeader } from "../src/main/export/durable.ts";
import { fontResolver } from "../src/main/export/fonts.ts";
import { FxAssets } from "../src/main/export/fxAssets.ts";
import { renderSegments, type SegmentJob, segmentKeys } from "../src/main/export/renderSegments.ts";
import { SegmentCache } from "../src/main/export/segmentCache.ts";
import { assFonts } from "../src/shared/export/fingerprint.ts";
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

const FFMPEG: string = createRequire(import.meta.url)("ffmpeg-static");
const ff = (args: string[]): void => {
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args], { stdio: "pipe" });
};

test("a cached file is whole: its structure, its size, and the parameter sets of a segment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-whole-"));
  try {
    const clip = (name: string, size: string): string => {
      const path = join(dir, name);
      ff(
        ["-f", "lavfi", "-i", `testsrc2=s=${size}:r=30:d=1`, "-pix_fmt", "yuv420p"].concat([
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          path,
        ]),
      );
      return path;
    };
    const a = clip("a.mp4", "160x90");
    const b = clip("b.mp4", "160x90");
    const c = clip("c.mp4", "320x180");
    const wav = join(dir, "s.wav");
    ff(["-f", "lavfi", "-i", "sine=d=0.5", "-c:a", "pcm_f32le", "-rf64", "auto", wav]);
    const png = join(dir, "p.png");
    ff(["-f", "lavfi", "-i", "color=c=red:s=16x16", "-frames:v", "1", png]);
    for (const [path, ext] of [
      [a, "mp4"],
      [wav, "wav"],
      [png, "png"],
    ] as const) {
      assert.ok(await intact(path, ext), path);
      // Cut off by a crash: not whole.
      const cut = join(dir, `cut.${ext}`);
      const bytes = await readFile(path);
      await writeFile(cut, bytes.subarray(0, bytes.length - 7));
      assert.ok(!(await intact(cut, ext)), cut);
    }
    // Same settings, same parameter sets; another size, others.
    assert.equal(await streamHeader(a), await streamHeader(b));
    assert.notEqual(await streamHeader(a), await streamHeader(c));

    // The cache adopts only whole files it does not know, and drops one whose size changed.
    const segments = join(dir, "segments");
    await mkdir(segments);
    const key = (i: number): string => String(i).padStart(64, "0");
    await writeFile(join(segments, `${key(1)}.mp4`), await readFile(a));
    await writeFile(join(segments, `${key(2)}.mp4`), (await readFile(a)).subarray(0, 900));
    const cache = new SegmentCache(segments);
    const adopted = await cache.get(key(1), "mp4");
    assert.ok(adopted);
    assert.equal(await cache.header(adopted), await streamHeader(a));
    cache.release([adopted]);
    assert.equal(await cache.get(key(2), "mp4"), null);
    assert.ok(!(await readdir(segments)).includes(`${key(2)}.mp4`));
    await truncate(join(segments, `${key(1)}.mp4`), 500);
    assert.equal(await cache.get(key(1), "mp4"), null, "a file whose size changed is dropped");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("the cache takes at most a quarter of the space the disk leaves it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-room-"));
  try {
    // 100 bytes free and 40 held: room for 35, so two of four entries of 10 bytes go.
    let clock = 0;
    const cache = new SegmentCache(
      dir,
      1e9,
      () => ++clock,
      async () => 100,
    );
    await cache.load();
    const key = (i: number): string => String(i).padStart(64, "0");
    for (let i = 0; i < 4; i++) {
      await writeFile(cache.partPath(key(i), "mp4"), "0123456789");
      cache.release([await cache.commit(key(i), "mp4")]);
    }
    assert.equal(await cache.prune(), 10);
    assert.equal(cache.size, 30);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("a cancelled export lets go of the segments it read", async () => {
  const s = await setup();
  try {
    const first = s.job(s.project);
    s.cache.release(await renderSegments(first));
    // Half of them gone: the next export reads the others from the cache, then is cancelled.
    const files = (await readdir(join(s.side, "segments"))).filter((f) => f.endsWith(".mp4"));
    for (const f of files.slice(0, files.length / 2)) await rm(join(s.side, "segments", f));
    const stop = new AbortController();
    const job = s.job(s.project);
    await assert.rejects(() =>
      renderSegments({
        ...job,
        signal: stop.signal,
        run: async (args) => {
          stop.abort(new Error("Cancelado"));
          return job.run(args);
        },
      }),
    );
    // Nothing is pinned any more: clearing the cache removes every entry.
    await s.cache.clear();
    assert.equal(s.cache.size, 0);
  } finally {
    await rm(s.side, { recursive: true });
  }
});

test("the fonts of burned captions are part of the key: their files, bundled or in the system", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-fonts-"));
  try {
    const bundled = join(dir, "bundle");
    const system = join(dir, "Windows", "Fonts");
    await mkdir(bundled, { recursive: true });
    await mkdir(system, { recursive: true });
    for (const name of ["Inter-400.ttf", "Inter-700.ttf"])
      await writeFile(join(bundled, name), "f");
    for (const name of ["segoeui.ttf", "segoeuib.ttf", "arial.ttf", "notes.txt"])
      await writeFile(join(system, name), "f");
    const resolve = fontResolver({
      bundled: async () => ({
        dir: bundled,
        families: [
          {
            family: "Inter",
            group: "Limpa",
            files: [
              { weight: 400, file: "Inter-400.ttf" },
              { weight: 700, file: "Inter-700.ttf" },
            ],
          },
        ],
      }),
      system: [system, join(dir, "missing")],
    });
    assert.deepEqual(
      await resolve(["Inter", "Segoe UI"]),
      [
        join(bundled, "Inter-400.ttf"),
        join(bundled, "Inter-700.ttf"),
        join(system, "segoeui.ttf"),
        join(system, "segoeuib.ttf"),
      ].sort(),
    );
    assert.deepEqual(
      assFonts(
        "Style: Cap,Segoe UI,40,&H0\nStyle: Key,Inter,30,&H0\nDialogue: 0,0:00:00.00,0:00:01.00,Cap,,0,0,0,,{\\fnBangers}Oi",
      ),
      ["Bangers", "Inter", "Segoe UI"],
    );

    // A segment with captions renders anew when one of their font files changes.
    const s = await setup();
    try {
      const ass = [
        "[V4+ Styles]",
        "Style: Cap,Segoe UI,40,&H0",
        "[Events]",
        "Dialogue: 0,0:00:01.00,0:00:02.00,Cap,,0,0,0,,Olá",
      ].join("\n");
      const job = { ...s.job(s.project), fontFiles: resolve };
      job.spec = { ...job.spec, burnAss: ass };
      const before = await segmentKeys(job);
      await utimes(join(system, "segoeui.ttf"), new Date(), new Date(Date.now() + 5000));
      const after = await segmentKeys(job);
      assert.notEqual(after[0], before[0], "the segment with the caption");
      assert.equal(after.at(-1), before.at(-1), "a segment without captions keeps its key");
    } finally {
      await rm(s.side, { recursive: true });
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});
