import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { verifyNativeMediaBundle } from "./media-bundle.mts";

const recipe = resolve("scripts/edi/media");
const context = resolve(".cache/edi-media-build");
const output = resolve(".cache/edi-native-media/windows-x64");
const cache = resolve(".cache");
function assertCachePath(path: string) {
  const within = relative(cache, resolve(path));
  if (!within || isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`))
    throw new Error("Refusing to replace a directory outside this workspace cache");
}
const sources = z
  .array(
    z.object({
      name: z.string().regex(/^[a-z0-9-]+$/),
      version: z.string(),
      url: z.url().startsWith("https://"),
      file: z.string().regex(/^[a-zA-Z0-9._-]+\.tar\.(gz|xz)$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .parse(JSON.parse(await readFile(join(recipe, "sources.lock.json"), "utf8")));
const version = sources.find((source) => source.name === "ffmpeg")?.version;
if (!version) throw new Error("FFmpeg source is missing from the media recipe");
assertCachePath(join(context, "sources"));
await rm(join(context, "sources"), { recursive: true, force: true });
await mkdir(join(context, "sources"), { recursive: true });
/**
 * A pinned source, retried on network failures only: upstream hosts (ffmpeg.org) sometimes time
 * out from CI runners. An HTTP error such as 404 is final, and the checksum below still decides.
 */
async function download(name: string, url: string): Promise<Buffer> {
  const attempts = 4;
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`Download of ${name} failed (${attempt}/${attempts}); trying again.`);
      await new Promise((done) => setTimeout(done, 15000 * attempt));
      continue;
    }
    if (!response.ok) throw new Error(`Cannot download ${name}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}

for (const source of sources) {
  const path = resolve(".cache/edi-media-source-downloads", source.file);
  let bytes: Buffer | undefined;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (!bytes) {
    bytes = await download(source.name, source.url);
    await mkdir(resolve(".cache/edi-media-source-downloads"), { recursive: true });
    await writeFile(path, bytes);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw new Error(`Source checksum changed: ${source.name}`);
  await copyFile(path, join(context, "sources", source.file));
}
const recipeHash = createHash("sha256");
for (const name of ["Dockerfile", "build.sh", "cross.meson", "README.md", "sources.lock.json"]) {
  const bytes = (await readFile(join(recipe, name), "utf8")).replace(/\r\n/g, "\n");
  recipeHash.update(name).update("\0").update(bytes);
  await writeFile(join(context, name), bytes);
}
const digest = recipeHash.digest("hex");
// Export into an empty directory; a previous bundle must not contribute stale
// binaries or notices to the inventory of this build.
const staging = await mkdtemp(join(cache, "edi-media-output-"));
// Compiler parallelism only changes build time, never the recipe or its output.
const jobs = z.coerce.number().int().min(1).max(64).default(2).parse(process.env.JOBS);
const child = spawn(
  "docker",
  [
    "build",
    "--progress=plain",
    "--build-arg",
    `BUILD_JOBS=${jobs}`,
    "--output",
    `type=local,dest=${staging}`,
    context,
  ],
  { windowsHide: true, stdio: "inherit" },
);
await new Promise<void>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`Native media build failed (${code})`)),
  );
});
const files: { path: string; size: number; sha256: string }[] = [];
async function visit(directory: string, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await visit(join(directory, entry.name), `${relative}/`);
    else if (entry.isFile() && relative !== "bundle.json") {
      const bytes = await readFile(join(directory, entry.name));
      files.push({
        path: relative,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } else if (!entry.isFile())
      throw new Error("Native media output cannot contain links or special files");
  }
}
await visit(staging);
await writeFile(
  join(staging, "bundle.json"),
  JSON.stringify({ version, recipeDigest: digest, files }, null, 2),
);
await verifyNativeMediaBundle(staging);
assertCachePath(output);
assertCachePath(staging);
await mkdir(resolve(output, ".."), { recursive: true });
await rm(output, { recursive: true, force: true });
await rename(staging, output);
console.log(`Built Windows media tools and complete corresponding source (${digest})`);
