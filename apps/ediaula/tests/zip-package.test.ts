import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { packProject, unpackProject } from "../src/main/package.ts";
import { writeZip } from "../src/main/zip.ts";
import { PACKAGE_PROJECT, packPlan } from "../src/shared/projectPackage.ts";
import type { Asset, Project } from "../src/shared/types.ts";

/**
 * The packed lesson: a stored ZIP (ZIP64 when needed, and in every header when asked) that the
 * tar.exe of Windows reads back byte for byte, and a project whose paths point inside it.
 */

const TAR = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const windows = process.platform === "win32" && existsSync(TAR);
const dir = mkdtempSync(join(tmpdir(), "ediaula-zip-"));

const bytes = (n: number, seed: number): Buffer => {
  const b = Buffer.alloc(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    b[i] = s >>> 24;
  }
  return b;
};

for (const zip64 of ["auto", "always"] as const)
  test(`tar.exe reads back what the ZIP writer stores (ZIP64 ${zip64})`, {
    skip: !windows,
  }, async () => {
    const big = join(dir, `big-${zip64}.bin`);
    writeFileSync(big, bytes(3 * 1024 * 1024 + 17, 7));
    const out = join(dir, `pack-${zip64}.zip`);
    await writeZip(
      out,
      [
        { name: "aula.ediaula", data: Buffer.from('{"ok":true}', "utf8") },
        { name: "media/a1-Gravação da tela.bin", path: big },
        { name: "media/vazio.txt", data: new Uint8Array(0) },
      ],
      { zip64 },
    );
    const raw = readFileSync(out);
    // ZIP64 end records are there when asked (signature 0x06064b50).
    assert.equal(raw.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06])), zip64 === "always");
    // The listing comes in the console's code page: only the names without accents are compared.
    const listed = execFileSync(TAR, ["-t", "-f", out]).toString().split(/\r?\n/).filter(Boolean);
    assert.equal(listed.length, 3);
    assert.ok(listed.includes("aula.ediaula") && listed.includes("media/vazio.txt"));
    const into = join(dir, `x-${zip64}`);
    await mkdir(into);
    execFileSync(TAR, ["-x", "-f", out, "-C", into]);
    assert.ok(
      readFileSync(join(into, "media", "a1-Gravação da tela.bin")).equals(readFileSync(big)),
    );
    assert.equal(readFileSync(join(into, "aula.ediaula"), "utf8"), '{"ok":true}');
    assert.equal(readFileSync(join(into, "media", "vazio.txt")).length, 0);
  });

test("a name that would leave the archive is refused", async () => {
  await assert.rejects(
    writeZip(join(dir, "bad.zip"), [{ name: "../fora.txt", data: new Uint8Array(1) }]),
  );
  assert.equal(existsSync(join(dir, "bad.zip")), false);
});

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

test("a lesson packed with its media opens on another folder with its paths there", {
  skip: !windows,
}, async () => {
  const screen = join(dir, "tela.mp4");
  const cursor = join(dir, "cursor.json");
  const transcript = join(dir, "tela.transcript.json");
  writeFileSync(screen, bytes(5000, 3));
  writeFileSync(cursor, '{"version":2}');
  writeFileSync(transcript, '{"version":1,"words":[]}');
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 320, height: 180, fps: 30 },
    assets: [
      media("a1", screen, {
        cursor,
        transcript,
        transcriptStatus: "ready",
        proxy: join(dir, "proxy.mp4"),
        thumb: join(dir, "thumb.jpg"),
      }),
      media("n1", join(dir, "cache", "nota.png"), { kind: "image", generated: "annotation" }),
    ],
    tracks: [{ id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false }],
    clips: [{ id: "c", assetId: "a1", trackId: "t", start: 0, in: 0, duration: 1, volume: 1 }],
  };
  const plan = packPlan(project);
  assert.deepEqual(
    plan.files.map((f) => f.name),
    ["media/a1-tela.mp4", "media/a1-cursor.json", "media/a1-transcricao.json"],
  );
  const read: string[] = [];
  const out = join(dir, "Aula.zip");
  const done = await packProject(project, out, async (p) => {
    read.push(p);
    return p;
  });
  assert.equal(done.files, 3);
  assert.deepEqual(read.sort(), [cursor, screen, transcript].sort());
  const { folder, project: opened } = await unpackProject(out, join(dir, "Projetos"));
  const a = opened.assets.find((x) => x.id === "a1");
  assert.ok(a);
  assert.equal(a.path, join(folder, "media", "a1-tela.mp4"));
  assert.ok(readFileSync(a.path).equals(readFileSync(screen)));
  assert.equal(readFileSync(a.cursor ?? "", "utf8"), '{"version":2}');
  assert.equal(a.proxy, undefined);
  assert.equal(a.thumb, undefined);
  assert.equal(a.proxyStatus, "none");
  // The packed project itself does not stay in the folder: the lesson is saved there by the app.
  assert.equal(existsSync(join(folder, PACKAGE_PROJECT)), false);
  // The editor's own picture keeps its path (it is drawn again when missing).
  assert.equal(opened.assets.find((x) => x.id === "n1")?.path, join(dir, "cache", "nota.png"));
  // Opening again goes to a folder of its own.
  const second = await unpackProject(out, join(dir, "Projetos"));
  assert.notEqual(second.folder, folder);
});
