import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EDI_DESKTOP_APPS } from "../../packages/config/src/edi-tools";
import { buildArtifactSchema, releaseVersionSchema } from "../../packages/edi-contracts/src/index";

const version = releaseVersionSchema.parse(process.env.EDI_RELEASE_TAG?.replace(/^edi-v/, ""));
const root = resolve(".cache/edi-artifacts");
async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Artifact links are not allowed");
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
    if (result.length > 100) throw new Error("Unexpected artifact inventory");
  }
  return result;
}
const inventory = await files(root);
for (const app of EDI_DESKTOP_APPS) {
  const descriptors = inventory.filter((path) => path.endsWith(`${app.id}.artifact.json`));
  const descriptor = descriptors[0];
  if (descriptors.length !== 1 || !descriptor)
    throw new Error(`Missing or duplicate descriptor: ${app.id}`);
  const parsed = buildArtifactSchema.parse(JSON.parse(await readFile(descriptor, "utf8")));
  if (parsed.version !== version || parsed.artifact.appId !== app.id)
    throw new Error("Artifact identity mismatch");
  const name = `${app.id}-${version}-win-x64.exe`;
  const candidates = inventory.filter((path) => path.endsWith(name));
  const installer = candidates[0];
  if (candidates.length !== 1 || !installer)
    throw new Error(`Missing or duplicate installer: ${app.id}`);
  const destination = resolve(".cache/edi-release", version, app.id);
  await mkdir(destination, { recursive: true });
  await copyFile(descriptor, join(destination, `${app.id}.artifact.json`));
  await copyFile(installer, join(destination, name));
}
console.log(`Assembled all six application artifacts for ${version}`);
