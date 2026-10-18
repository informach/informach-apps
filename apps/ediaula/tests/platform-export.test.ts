import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import { thumbnailSecond } from "../src/main/export/pipeline.ts";
import type { RunOptions } from "../src/main/export/renderSegments.ts";
import { exportLesson } from "../src/main/export-lesson.ts";
import type { PlatformPackage } from "../src/shared/platformPackage.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";
import { subRip } from "../src/shared/webvtt.ts";

/**
 * The files that go to the platform beside the video: translated captions as <aula>.<lang>.srt
 * and .vtt, and <aula>.plataforma.json with the SHA-256 of the video as written. FFmpeg is faked
 * (it writes "new output" where a command writes), as in export-safety.
 */

/** A lesson of 20 s: one picture on screen (FFmpeg is faked, the file only has to be allowed). */
const lesson = (picture: string): Project => ({
  version: 1,
  id: "p",
  name: "Aula 3",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 128, height: 128, fps: 30 },
  assets: [
    {
      id: "img",
      name: "img",
      path: picture,
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
  tracks: [{ id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
  clips: [{ id: "c", assetId: "img", trackId: "v", start: 0, in: 0, duration: 20, volume: 1 }],
});

test("translated captions and the platform package go beside the video, named after it", async () => {
  const root = await mkdtemp(join(tmpdir(), "ediaula-platform-"));
  const side = await mkdtemp(join(tmpdir(), "ediaula-platform-side-"));
  try {
    const primary = join(root, "Aula 3.mp4");
    const authority = createFileAuthority(["ediaula"]);
    await authority.grantWrite(primary);
    const picture = join(side, "logo.png");
    await writeFile(picture, "png");
    await authority.grantRead(picture);
    const project = lesson(picture);
    const thumbAt: string[] = [];
    const cues = [{ start: 0, end: 1, text: "Olá, turma" }];
    const english = [{ start: 0, end: 1, text: "Hello, class" }];
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
      thumbnailAt: 12.5,
      translations: [
        { lang: "en", cues: english },
        // A translation with no text writes nothing.
        { lang: "es", cues: [{ start: 0, end: 1, text: "  " }] },
      ],
      platform: {
        lesson: "Aula 3",
        videoId: "F1P1-V03",
        title: "A Chave do Farol",
        chapters: [{ time: 3, title: "Abertura" }],
        quiz: [
          {
            question: "O que acende?",
            options: ["O farol", "O barco", "A costa", "O mar"],
            correct: 0,
            line: 1,
            source: "O farol acende.",
            reviewed: true,
          },
        ],
        thumbnail: { time: 12.5, title: "Farol" },
      },
    };
    await exportLesson(project, spec, {
      assertRead: (path) => authority.assertRead(path),
      assertWrite: (path) => authority.assertWrite(path, false),
      assertRelatedExport: (primary, path) => authority.assertRelatedExport(primary, path),
      fontsDirectory: root,
      filterScriptOption: "-/filter_complex",
      ffmpegVersion: "ffmpeg version test",
      cacheDirectory: join(side, "cache"),
      workDirectory: join(side, "work"),
      check: () => {},
      async run(args: string[], _options?: RunOptions) {
        const out = args.at(-1);
        if (!out) throw new Error("Missing native output");
        if (out.endsWith(".jpg")) thumbAt.push(args[args.indexOf("-ss") + 1]);
        if (out !== "-") await writeFile(out, "new output");
        return "";
      },
    });
    assert.deepEqual((await readdir(root)).sort(), [
      "Aula 3.en.srt",
      "Aula 3.en.vtt",
      "Aula 3.jpg",
      "Aula 3.mp4",
      "Aula 3.plataforma.json",
      "Aula 3.srt",
      "Aula 3.vtt",
    ]);
    assert.equal(await readFile(join(root, "Aula 3.en.srt"), "utf8"), subRip(english));
    assert.match(
      await readFile(join(root, "Aula 3.en.vtt"), "utf8"),
      /^WEBVTT\n\n00:00:00\.000 --> 00:00:01\.000\nHello, class/,
    );
    // The thumbnail is the frame chosen.
    assert.deepEqual(thumbAt, ["12.5"]);
    const pack = JSON.parse(
      await readFile(join(root, "Aula 3.plataforma.json"), "utf8"),
    ) as PlatformPackage;
    assert.equal(pack.videoId, "F1P1-V03");
    assert.equal(pack.video.file, "Aula 3.mp4");
    assert.equal(pack.video.sha256, createHash("sha256").update("new output").digest("hex"));
    assert.deepEqual(pack.thumbnail, { file: "Aula 3.jpg", time: 12.5, title: "Farol" });
    assert.deepEqual(pack.captions, [
      { lang: "pt-BR", srt: "Aula 3.srt", vtt: "Aula 3.vtt" },
      { lang: "en", srt: "Aula 3.en.srt", vtt: "Aula 3.en.vtt" },
    ]);
    // One chapter starting at 0:03 is not valid for the platform: left out, with the reason.
    assert.deepEqual(pack.chapters, []);
    assert.ok(pack.chapterProblems?.length);
    assert.equal(pack.quiz.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(side, { recursive: true, force: true });
  }
});

test("a video named like a translation of another video in the folder is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "ediaula-platform-name-"));
  try {
    await writeFile(join(root, "aula.mp4"), "video");
    const primary = join(root, "aula.en.mp4");
    const authority = createFileAuthority(["ediaula"]);
    await authority.grantWrite(primary);
    await assert.rejects(
      exportLesson(
        lesson(join(root, "aula.mp4")),
        {
          outPath: primary,
          width: 128,
          height: 128,
          fps: 30,
          videoBitrate: 100,
          normalizeLoudness: false,
          encoder: "x264",
        },
        {
          assertRead: (path) => authority.assertRead(path),
          assertWrite: (path) => authority.assertWrite(path, false),
          assertRelatedExport: (p, path) => authority.assertRelatedExport(p, path),
          fontsDirectory: root,
          filterScriptOption: "-/filter_complex",
          ffmpegVersion: "x",
          cacheDirectory: join(root, "cache"),
          workDirectory: join(root, "work"),
          check: () => {},
          run: async () => "",
        },
      ),
      /se confunde com as legendas traduzidas \(en\) de aula\.mp4/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the thumbnail second: the one chosen inside the lesson, else 30% of it", () => {
  assert.equal(thumbnailSecond({}, 100), 30);
  assert.equal(thumbnailSecond({ thumbnailAt: 12 }, 100), 12);
  assert.equal(thumbnailSecond({ thumbnailAt: 500 }, 100), 99.95);
});
