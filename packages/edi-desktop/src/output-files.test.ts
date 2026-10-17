import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite, withStagedFiles } from "./files";

describe("staged related output files", () => {
  it("restores already committed outputs when a later rename fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-output-test-"));
    const main = join(root, "lesson.mp4");
    const captions = join(root, "lesson.srt");
    try {
      await writeFile(main, "previous video");
      await writeFile(captions, "previous captions");
      await expect(
        withStagedFiles(
          [main, captions],
          async (staged) => {
            for (const temporary of staged.values()) await writeFile(temporary, "new");
          },
          async () => {
            // A real concurrent filesystem obstruction, not a patched filesystem API.
            await rename(captions, join(root, "moved.srt"));
            await mkdir(captions);
          },
        ),
      ).rejects.toThrow();
      expect(await readFile(main, "utf8")).toBe("previous video");
      expect(await readFile(join(root, "moved.srt"), "utf8")).toBe("previous captions");
      expect((await readdir(root)).sort()).toEqual(["lesson.mp4", "lesson.srt", "moved.srt"]);
    } finally {
      await rm(root, { recursive: true });
    }
  });
  it("preserves previous outputs on processing failure, missing output and cancellation", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-output-test-"));
    const target = join(root, "lesson.mp4");
    try {
      await writeFile(target, "previous");
      await expect(
        withStagedFiles([target], async (staged) => {
          const temporary = staged.get(target);
          if (!temporary) throw new Error("Missing staged target");
          await writeFile(temporary, "incomplete");
          throw new Error("Render failed");
        }),
      ).rejects.toThrow("Render failed");
      await expect(withStagedFiles([target], async () => {})).rejects.toThrow();
      await expect(
        withStagedFiles(
          [target],
          async (staged) => {
            const temporary = staged.get(target);
            if (!temporary) throw new Error("Missing staged target");
            await writeFile(temporary, "complete");
          },
          () => {
            throw new Error("Cancelled");
          },
        ),
      ).rejects.toThrow("Cancelled");
      expect(await readFile(target, "utf8")).toBe("previous");
      expect(await readdir(root)).toEqual(["lesson.mp4"]);
    } finally {
      await rm(root, { recursive: true });
    }
  });
  it("commits all verified outputs and serializes writes sharing a destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-output-test-"));
    const main = join(root, "lesson.mp4");
    const captions = join(root, "lesson.srt");
    try {
      await writeFile(main, "previous");
      await Promise.all([
        withStagedFiles([main, captions], async (staged) => {
          for (const [target, temporary] of staged)
            await writeFile(temporary, target === main ? "video" : "captions");
        }),
        atomicWrite(main, "later explicit save"),
      ]);
      expect(await readFile(main, "utf8")).toBe("later explicit save");
      expect(await readFile(captions, "utf8")).toBe("captions");
      expect((await readdir(root)).sort()).toEqual(["lesson.mp4", "lesson.srt"]);
    } finally {
      await rm(root, { recursive: true });
    }
  });
  it("does not replace existing directories or accept duplicate/cross-directory targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "edi-output-test-"));
    const target = join(root, "lesson.mp4");
    try {
      await mkdir(target);
      await writeFile(join(target, "original"), "preserve");
      await expect(
        withStagedFiles([target], async (staged) => {
          const temporary = staged.get(target);
          if (!temporary) throw new Error("Missing staged target");
          await writeFile(temporary, "video");
        }),
      ).rejects.toThrow("non-file");
      expect(await readFile(join(target, "original"), "utf8")).toBe("preserve");
      expect(() => withStagedFiles([target, target], async () => {})).toThrow("unique");
      expect(() => withStagedFiles([target, join(target, "other.mp4")], async () => {})).toThrow(
        "parent",
      );
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
