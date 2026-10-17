import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { nativeMediaRecipeDigest, verifyNativeMediaBundle } from "./media-bundle.mts";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "edi-media-bundle-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const files = [];
  for (const path of [
    "bin/ffmpeg.exe",
    "bin/ffprobe.exe",
    "Corresponding-Source.tar.xz",
    "LICENSE.FFmpeg.txt",
    "README.md",
    "build-information/sources.lock.json",
  ]) {
    const bytes = Buffer.from(`Fixture content for ${path}`);
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), bytes);
    files.push({
      path,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const sources: { name: string; version: string }[] = JSON.parse(
    await readFile("scripts/edi/media/sources.lock.json", "utf8"),
  );
  const bundle = {
    version: sources.find((item) => item.name === "ffmpeg")?.version,
    recipeDigest: await nativeMediaRecipeDigest(),
    files,
  };
  await writeFile(join(directory, "bundle.json"), JSON.stringify(bundle));
  return { directory, bundle };
}
describe("native media distribution inventory", () => {
  it("accepts exact build inputs and rejects replacement of the accompanying source archive", async () => {
    const f = await fixture();
    await expect(verifyNativeMediaBundle(f.directory)).resolves.toMatchObject({
      version: f.bundle.version,
    });
    await writeFile(join(f.directory, "Corresponding-Source.tar.xz"), "different source bytes");
    await expect(verifyNativeMediaBundle(f.directory)).rejects.toThrow("integrity mismatch");
  });
  it("rejects a bundle whose source archive was omitted even when its inventory agrees", async () => {
    const f = await fixture();
    await rm(join(f.directory, "Corresponding-Source.tar.xz"));
    f.bundle.files = f.bundle.files.filter((file) => file.path !== "Corresponding-Source.tar.xz");
    await writeFile(join(f.directory, "bundle.json"), JSON.stringify(f.bundle));
    await expect(verifyNativeMediaBundle(f.directory)).rejects.toThrow(
      "distribution is incomplete",
    );
  });
  it("refuses a stale recipe or unexpected files instead of including unreviewed bytes", async () => {
    const f = await fixture();
    await writeFile(
      join(f.directory, "bundle.json"),
      JSON.stringify({ ...f.bundle, recipeDigest: "a".repeat(64) }),
    );
    await expect(verifyNativeMediaBundle(f.directory)).rejects.toThrow("different source recipe");
    await writeFile(join(f.directory, "bundle.json"), JSON.stringify(f.bundle));
    await writeFile(join(f.directory, "unreviewed.exe"), "unreviewed bytes");
    await expect(verifyNativeMediaBundle(f.directory)).rejects.toThrow("inventory mismatch");
  });
});
