import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite, createFileAuthority, validateIpcValues } from "./files";

describe("selected-file capabilities", () => {
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
      // A packed lesson (EdiAula) is a ZIP picked in a save dialog.
      const packed = join(root, "aula.zip");
      await files.grantWrite(packed);
      await expect(files.assertWrite(packed, false)).resolves.toBeTruthy();
      // canWrite answers the same question without throwing, and false when the folder is gone.
      await expect(files.canWrite(photo)).resolves.toBe(true);
      await expect(files.canWrite(join(folder, "output.mp4"))).resolves.toBe(true);
      await expect(files.canWrite(unselected)).resolves.toBe(false);
      await expect(files.canWrite(join(root, "gone", "x.mp4"))).resolves.toBe(false);
      await expect(files.canWrite("relative.mp4")).rejects.toThrow();
      expect(await readFile(project, "utf8")).toBe("project");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("accepts only the captions, thumbnail and platform package of the exported video beside it", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-related-test-"));
    try {
      const video = join(root, "Aula 3.mp4");
      const files = createFileAuthority(["ediaula"]);
      await files.grantWrite(video);
      for (const name of [
        "Aula 3.srt",
        "Aula 3.vtt",
        "Aula 3.jpg",
        "Aula 3.en.srt",
        "Aula 3.es.vtt",
        "Aula 3.pt-BR.srt",
        "Aula 3.plataforma.json",
      ])
        await expect(files.assertRelatedExport(video, join(root, name))).resolves.toBeTruthy();
      for (const name of [
        "Aula 3.json",
        "Aula 3.en.jpg",
        "Aula 3.outra.json",
        "Aula 3.english-long.srt",
        "Outra aula.en.srt",
        "Aula 3.exe",
      ])
        await expect(files.assertRelatedExport(video, join(root, name))).rejects.toThrow(
          "não pertence",
        );
      await mkdir(join(root, "sub"));
      await expect(
        files.assertRelatedExport(video, join(root, "sub", "Aula 3.en.srt")),
      ).rejects.toThrow("não pertence");
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
