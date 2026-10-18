import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import { inspectPackage, unpackProject } from "../src/main/package.ts";
import { readZipDirectory, writeZip, zipDirectory, zipTail } from "../src/main/zip.ts";
import { PACKAGE_PROJECT, packPlan } from "../src/shared/projectPackage.ts";
import type { Asset, Project } from "../src/shared/types.ts";

/**
 * Opening a package that someone else made: every entry is checked before anything is written
 * (the reviewer's hand-made archives with names that leave the folder and a link), the paths
 * of the project must stay in the package, the caches it carries are dropped, and the ZIP64
 * directory is read with offsets past 4 GB.
 */

const windows = process.platform === "win32";
const dir = mkdtempSync(join(tmpdir(), "ediaula-pkg-"));

interface RawEntry {
  name: string;
  data: Buffer;
  /** Compression method written in the headers (8 = deflate, data left as is). */
  method?: number;
  /** Unix mode in the external attributes (made by Unix). */
  unixMode?: number;
}

/** A ZIP written byte by byte, with whatever names and attributes a test needs. */
function rawZip(entries: RawEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(e.method ?? 0, 8);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.unixMode ? (3 << 8) | 20 : 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.method ?? 0, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(e.unixMode ? (e.unixMode << 16) >>> 0 : 0, 38);
    central.writeUInt32LE(offset, 42);
    const block = Buffer.concat([local, name, e.data]);
    locals.push(block);
    centrals.push(Buffer.concat([central, name]));
    offset += block.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const media = (id: string, path: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path,
  kind: "video",
  duration: 1,
  width: 320,
  height: 180,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "ready",
  ...extra,
});

const lesson = (extra: Partial<Project> = {}, asset: Partial<Asset> = {}): Project => ({
  version: 1,
  id: "p-original",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 320, height: 180, fps: 30 },
  assets: [media("a1", "media/a1-tela.mp4", asset)],
  tracks: [{ id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false }],
  clips: [{ id: "c", assetId: "a1", trackId: "t", start: 0, in: 0, duration: 1, volume: 1 }],
  ...extra,
});

let count = 0;
/** A package with `project` and its screen file, written as a test file. */
function pack(project: unknown, more: RawEntry[] = []): string {
  const path = join(dir, `pacote-${++count}.zip`);
  writeFileSync(
    path,
    rawZip([
      { name: PACKAGE_PROJECT, data: Buffer.from(JSON.stringify(project), "utf8") },
      { name: "media/a1-tela.mp4", data: Buffer.from("video") },
      ...more,
    ]),
  );
  return path;
}

/** Nothing came out: the projects folder has no lesson in it. */
const nothingWritten = (into: string): void =>
  assert.deepEqual(existsSync(into) ? readdirSync(into) : [], []);

test("names that leave the folder, links and compressed entries are refused before writing", {
  skip: !windows,
}, async () => {
  const outside = join(dir, "fora");
  const cases: RawEntry[][] = [
    [{ name: "../up1.txt", data: Buffer.from("x") }],
    [{ name: "media/../../up2.txt", data: Buffer.from("x") }],
    [{ name: "/abs.txt", data: Buffer.from("x") }],
    [{ name: `${outside.replace(/\\/g, "/")}/drive.txt`, data: Buffer.from("x") }],
    [{ name: "media/../..\\back.txt", data: Buffer.from("x") }],
    // The reviewer's second archive: "media" itself a link (mode 120777) to somewhere else.
    [{ name: "media", data: Buffer.from(outside), unixMode: 0o120777 }],
    [{ name: "media/link.mp4", data: Buffer.from("../../fora"), unixMode: 0o120777 }],
    [{ name: "media/pasta/", data: Buffer.alloc(0), unixMode: 0o040755 }],
    [{ name: "media/z.mp4", data: Buffer.from("x"), method: 8 }],
    [{ name: "media/a1-tela.mp4", data: Buffer.from("again") }],
    [{ name: "media/con.", data: Buffer.from("x") }],
  ];
  for (const [i, more] of cases.entries()) {
    const into = join(dir, `projetos-${i}`);
    const zip = pack(lesson(), more);
    await assert.rejects(unpackProject(zip, into), /não é um pacote de aula/, more[0].name);
    nothingWritten(into);
  }
  assert.equal(existsSync(outside), false);
  assert.equal(existsSync(join(dir, "up1.txt")), false);
});

test("a hand-made package whose project points outside it is refused and leaves nothing", {
  skip: !windows,
}, async () => {
  const absolute = [
    lesson({}, { cursor: "C:\\Users\\Public\\cursor.json" }),
    lesson({}, { path: "..\\..\\Windows\\win.ini" }),
    lesson({
      voiceMasters: [
        {
          id: "vm",
          hash: "h",
          createdAt: 0,
          scope: "lesson",
          pieces: [
            { file: "C:\\Users\\Public\\voz.wav", label: "Aula", start: 0, end: 1, sourceMap: [] },
          ],
        },
      ],
    }),
    // Any field of the project, even one this version does not know.
    {
      ...lesson(),
      clips: [{ ...lesson().clips[0], picture: "\\\\servidor\\pasta\\x.png" }],
    },
  ];
  for (const [i, project] of absolute.entries()) {
    const into = join(dir, `recusa-${i}`);
    await assert.rejects(unpackProject(pack(project), into), /fora/);
    nothingWritten(into);
  }
});

test("the caches a package carries are dropped and its paths are in the folder", {
  skip: !windows,
}, async () => {
  const project = lesson(
    {
      voiceMasters: [
        {
          id: "vm",
          hash: "h",
          createdAt: 0,
          scope: "lesson",
          pieces: [{ file: "media/voz-vm-1.wav", label: "Aula", start: 0, end: 1, sourceMap: [] }],
        },
      ],
    },
    {
      thumb: "C:\\Users\\Public\\thumb.jpg",
      proxy: "C:\\Users\\Public\\proxy.mp4",
      waveform: "C:\\Users\\Public\\wave.json",
      keyed: "C:\\Users\\Public\\keyed.webm",
      motion: "C:\\Users\\Public\\motion.json",
      treated: { path: "C:\\Users\\Public\\voz.wav", preset: "teacher", version: 1 },
      filmstrip: {
        path: "C:\\Users\\Public\\strip.jpg",
        sheets: ["C:\\Users\\Public\\strip-2.jpg"],
        step: 1,
        width: 10,
        height: 10,
        columns: 1,
        count: 1,
      },
    } as Partial<Asset>,
  );
  const zip = pack(project, [{ name: "media/voz-vm-1.wav", data: Buffer.from("wav") }]);
  const into = join(dir, "aceita");
  const info = await inspectPackage(zip, into);
  assert.equal(info.files, 3);
  nothingWritten(into);
  const { folder, project: opened } = await unpackProject(zip, into);
  const a = opened.assets[0];
  for (const key of ["thumb", "proxy", "waveform", "keyed", "motion", "treated", "filmstrip"])
    assert.equal(Reflect.get(a, key), undefined, key);
  assert.equal(a.path, join(folder, "media", "a1-tela.mp4"));
  assert.equal(opened.voiceMasters?.[0].pieces[0].file, join(folder, "media", "voz-vm-1.wav"));
  assert.notEqual(opened.id, "p-original");
});

test("the ZIP64 directory is read with sizes and offsets past 4 GB", async () => {
  const GB = 1024 ** 3;
  const entries = [
    { name: PACKAGE_PROJECT, size: 100, offset: 0 },
    { name: "media/longa.mp4", size: 4.5 * GB, offset: 5 * GB, zip64: true },
    { name: "media/depois.mp4", size: 10, offset: 9 * GB + 600 * 1024 ** 2 },
  ];
  const cdOffset = 9 * GB + 700 * 1024 ** 2;
  const tail = zipTail(entries, cdOffset);
  const size = cdOffset + tail.length;
  // A virtual file of almost 10 GB: only its directory has bytes.
  const read = async (position: number, length: number): Promise<Buffer> => {
    const out = Buffer.alloc(length);
    const from = Math.max(position, cdOffset);
    if (from < position + length) tail.copy(out, from - position, from - cdOffset);
    return out;
  };
  const found = await readZipDirectory(read, size, 100);
  assert.deepEqual(
    found.map((e) => [e.name, e.size, e.offset]),
    entries.map((e) => [e.name, e.size, e.offset]),
  );
  await assert.rejects(readZipDirectory(read, size, 2), /3 arquivos/);
});

test("a package written with ZIP64 in every header reads back the same", {
  skip: !windows,
}, async () => {
  const zip = join(dir, "zip64.zip");
  await writeZip(
    zip,
    [
      { name: PACKAGE_PROJECT, data: Buffer.from(JSON.stringify(lesson()), "utf8") },
      { name: "media/a1-tela.mp4", data: Buffer.from("video") },
    ],
    { zip64: "always" },
  );
  const found = await zipDirectory(zip, 10);
  assert.deepEqual(
    found.map((e) => [e.name, e.size, e.method]),
    [
      [PACKAGE_PROJECT, Buffer.byteLength(JSON.stringify(lesson())), 0],
      ["media/a1-tela.mp4", 5, 0],
    ],
  );
  const { project } = await unpackProject(zip, join(dir, "zip64"));
  assert.equal(project.assets[0].path.endsWith("\\media\\a1-tela.mp4"), true);
});

test("packing carries the exported voices and the guided narration, or leaves out what is gone", () => {
  const piece = (file: string) => ({ file, label: "Aula", start: 0, end: 1, sourceMap: [] });
  const master = (id: string, file: string) => ({
    id,
    hash: "h",
    createdAt: 0,
    scope: "lesson" as const,
    pieces: [piece(file)],
  });
  const p = lesson({
    voiceMasters: [master("vm1", "C:\\aula\\voz-1.wav"), master("vm2", "C:\\sumiu\\voz-2.wav")],
    guided: {
      plans: [
        {
          version: 2,
          id: "g1",
          name: "Plano",
          mode: "screen",
          viewport: { width: 1280, height: 720 },
          steps: [],
          tempos: { move: 1, dwell: 1, after: 1, anticipation: 0 },
          audio: { path: "C:\\aula\\narracao.wav", duration: 3 },
        },
      ],
    },
  });
  const plan = packPlan(
    { ...p, assets: [media("a1", "C:\\aula\\tela.mp4")] },
    (f) => !f.includes("sumiu"),
  );
  assert.equal(plan.droppedVoices, 1);
  assert.deepEqual(
    plan.files.map((f) => f.name),
    ["media/a1-tela.mp4", "media/voz-vm1-1.wav", "media/narracao-g1.wav"],
  );
  assert.deepEqual(
    plan.project.voiceMasters?.map((m) => m.pieces[0].file),
    ["media/voz-vm1-1.wav"],
  );
  assert.equal(plan.project.guided?.plans[0].audio?.path, "media/narracao-g1.wav");
});
