import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFileAuthority } from "@informach/edi-desktop/files";
import {
  loadQueue,
  type QueueAccess,
  rememberExportFolder,
  removeOrphanOutputs,
  removeOrphanWork,
  type SavedItem,
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
/** The items the list on disk names, in order (each in a file of its own). */
async function savedItems(file: string): Promise<{ id: string; state: string }[]> {
  const index = JSON.parse(await readFile(file, "utf8")) as { version: number; items: string[] };
  assert.equal(index.version, 2);
  const dir = file.replace(/\.json$/, "");
  return Promise.all(
    index.items.map(async (name) => JSON.parse(await readFile(join(dir, name), "utf8"))),
  );
}
const texts = (items: unknown[]): string[] => items.map((i) => JSON.stringify(i));

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
    const notVideo = join(dir, "aula.mov");
    const before = createFileAuthority(["ediaula"]);
    await before.grantRead(media);
    await before.grantWrite(chosen);
    await before.grantWrite(notVideo);
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
      texts([
        item("ok", chosen, "exporting"),
        item("never-chosen", other, "waiting"),
        item("finished", chosen, "done"),
        // Only an .mp4 (or an .mp3 for a podcast) is an export's output.
        item("not-a-video", notVideo, "waiting"),
      ]),
      access(before),
    );
    const saved = await savedItems(file);
    assert.deepEqual(
      saved.map((i) => [i.id, i.state]),
      [["ok", "waiting"]],
    );
    // A new session: nothing is allowed until the queue is read back.
    const after = createFileAuthority(["ediaula"]);
    await assert.rejects(() => after.assertWrite(chosen, false));
    const loaded = await loadQueue(file, access(after));
    assert.ok(loaded);
    assert.equal(loaded.length, 1);
    assert.equal(JSON.parse(loaded[0]).id, "ok");
    assert.ok(await after.assertWrite(chosen, false));
    assert.ok(await after.assertRead(media));
    // Two saves at once: one after the other, the last one stays, no temporary file is left.
    await Promise.all([
      saveQueue(file, texts([item("first", chosen, "waiting")]), access(after)),
      saveQueue(file, texts([item("second", chosen, "waiting")]), access(after)),
    ]);
    assert.deepEqual(
      (await savedItems(file)).map((i) => i.id),
      ["second"],
    );
    // The item that left the queue left its file; no temporary file is left.
    assert.equal((await readdir(join(dir, "export-queue"))).length, 1);
    assert.deepEqual(
      [...(await readdir(dir)), ...(await readdir(join(dir, "export-queue")))].filter((n) =>
        n.includes("partial"),
      ),
      [],
    );
    // Nothing pending removes the list and the items.
    await saveQueue(file, [], access(after));
    assert.equal(await loadQueue(file, access(after)), null);
    assert.ok(!(await readdir(dir)).includes("export-queue"));
    // Damaged or of another version: not resumed, not kept.
    await writeFile(file, JSON.stringify([{ id: "x" }]));
    assert.equal(await loadQueue(file, access(after)), null);
    assert.ok(!(await readdir(dir)).includes("export-queue.json"));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("an item that cannot be resumed comes back with the reason, and nothing of it is allowed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-queue-gone-"));
  try {
    const media = join(dir, "tela.mp4");
    const kept = join(dir, "kept.mp4");
    await writeFile(media, "media");
    await writeFile(kept, "media");
    const file = join(dir, "export-queue.json");
    const item = (id: string, path: string, out: string) => ({
      id,
      project: lesson(path),
      spec: spec(out),
      captions: false,
      state: "waiting",
    });
    await writeFile(
      file,
      JSON.stringify([
        item("ok", kept, join(dir, "ok.mp4")),
        item("media-gone", join(dir, "apagado.mp4"), join(dir, "a.mp4")),
        item("folder-gone", kept, join(dir, "sumiu", "b.mp4")),
        item("tampered", kept, join(dir, "c.exe")),
      ]),
    );
    const files = createFileAuthority(["ediaula"]);
    // A queue kept in one file, as versions before kept it, is read too.
    const loaded = await loadQueue(file, access(files));
    assert.ok(loaded);
    const items = loaded.map((text): SavedItem => JSON.parse(text));
    assert.deepEqual(
      items.map((i) => [i.id, !!i.blocked]),
      [
        ["ok", false],
        ["media-gone", true],
        ["folder-gone", true],
        ["tampered", true],
      ],
    );
    assert.match(items[1].blocked ?? "", /apagado\.mp4/);
    assert.match(items[2].blocked ?? "", /pasta de destino/);
    assert.ok(await files.assertWrite(join(dir, "ok.mp4"), false));
    for (const out of ["a.mp4", "c.exe"])
      await assert.rejects(() => files.assertWrite(join(dir, out), false));
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
    const started = Date.now() + 1;
    await new Promise((r) => setTimeout(r, 20));
    // An export that began after the app opened keeps its staging folder.
    await mkdir(join(folder, ".edi-output-running"), { recursive: true });
    const errors: string[] = [];
    const options = { before: started, onError: (path: string) => errors.push(path) };
    assert.equal(await removeOrphanOutputs(list, options), 1);
    assert.deepEqual((await readdir(folder)).sort(), [
      ".edi-output-keep",
      ".edi-output-running",
      "aula.mp4",
    ]);
    assert.deepEqual(errors, []);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("work folders of exports that did not end are removed, a running one stays", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-work-"));
  try {
    await mkdir(join(dir, "export-old", "x"), { recursive: true });
    await writeFile(join(dir, "export-old", "x", "segment-0.txt"), "graph");
    await writeFile(join(dir, "notes.txt"), "not ours");
    const old = await stat(join(dir, "export-old"));
    await new Promise((r) => setTimeout(r, 20));
    await mkdir(join(dir, "export-running"));
    const running = await stat(join(dir, "export-running"));
    const created = (info: { birthtimeMs: number; mtimeMs: number }) =>
      info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;
    const oldAt = created(old);
    const runningAt = created(running);
    assert.ok(oldAt < runningAt, "fixture folders must have distinct creation times");
    const started = (oldAt + runningAt) / 2;
    const errors: string[] = [];
    const removed = await removeOrphanWork(dir, {
      before: started,
      onError: (path) => errors.push(path),
    });
    assert.equal(removed, 1);
    assert.deepEqual((await readdir(dir)).sort(), ["export-running", "notes.txt"]);
    assert.deepEqual(errors, []);
    assert.equal(
      await removeOrphanWork(join(dir, "none"), { before: started, onError: () => {} }),
      0,
    );
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
