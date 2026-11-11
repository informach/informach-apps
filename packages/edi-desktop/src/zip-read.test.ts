import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractZipEntry, readZipEntry, zipDirectory } from "./zip-read.ts";

/** A ZIP built by hand: each entry stored or deflated, with its CRC (or a wrong one). */
function zip(
  entries: { name: string; data: Buffer; deflate?: boolean; crc?: number; encrypted?: boolean }[],
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const body = e.deflate ? deflateRawSync(e.data) : e.data;
    const crc = e.crc ?? crc32(e.data);
    const flags = 0x0800 | (e.encrypted ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(e.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
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

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "edi-zip-read-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("reading one entry of a ZIP", () => {
  const voice = Buffer.from("RIFF voz da aula ".repeat(400));
  const lesson = Buffer.from(JSON.stringify({ version: 1, assets: [] }));

  it("copies a stored entry and a deflated one, byte for byte", async () => {
    const file = join(dir, "aula.zip");
    await writeFile(
      file,
      zip([
        { name: "aula.ediaula", data: lesson },
        { name: "media/voz.wav", data: voice, deflate: true },
        { name: "media/vazio.json", data: Buffer.alloc(0) },
      ]),
    );
    const entries = await zipDirectory(file, 10);
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ["aula.ediaula", 0, lesson.length],
      ["media/voz.wav", 8, voice.length],
      ["media/vazio.json", 0, 0],
    ]);
    for (const [index, expected] of [lesson, voice, Buffer.alloc(0)].entries()) {
      const entry = entries[index];
      if (!entry) throw new Error("entry");
      const out = join(dir, `saida-${index}`);
      await extractZipEntry(file, entry, out);
      expect((await readFile(out)).equals(expected)).toBe(true);
      expect(existsSync(`${out}.part`)).toBe(false);
    }
  });

  it("reads an entry into memory with the same checks", async () => {
    const file = join(dir, "kit.zip");
    await writeFile(
      file,
      zip([
        { name: "kit/balao.svg", data: lesson, deflate: true },
        { name: "kit/ruim.svg", data: voice, crc: 99 },
      ]),
    );
    const [good, bad] = await zipDirectory(file, 10);
    if (!good || !bad) throw new Error("entries");
    expect((await readZipEntry(file, good)).equals(lesson)).toBe(true);
    await expect(readZipEntry(file, bad)).rejects.toThrow(/danificado/);
    await expect(readZipEntry(file, { ...good, size: 3 })).rejects.toThrow(/danificado/);
  });

  it("leaves nothing behind when the bytes are not the ones the directory says", async () => {
    const file = join(dir, "danificado.zip");
    await writeFile(file, zip([{ name: "media/voz.wav", data: voice, crc: 1234 }]));
    const [entry] = await zipDirectory(file, 10);
    if (!entry) throw new Error("entry");
    const out = join(dir, "danificado.wav");
    await expect(extractZipEntry(file, entry, out)).rejects.toThrow(/danificado/);
    expect(existsSync(out) || existsSync(`${out}.part`)).toBe(false);
    // A deflated entry that grows past its declared size is stopped as it streams.
    await expect(
      extractZipEntry(file, { ...entry, size: 10 }, join(dir, "bomba.wav")),
    ).rejects.toThrow(/danificado/);
  });

  it("refuses an encrypted entry and another compression", async () => {
    const file = join(dir, "senha.zip");
    await writeFile(file, zip([{ name: "media/voz.wav", data: voice, encrypted: true }]));
    const [entry] = await zipDirectory(file, 10);
    if (!entry) throw new Error("entry");
    await expect(extractZipEntry(file, entry, join(dir, "senha.wav"))).rejects.toThrow(/senha/);
    await expect(
      extractZipEntry(file, { ...entry, method: 12 }, join(dir, "bzip.wav")),
    ).rejects.toThrow(/compressão/);
  });

  it("stops when asked, without a file", async () => {
    const file = join(dir, "grande.zip");
    await writeFile(file, zip([{ name: "media/voz.wav", data: voice }]));
    const [entry] = await zipDirectory(file, 10);
    if (!entry) throw new Error("entry");
    const stop = new AbortController();
    stop.abort();
    const out = join(dir, "parado.wav");
    await expect(extractZipEntry(file, entry, out, stop.signal)).rejects.toThrow();
    expect(existsSync(out) || existsSync(`${out}.part`)).toBe(false);
  });
});
