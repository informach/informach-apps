import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createFileAuthority } from "@informach/edi-desktop/files";
import { createDesktopJobs, JOB_PRESERVATION_MS } from "@informach/edi-desktop/jobs";
import type { RunOptions } from "../src/main/export/renderSegments.ts";
import { exportLesson } from "../src/main/export-lesson.ts";
import { ffmpegVersion, filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { exportSpecSchema, projectSchema } from "../src/shared/project-schema.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";
import { subRip } from "../src/shared/webvtt.ts";

const project: Project = {
  version: 1,
  id: "review",
  name: "Review",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 128, height: 128, fps: 30 },
  assets: [],
  tracks: [],
  clips: [],
};
const cues = [{ start: 0, end: 1, text: "Olá & <tchau>" }];

/** A fake FFmpeg: writes "new output" to the file a command writes, like FFmpeg would. */
async function fakeRun(args: string[], _options?: RunOptions): Promise<string> {
  const path = args.at(-1);
  if (!path) throw new Error("Missing native output");
  if (path !== "-") await writeFile(path, "new output");
  return "";
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ediaula-export-safety-"));
  // The cache and the private work folders live away from the destination, as in the app.
  const side = await mkdtemp(join(tmpdir(), "ediaula-export-side-"));
  const primary = join(root, "lesson.mp4");
  const authority = createFileAuthority(["ediaula"]);
  const spec: ExportSpec = {
    outPath: primary,
    width: 128,
    height: 128,
    fps: 30,
    videoBitrate: 100,
    normalizeLoudness: false,
    encoder: "x264",
    captionCues: cues,
    thumbnail: true,
  };
  for (const extension of ["mp4", "srt", "vtt", "jpg"])
    await writeFile(join(root, `lesson.${extension}`), "previous");
  const deps = {
    assertRead: (path: string) => authority.assertRead(path),
    assertWrite: (path: string) => authority.assertWrite(path, false),
    assertRelatedExport: (primary: string, path: string) =>
      authority.assertRelatedExport(primary, path),
    fontsDirectory: root,
    filterScriptOption: "-/filter_complex" as const,
    ffmpegVersion: "ffmpeg version test",
    cacheDirectory: join(side, "cache"),
    workDirectory: join(side, "work"),
    check: () => {},
    run: fakeRun,
  };
  async function unchanged() {
    for (const extension of ["mp4", "srt", "vtt", "jpg"])
      assert.equal(await readFile(join(root, `lesson.${extension}`), "utf8"), "previous");
    assert.deepEqual((await readdir(root)).sort(), [
      "lesson.jpg",
      "lesson.mp4",
      "lesson.srt",
      "lesson.vtt",
    ]);
  }
  /** The private work folder of every export is gone once it ends, well or not. */
  async function workClean() {
    assert.deepEqual(await readdir(join(side, "work")), []);
  }
  const cleanup = async () => {
    await rm(root, { recursive: true });
    await rm(side, { recursive: true });
  };
  return { root, primary, authority, spec, deps, unchanged, workClean, cleanup };
}
test("export rejects an unselected destination without modifying existing bytes", async () => {
  const f = await fixture();
  try {
    await assert.rejects(() => exportLesson(project, f.spec, f.deps), /destino/);
    await f.unchanged();
  } finally {
    await f.cleanup();
  }
});
test("failed render or thumbnail and cancelled export preserve every previous output", async () => {
  for (const stage of ["render", "thumbnail", "cancel"]) {
    const f = await fixture();
    try {
      await f.authority.grantWrite(f.primary);
      let cancelled = false;
      await assert.rejects(
        () =>
          exportLesson(project, f.spec, {
            ...f.deps,
            check: () => {
              if (cancelled) throw new Error("Cancelled");
            },
            async run(args, options) {
              await fakeRun(args, options);
              if (stage === "render" || (stage === "thumbnail" && args.at(-1)?.endsWith(".jpg")))
                throw new Error("Native processing failed");
              if (stage === "cancel") cancelled = true;
              return "";
            },
          }),
        /Native processing failed|Cancelled/,
      );
      await f.unchanged();
      await f.workClean();
    } finally {
      await f.cleanup();
    }
  }
});
test("successful export commits all outputs and leaves no staging, filter or work files", async () => {
  const f = await fixture();
  try {
    await f.authority.grantWrite(f.primary);
    await exportLesson(project, f.spec, f.deps);
    assert.equal(await readFile(f.primary, "utf8"), "new output");
    // The main process writes both caption files from the cues.
    assert.equal(await readFile(join(f.root, "lesson.srt"), "utf8"), subRip(cues));
    assert.equal(
      await readFile(join(f.root, "lesson.vtt"), "utf8"),
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nOlá &amp; &lt;tchau&gt;\n",
    );
    assert.equal(await readFile(join(f.root, "lesson.jpg"), "utf8"), "new output");
    assert.deepEqual((await readdir(f.root)).sort(), [
      "lesson.jpg",
      "lesson.mp4",
      "lesson.srt",
      "lesson.vtt",
    ]);
    await f.workClean();
  } finally {
    await f.cleanup();
  }
});

test("an encoder that cannot open falls back along the chain and the x264 export is published", async () => {
  const f = await fixture();
  try {
    await f.authority.grantWrite(f.primary);
    const encoders: string[] = [];
    const messages: string[] = [];
    await exportLesson(
      project,
      { ...f.spec, encoder: "nvenc" },
      {
        ...f.deps,
        progress: (p) => p.message && messages.push(p.message),
        async run(args, options) {
          const codec = args[args.indexOf("-c:v") + 1];
          if (args.includes("-frames:v") && args.includes("-an")) encoders.push(codec);
          if (["h264_nvenc", "h264_amf", "h264_mf"].includes(codec))
            throw new Error(
              `[${codec} @ 0x1] OpenEncodeSessionEx failed: out of memory (10)\nError while opening encoder`,
            );
          return fakeRun(args, options);
        },
      },
    );
    assert.deepEqual(encoders, ["h264_nvenc", "h264_amf", "h264_mf", "libx264"]);
    assert.equal(await readFile(f.primary, "utf8"), "new output");
    assert.ok(
      messages.some((m) => /Continuando com x264/.test(m)),
      messages.join("\n"),
    );
    await f.workClean();
  } finally {
    await f.cleanup();
  }
});

test("a filter error fails the export without changing the encoder", async () => {
  const f = await fixture();
  try {
    await f.authority.grantWrite(f.primary);
    const encoders: string[] = [];
    await assert.rejects(
      () =>
        exportLesson(
          project,
          { ...f.spec, encoder: "nvenc" },
          {
            ...f.deps,
            async run(args, options) {
              if (args.includes("-frames:v") && args.includes("-an")) {
                encoders.push(args[args.indexOf("-c:v") + 1]);
                throw new Error(
                  "[Parsed_perspective_3 @ 0x1] Undefined constant\nError initializing filter 'perspective'\nError while opening encoder",
                );
              }
              return fakeRun(args, options);
            },
          },
        ),
      /Error initializing filter/,
    );
    assert.deepEqual(encoders, ["h264_nvenc"]);
    await f.unchanged();
    await f.workClean();
  } finally {
    await f.cleanup();
  }
});

test("license preservation deadline interrupts export without replacing any previous output", async () => {
  const f = await fixture();
  let licensed = true;
  let time = 0;
  const cancellation = new AbortController();
  const jobs = createDesktopJobs({
    assertAccess: () => {
      if (!licensed) throw new Error("restricted");
    },
    onStopError: (error) => {
      throw error;
    },
    monotonic: () => time,
    wallClock: () => time,
  });
  const job = jobs.begin({ stop: () => cancellation.abort() });
  try {
    await f.authority.grantWrite(f.primary);
    await assert.rejects(
      () =>
        exportLesson(project, f.spec, {
          ...f.deps,
          check: () => job.check(),
          async run(args, options) {
            await fakeRun(args, options);
            licensed = false;
            jobs.setAccess(false);
            time += JOB_PRESERVATION_MS;
            return "";
          },
        }),
      /preservation_expired/,
    );
    assert.equal(cancellation.signal.aborted, true);
    await f.unchanged();
  } finally {
    job.finish();
    await f.cleanup();
  }
});
test("export refuses an input file that was not selected", async () => {
  const f = await fixture();
  try {
    await f.authority.grantWrite(f.primary);
    const source = join(f.root, "unselected.png");
    await writeFile(source, "source");
    const document: Project = {
      ...project,
      assets: [
        {
          id: "a",
          path: source,
          name: "Image",
          kind: "image",
          duration: 0,
          width: 128,
          height: 128,
          fps: 0,
          hasVideo: true,
          hasAudio: false,
          size: 6,
          proxyStatus: "none",
        },
      ],
      tracks: [
        { id: "t", name: "Video", kind: "video", muted: false, hidden: false, locked: false },
      ],
      clips: [{ id: "c", assetId: "a", trackId: "t", start: 0, in: 0, duration: 1, volume: 1 }],
    };
    await assert.rejects(() => exportLesson(document, f.spec, f.deps), /Selecione/);
    assert.equal(await readFile(source, "utf8"), "source");
    assert.equal(await readFile(f.primary, "utf8"), "previous");
    await f.workClean();
  } finally {
    await f.cleanup();
  }
});
test("project validation preserves extension data, validates nested fields and rejects native paths in export options", () => {
  const legacy = {
    ...project,
    customExtension: { enabled: true },
    clips: [
      {
        id: "c",
        assetId: "a",
        trackId: "t",
        start: 0,
        in: 0,
        duration: 1,
        volume: 1,
        annotation: {
          kind: "balloon",
          color: "#ffffff",
          shadow: null,
          tailPoint: { x: -2, y: 3 },
          outline: { color: "#000000", width: 1, dash: true },
        },
      },
    ],
  };
  assert.deepEqual(projectSchema.parse(legacy), legacy);
  assert.equal(projectSchema.safeParse({ ...project, version: 2 }).success, false);
  assert.equal(
    projectSchema.safeParse({ ...project, settings: { width: Infinity, height: 128, fps: 30 } })
      .success,
    false,
  );
  assert.equal(
    projectSchema.safeParse({
      ...legacy,
      clips: [{ ...legacy.clips[0], transform: { x: 0, y: 0, scale: "wrong", opacity: 1 } }],
    }).success,
    false,
  );
  assert.equal(
    exportSpecSchema.safeParse({
      outPath: "selected.mp4",
      width: 128,
      height: 128,
      fps: 30,
      videoBitrate: 100,
      normalizeLoudness: false,
      encoder: "x264",
      assFile: "untrusted.ass",
    }).success,
    false,
  );
});
test("real FFmpeg export accepts selected inputs and commits video, captions and thumbnail", async () => {
  const f = await fixture();
  try {
    const require = createRequire(import.meta.url);
    const ffmpeg: unknown = require("ffmpeg-static");
    const ffprobe: unknown = require("@derhuerst/ffprobe-static");
    if (typeof ffmpeg !== "string" || typeof ffprobe !== "string")
      throw new Error("Native FFmpeg tools missing");
    const execute = promisify(execFile);
    const source = join(f.root, "source.png");
    await execute(
      ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=128x128",
        "-frames:v",
        "1",
        source,
      ],
      { windowsHide: true },
    );
    await f.authority.grantRead(source);
    await f.authority.grantWrite(f.primary);
    const document: Project = {
      ...project,
      assets: [
        {
          id: "image",
          name: "Selected image",
          path: source,
          kind: "image",
          duration: 0,
          width: 128,
          height: 128,
          fps: 0,
          hasVideo: true,
          hasAudio: false,
          size: 1,
          proxyStatus: "none",
        },
      ],
      tracks: [
        { id: "video", name: "Video", kind: "video", muted: false, hidden: false, locked: false },
      ],
      clips: [
        { id: "clip", assetId: "image", trackId: "video", start: 0, in: 0, duration: 1, volume: 1 },
      ],
    };
    await exportLesson(document, f.spec, {
      ...f.deps,
      filterScriptOption: await filterScriptOption(ffmpeg),
      ffmpegVersion: await ffmpegVersion(ffmpeg),
      async run(args, options) {
        const out = await execute(ffmpeg, args, { windowsHide: true });
        return options?.capture === "stderr" ? out.stderr : out.stdout;
      },
    });
    const probe = await execute(
      ffprobe,
      ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", f.primary],
      { windowsHide: true },
    );
    assert.match(probe.stdout, /"codec_type": "video"/);
    assert.match(probe.stdout, /"codec_type": "audio"/);
    assert.match(probe.stdout, /"width": 128/);
    assert.equal(await readFile(join(f.root, "lesson.srt"), "utf8"), subRip(cues));
    assert.match(await readFile(join(f.root, "lesson.vtt"), "utf8"), /^WEBVTT/);
    assert.deepEqual(
      (await readFile(join(f.root, "lesson.jpg"))).subarray(0, 2),
      Buffer.from([0xff, 0xd8]),
    );
    assert.ok(
      (await readdir(f.root)).every(
        (name) => !name.startsWith(".edi-output-") && !name.endsWith(".filter"),
      ),
    );
    await f.workClean();
  } finally {
    await f.cleanup();
  }
});
