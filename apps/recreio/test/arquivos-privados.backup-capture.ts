import type { FileHandle } from "node:fs/promises";
import { access, realpath } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { comArquivosPrivadosDoBackup } from "../scripts/backup/arquivos-privados";

describe("owned native backup files", () => {
  it("creates eight distinct private empty files and removes/closes all after success", async () => {
    let pasta = "";
    const handles: FileHandle[] = [];
    const result = await comArquivosPrivadosDoBackup(async (files) => {
      handles.push(...Object.values(files));
      pasta = dirname(await realpath(`/proc/self/fd/${files.dump.fd}`));
      const identities = new Set<string>();
      for (const file of handles) {
        const s = await file.stat({ bigint: true });
        expect(s.isFile()).toBe(true);
        expect(s.size).toBe(0n);
        expect(s.nlink).toBe(1n);
        expect(s.mode & 0o077n).toBe(0n);
        identities.add(`${s.dev}:${s.ino}`);
      }
      expect(identities.size).toBe(8);
      expect(Object.isFrozen(files)).toBe(true);
      await files.dump.writeFile("synthetic-sensitive-output");
      await files.dump.sync();
      const readback = Buffer.alloc(Buffer.byteLength("synthetic-sensitive-output"));
      const read = await files.dump.read(readback, 0, readback.length, 0);
      expect(read.bytesRead).toBe(readback.length);
      expect(readback.toString("utf8")).toBe("synthetic-sensitive-output");
      readback.fill(0);
      expect((await files.inventario.stat()).size).toBe(0);
      return { completed: true };
    });
    expect(result).toEqual({ completed: true });
    expect(pasta).toMatch(/^\/tmp\/recreio-job-[A-Za-z0-9]+$/);
    await expect(access(pasta)).rejects.toMatchObject({ code: "ENOENT" });
    for (const file of handles) await expect(file.stat()).rejects.toMatchObject({ code: "EBADF" });
  });

  it("preserves the original phase error and still removes partial sensitive outputs", async () => {
    const failure = new Error("synthetic-owned-phase-failure");
    let pasta = "";
    await expect(
      comArquivosPrivadosDoBackup(async (files) => {
        pasta = dirname(await realpath(`/proc/self/fd/${files.cifrado.fd}`));
        await files.cifrado.writeFile("partial-synthetic-ciphertext");
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(pasta).toMatch(/^\/tmp\/recreio-job-[A-Za-z0-9]+$/);
    await expect(access(pasta)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not reuse or clean another still-owned directory", async () => {
    let outer = "",
      inner = "";
    await comArquivosPrivadosDoBackup(async (first) => {
      outer = dirname(await realpath(`/proc/self/fd/${first.dump.fd}`));
      await first.dump.writeFile("outer-synthetic");
      await comArquivosPrivadosDoBackup(async (second) => {
        inner = dirname(await realpath(`/proc/self/fd/${second.dump.fd}`));
        expect(inner).not.toBe(outer);
        expect((await first.dump.stat()).size).toBe(15);
        expect((await second.dump.stat()).size).toBe(0);
      });
      await expect(access(inner)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await first.dump.stat()).size).toBe(15);
      await access(outer);
    });
    await expect(access(outer)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
