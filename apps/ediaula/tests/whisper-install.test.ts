import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { folderMatches, signature, swapFolder } from "../src/main/installCheck.ts";

// Only Electron's profile location is replaced: the engine install runs against a temporary tree.
const root = await mkdtemp(join(tmpdir(), "ediaula-whisper-install-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(
          `export const app = { isPackaged: false, getPath: () => ${JSON.stringify(root)} };`,
        )}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const whisper = await import("../src/main/whisper.ts");
hooks.deregister();
after(() => rm(root, { recursive: true, force: true }));

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

test("ids and names from the renderer never become paths", async () => {
  const hostile = "x\\..\\..\\Documents";
  await assert.rejects(
    whisper.installEngine(hostile, "cpu", () => undefined),
    /inválido/,
  );
  await assert.rejects(
    whisper.installModel(hostile, "small", () => undefined),
    /inválido/,
  );
  await assert.rejects(
    whisper.transcribe(hostile, join(root, "aula.mp4"), 1, "pt", [], () => undefined),
    /inválido/,
  );
  await assert.rejects(
    whisper.transcribe("job-1", join(root, "aula.mp4"), 1, "../pt", [], () => undefined),
    /Idioma/,
  );
  assert.equal(existsSync(join(root, "whisper")), false, "nothing was created");
  assert.equal(whisper.isEngineVariant("cpu"), true);
  assert.equal(whisper.isEngineVariant("../evil"), false);
  assert.equal(whisper.isEngineVariant("constructor"), false, "not the object's own key");
  assert.equal(whisper.isModelName("small"), true);
  assert.equal(whisper.isModelName("toString"), false);
});

test("a folder matches its manifest only with exactly the listed files and hashes", async () => {
  const dir = await mkdtemp(join(root, "engine-"));
  await mkdir(join(dir, "Release"));
  await writeFile(join(dir, "Release", "whisper-cli.exe"), "cli");
  await writeFile(join(dir, "Release", "ggml.dll"), "ggml");
  const manifest = {
    "Release/whisper-cli.exe": { sha256: sha("cli"), size: 3 },
    "Release/ggml.dll": { sha256: sha("ggml"), size: 4 },
  };
  assert.equal(await folderMatches(dir, manifest), true);
  const before = await signature(dir);
  await writeFile(join(dir, "Release", "extra.dll"), "x");
  assert.equal(await folderMatches(dir, manifest), false, "a file the manifest does not list");
  assert.notEqual(await signature(dir), before, "the signature sees the change");
  await rm(join(dir, "Release", "extra.dll"));
  await writeFile(join(dir, "Release", "ggml.dll"), "gGml");
  assert.equal(await folderMatches(dir, manifest), false, "a changed file");
  await rm(join(dir, "Release", "ggml.dll"));
  assert.equal(await folderMatches(dir, manifest), false, "a missing file");
});

test("an engine swap keeps the old one until the new one is in place", async () => {
  const base = await mkdtemp(join(root, "swap-"));
  const target = join(base, "cpu");
  const aside = join(base, ".old-1");
  await mkdir(target);
  await writeFile(join(target, "v"), "old");
  await assert.rejects(swapFolder(join(base, "missing"), target, aside));
  assert.equal(await readFile(join(target, "v"), "utf8"), "old", "a failed swap brings it back");
  assert.equal(existsSync(aside), false);

  const staging = join(base, ".cpu-new");
  await mkdir(staging);
  await writeFile(join(staging, "v"), "new");
  assert.equal(await swapFolder(staging, target, aside), true);
  assert.equal(await readFile(join(target, "v"), "utf8"), "new");
  assert.equal(await readFile(join(aside, "v"), "utf8"), "old", "the old one waits aside");
  assert.deepEqual((await readdir(base)).sort(), [".old-1", "cpu"]);

  const fresh = join(base, "cuda");
  const firstStaging = join(base, ".cuda-new");
  await mkdir(firstStaging);
  assert.equal(await swapFolder(firstStaging, fresh, join(base, ".old-2")), false, "first install");
});
