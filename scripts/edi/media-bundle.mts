import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export const nativeMediaDirectory = resolve(".cache/edi-native-media/windows-x64");
const recipeFiles = ["Dockerfile", "build.sh", "cross.meson", "README.md", "sources.lock.json"];
const bundleSchema = z.object({
  version: z.string(),
  recipeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(
    z.object({
      path: z.string().regex(/^(?!.*(?:^|\/)\.\.?(?:\/|$))[a-zA-Z0-9._/-]+$/),
      size: z.number().int().positive(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
export async function nativeMediaRecipeDigest() {
  const hash = createHash("sha256");
  for (const name of recipeFiles)
    hash
      .update(name)
      .update("\0")
      .update((await readFile(resolve("scripts/edi/media", name), "utf8")).replace(/\r\n/g, "\n"));
  return hash.digest("hex");
}
export async function verifyNativeMediaBundle(directory = nativeMediaDirectory) {
  const bundle = bundleSchema.parse(
    JSON.parse(await readFile(join(directory, "bundle.json"), "utf8")),
  );
  const sources: { name: string; version: string }[] = JSON.parse(
    await readFile(resolve("scripts/edi/media/sources.lock.json"), "utf8"),
  );
  if (
    bundle.recipeDigest !== (await nativeMediaRecipeDigest()) ||
    bundle.version !== sources.find((item) => item.name === "ffmpeg")?.version
  )
    throw new Error("Native media bundle was built from a different source recipe");
  const actualFiles = new Set<string>();
  async function visit(path: string, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(join(path, entry.name), `${relative}/`);
      else if (entry.isFile()) actualFiles.add(relative);
      else throw new Error("Native media bundle cannot contain links or special files");
    }
  }
  await visit(directory);
  actualFiles.delete("bundle.json");
  if (
    new Set(bundle.files.map((file) => file.path)).size !== bundle.files.length ||
    actualFiles.size !== bundle.files.length
  )
    throw new Error("Native media inventory mismatch");
  for (const file of bundle.files) {
    if (!actualFiles.has(file.path)) throw new Error("Native media file is missing");
    const bytes = await readFile(join(directory, file.path));
    if (
      bytes.length !== file.size ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw new Error(`Native media integrity mismatch: ${file.path}`);
  }
  for (const required of [
    "bin/ffmpeg.exe",
    "bin/ffprobe.exe",
    "Corresponding-Source.tar.xz",
    "LICENSE.FFmpeg.txt",
    "README.md",
    "build-information/sources.lock.json",
  ])
    if (!actualFiles.has(required))
      throw new Error(`Native media distribution is incomplete: ${required}`);
  return bundle;
}
