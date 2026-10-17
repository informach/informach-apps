import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createFileAuthority } from "@informach/edi-desktop/files";
import { createDesktopJobs, JOB_PRESERVATION_MS } from "@informach/edi-desktop/jobs";
import { exportLesson } from "../src/main/export-lesson.ts";
import { filterScriptOption } from "../src/main/ffmpeg-arguments.ts";
import { exportSpecSchema, projectSchema } from "../src/shared/project-schema.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";

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
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ediaula-export-safety-"));
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
    captions: "1\n00:00:00,000 --> 00:00:01,000\nOlá\n",
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
    check: () => {},
    async writeFilterScript(content: string) {
      const path = join(root, `${randomUUID()}.filter`);
      await writeFile(path, content);
      return path;
    },
    async run(args: string[]) {
      const path = args.at(-1);
      if (!path) throw new Error("Missing native output");
      await writeFile(path, "new output");
    },
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
  return { root, primary, authority, spec, deps, unchanged };
}
test("export rejects an unselected destination without modifying existing bytes", async () => {
  const f = await fixture();
  try {
    await assert.rejects(() => exportLesson(project, f.spec, f.deps), /destino/);
    await f.unchanged();
  } finally {
    await rm(f.root, { recursive: true });
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
            async run(args) {
              await f.deps.run(args);
              if (stage === "render" || (stage === "thumbnail" && args.at(-1)?.endsWith(".jpg")))
                throw new Error("Native processing failed");
              if (stage === "cancel") cancelled = true;
            },
          }),
        /Native processing failed|Cancelled/,
      );
      await f.unchanged();
    } finally {
      await rm(f.root, { recursive: true });
    }
  }
});
test("successful export commits all outputs and leaves no staging/filter files", async () => {
  const f = await fixture();
  try {
    await f.authority.grantWrite(f.primary);
    await exportLesson(project, f.spec, f.deps);
    assert.equal(await readFile(f.primary, "utf8"), "new output");
    assert.equal(await readFile(join(f.root, "lesson.srt"), "utf8"), f.spec.captions);
    assert.match(await readFile(join(f.root, "lesson.vtt"), "utf8"), /^WEBVTT/);
    assert.equal(await readFile(join(f.root, "lesson.jpg"), "utf8"), "new output");
    assert.deepEqual((await readdir(f.root)).sort(), [
      "lesson.jpg",
      "lesson.mp4",
      "lesson.srt",
      "lesson.vtt",
    ]);
  } finally {
    await rm(f.root, { recursive: true });
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
          async run(args) {
            await f.deps.run(args);
            licensed = false;
            jobs.setAccess(false);
            time += JOB_PRESERVATION_MS;
          },
        }),
      /preservation_expired/,
    );
    assert.equal(cancellation.signal.aborted, true);
    await f.unchanged();
  } finally {
    job.finish();
    await rm(f.root, { recursive: true });
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
  } finally {
    await rm(f.root, { recursive: true });
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
      run: (args) => execute(ffmpeg, args, { windowsHide: true }),
    });
    const probe = await execute(
      ffprobe,
      ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", f.primary],
      { windowsHide: true },
    );
    assert.match(probe.stdout, /"codec_type": "video"/);
    assert.match(probe.stdout, /"width": 128/);
    assert.equal(await readFile(join(f.root, "lesson.srt"), "utf8"), f.spec.captions);
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
  } finally {
    await rm(f.root, { recursive: true });
  }
});
