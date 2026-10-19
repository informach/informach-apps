import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite, createFileAuthority, validateIpcValues } from "./files";

describe("selected-file capabilities", () => {
  it("permits explicitly selected document exports while rejecting executable extensions and restricted recovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-document-exports-"));
    expect(dirname(root)).toBe(resolve(tmpdir()));
    expect(basename(root)).toMatch(/^edi-document-exports-[a-zA-Z0-9]+$/);
    try {
      const files = createFileAuthority(["edipdf"]);
      for (const extension of ["csv", "txt", "bin", "docx", "xlsx", "tiff", "zip"]) {
        const path = join(root, `document.${extension}`);
        await expect(files.assertWrite(path, false)).rejects.toThrow();
        await files.grantWrite(path);
        await expect(files.assertWrite(path, false)).resolves.toBeTruthy();
        await expect(files.assertWrite(path, true)).rejects.toThrow("recuperação");
      }
      for (const extension of ["exe", "cmd", "ps1", "dll", "lnk"])
        await expect(files.grantWrite(join(root, `document.${extension}`))).rejects.toThrow(
          "Unsupported",
        );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("preserves the existing destination and removes temporary bytes after a failed atomic replacement", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-atomic-test-"));
    try {
      const destination = join(root, "existing-directory");
      await mkdir(destination);
      await writeFile(join(destination, "original.txt"), "Original content");
      await expect(
        atomicWrite(destination, "Cannot replace a nonempty directory"),
      ).rejects.toThrow();
      expect(await readdir(root)).toEqual(["existing-directory"]);
      expect(await readFile(join(destination, "original.txt"), "utf8")).toBe("Original content");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("denies arbitrary reads and writes, allows selected files and restricts recovery to projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-files-test-"));
    try {
      const photo = join(root, "photo.png");
      const project = join(root, "work.edifoto");
      await writeFile(photo, "image");
      await writeFile(project, "project");
      const files = createFileAuthority(["edifoto"]);
      await expect(files.assertRead(photo)).rejects.toThrow("Selecione");
      await files.grantRead(photo);
      await expect(files.assertRead(photo)).resolves.toBeTruthy();
      await expect(files.assertWrite(photo, false)).rejects.toThrow("destino");
      await files.grantWrite(photo);
      await expect(files.assertWrite(photo, true)).rejects.toThrow("recuperação");
      await files.grantRead(project);
      await expect(files.assertWrite(project, true)).resolves.toBeTruthy();
      const unselected = join(root, "unselected.png");
      await writeFile(unselected, "not selected");
      await expect(
        files.canReadAll([photo, project, unselected, join(root, "missing.png")]),
      ).resolves.toEqual([true, true, false, false]);
      await expect(files.canReadAll(photo)).rejects.toThrow();
      await expect(files.canReadAll(["relative.png"])).rejects.toThrow();
      const folder = join(root, "exports");
      await mkdir(folder);
      await files.grantDirectory(folder);
      await expect(files.assertWrite(join(folder, "output.png"), false)).resolves.toBeTruthy();
      await expect(files.assertWrite(join(folder, "..", "escape.png"), false)).rejects.toThrow(
        "destino",
      );
      await expect(files.assertWrite(join(folder, "program.exe"), false)).rejects.toThrow();
      expect(await readFile(project, "utf8")).toBe("project");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("validates bounded structured IPC data without accepting injected prototypes or nonfinite values", () => {
    expect(() =>
      validateIpcValues([{ path: "project", bytes: new Uint8Array(10), optional: undefined }]),
    ).not.toThrow();
    expect(() => validateIpcValues([Number.NaN])).toThrow();
    expect(() => validateIpcValues([JSON.parse('{"__proto__":{"admin":true}}')])).toThrow();
    expect(() => validateIpcValues([new Date()])).toThrow();
  });
});
