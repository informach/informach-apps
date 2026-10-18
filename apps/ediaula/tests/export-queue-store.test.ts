import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import {
  loadQueue,
  type QueueAccess,
  rememberExportFolder,
  removeOrphanOutputs,
  saveQueue,
} from "../src/main/export/exportQueueStore.ts";
import { concatList, ffmetadata } from "../src/shared/export/assemble.ts";
import { frameRate } from "../src/shared/export/frames.ts";
import { ExportQueue } from "../src/shared/exportQueue.ts";
import type { ExportSpec, Project } from "../src/shared/types.ts";

const lesson = (path: string): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 320, height: 180, fps: 30 },
  assets: [
    {
      id: "a",
      name: "tela",
      path,
      kind: "video",
      duration: 2,
      width: 320,
      height: 180,
      fps: 30,
      hasVideo: true,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    },
  ],
  tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
  clips: [{ id: "c", assetId: "a", trackId: "t", start: 0, in: 0, duration: 2, volume: 1 }],
});
const spec = (outPath: string): ExportSpec => ({
  outPath,
  width: 320,
  height: 180,
  fps: 30,
  videoBitrate: 2000,
  normalizeLoudness: true,
  encoder: "x264",
});
const access = (files: ReturnType<typeof createFileAuthority>): QueueAccess => ({
  canRead: (p) => files.canRead(p),
  canWrite: (p) => files.canWrite(p),
  grantRead: (p) => files.grantRead(p),
  grantWrite: (p) => files.grantWrite(p),
});

test("the queue kept between sessions holds only exports to chosen files, and allows them again", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-queue-"));
  try {
    const media = join(dir, "tela.mp4");
    await writeFile(media, "media");
    const chosen = join(dir, "aula.mp4");
    const other = join(dir, "outra.mp4");
    const before = createFileAuthority(["ediaula"]);
    await before.grantRead(media);
    await before.grantWrite(chosen);
    const file = join(dir, "export-queue.json");
    const item = (id: string, out: string, state: string) => ({
      id,
      project: lesson(media),
      spec: spec(out),
      captions: true,
      state,
    });
    await saveQueue(
      file,
      JSON.stringify([
        item("ok", chosen, "exporting"),
        item("never-chosen", other, "waiting"),
        item("finished", chosen, "done"),
      ]),
      access(before),
    );
    const saved = JSON.parse(await readFile(file, "utf8")) as { id: string; state: string }[];
    assert.deepEqual(
      saved.map((i) => [i.id, i.state]),
      [["ok", "waiting"]],
    );
    // A new session: nothing is allowed until the queue is read back.
    const after = createFileAuthority(["ediaula"]);
    await assert.rejects(() => after.assertWrite(chosen, false));
    const text = await loadQueue(file, access(after));
    assert.ok(text);
    assert.equal(JSON.parse(text).length, 1);
    assert.ok(await after.assertWrite(chosen, false));
    assert.ok(await after.assertRead(media));
    // Nothing pending removes the file.
    await saveQueue(file, "[]", access(after));
    assert.equal(await loadQueue(file, access(after)), null);
    // Damaged or of another version: not resumed, not kept.
    await writeFile(file, JSON.stringify([{ id: "x" }]));
    assert.equal(await loadQueue(file, access(after)), null);
    assert.ok(!(await readdir(dir)).includes("export-queue.json"));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("the shared queue reports its pending items when the list changes, not on every message", async () => {
  const saved: string[][] = [];
  let release: () => void = () => {};
  const queue = new ExportQueue(
    async (_item, _signal, status) => {
      status("preparing", "Preparando o cursor…");
      status("exporting", "Exportando…");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    () => {},
    (pending) => saved.push(pending.map((i) => i.id)),
  );
  queue.add({
    id: "a",
    project: lesson("C:/m/tela.mp4"),
    spec: spec("C:/o/a.mp4"),
    captions: false,
  });
  queue.add({
    id: "b",
    project: lesson("C:/m/tela.mp4"),
    spec: spec("C:/o/b.mp4"),
    captions: false,
  });
  await new Promise((r) => setTimeout(r, 0));
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(saved.slice(0, 3), [["a"], ["a", "b"], ["b"]]);
});

test("leftover staging folders beside past exports are removed, unless they hold backups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-orphans-"));
  try {
    const list = join(dir, "export-folders.json");
    const folder = join(dir, "Vídeos");
    await mkdir(join(folder, ".edi-output-abc", "outputs"), { recursive: true });
    await writeFile(join(folder, ".edi-output-abc", "outputs", "aula.mp4"), "partial");
    await mkdir(join(folder, ".edi-output-keep", "backups"), { recursive: true });
    await writeFile(join(folder, ".edi-output-keep", "backups", "0.backup"), "previous lesson");
    await writeFile(join(folder, "aula.mp4"), "lesson");
    await rememberExportFolder(list, folder);
    await rememberExportFolder(list, join(dir, "gone"));
    await rememberExportFolder(list, folder);
    assert.deepEqual(JSON.parse(await readFile(list, "utf8")), [folder, join(dir, "gone")]);
    assert.equal(await removeOrphanOutputs(list), 1);
    assert.deepEqual((await readdir(folder)).sort(), [".edi-output-keep", "aula.mp4"]);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("assembly: exact segment durations, and the title and chapters as FFMETADATA", () => {
  const r = frameRate(30);
  assert.equal(
    concatList(
      [
        { path: "C:\\cache\\a.mp4", frames: 451 },
        { path: "C:/cache/it's.mp4", frames: 300 },
      ],
      r,
    ),
    "ffconcat version 1.0\nfile 'C:/cache/a.mp4'\nduration 15.033333\nfile 'C:/cache/it'\\''s.mp4'\nduration 10\n",
  );
  assert.equal(
    ffmetadata(
      {
        title: "Aula 3: frações; parte=1",
        chapters: [
          { time: 65, title: "Exercícios" },
          { time: 0, title: "Abertura" },
          { time: 900, title: "Depois do fim" },
        ],
      },
      120,
    ),
    ";FFMETADATA1\ntitle=Aula 3: frações\\; parte\\=1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=65000\ntitle=Abertura\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=65000\nEND=120000\ntitle=Exercícios\n",
  );
  assert.equal(ffmetadata(undefined, 10), null);
});
