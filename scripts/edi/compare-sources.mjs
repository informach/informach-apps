import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";
import { collect, sha256 } from "./import-tools.mjs";

/** Read-only three-way comparison. Never overwrites either working tree. */
export function classifyChange(baseline, source, repository) {
  if (source === repository) return source === baseline ? "unchanged" : "converged";
  if (source === baseline) return "repository_only";
  if (repository === baseline) return "source_only";
  return "conflict";
}

async function run() {
  if (process.argv.length > 2) throw new Error("Comparison is read-only; no arguments accepted.");
  const origins = resolve("docs/migrations/edi/origins");
  const manifest = JSON.parse(await readFile(join(origins, "manifest.json"), "utf8"));
  for (const tool of EDI_TOOLS) {
    const origin = manifest.tools.find((entry) => entry.id === tool.id);
    if (!origin) throw new Error(`Missing origin for ${tool.id}`);
    const archive = await readFile(join(origins, `${tool.id}.json.gz`));
    if (sha256(archive) !== origin.archiveSha256)
      throw new Error(`Corrupt baseline archive: ${tool.id}`);
    const contents = JSON.parse(gunzipSync(archive).toString("utf8"));
    for (const file of contents.files) {
      if (sha256(Buffer.from(file.content, "base64")) !== file.sha256)
        throw new Error(`Corrupt baseline file: ${tool.id}/${file.path}`);
    }
    const baseline = new Map(origin.files.map((entry) => [entry.path, entry.sha256]));
    const source = new Map(
      (await collect(origin.source)).map((entry) => [entry.path, entry.sha256]),
    );
    const repository = new Map(
      (await collect(join("apps", tool.id))).map((entry) => [entry.path, entry.sha256]),
    );
    const counts = {};
    for (const path of new Set([...baseline.keys(), ...source.keys(), ...repository.keys()])) {
      const classification = classifyChange(
        baseline.get(path),
        source.get(path),
        repository.get(path),
      );
      counts[classification] = (counts[classification] ?? 0) + 1;
      if (classification === "conflict" || classification === "source_only")
        console.log(`${tool.id}\t${classification}\t${path}`);
    }
    console.log(`${tool.id}: ${JSON.stringify(counts)}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(resolve(process.argv[1])).href
)
  await run();
