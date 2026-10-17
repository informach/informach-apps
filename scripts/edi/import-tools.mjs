import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve("C:/Users/julio/Desktop/CRIECOMHELENAEJULIO/APPS");
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "out",
  "dist",
  "release",
  "entrega",
  ".tmp",
  ".review",
  ".npm-cache",
  ".test-profile",
  "test-results",
  "playwright-report",
  ".perfil-nova-versao",
]);

function allowedFile(name) {
  return (
    !name.startsWith(".env") &&
    !name.endsWith(".lnk") &&
    !name.endsWith(".tsbuildinfo") &&
    !name.endsWith(".log") &&
    name !== "package-lock.json"
  );
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function collect(root, subpath = "") {
  const result = [];
  for (const entry of await readdir(join(root, subpath), { withFileTypes: true })) {
    const path = join(subpath, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link is not importable: ${path}`);
    const generated = path.split(sep).join("/") === "src/renderer/public/pdfjs";
    if (
      entry.isDirectory() &&
      !excludedDirectories.has(entry.name) &&
      !entry.name.startsWith(".file-test-") &&
      !generated
    ) {
      result.push(...(await collect(root, path)));
    } else if (entry.isFile() && allowedFile(entry.name)) {
      const bytes = await readFile(join(root, path));
      result.push({ path: path.split(sep).join("/"), size: bytes.length, sha256: sha256(bytes) });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function run() {
  const apply = process.argv.includes("--apply");
  if (process.argv.slice(2).some((arg) => arg !== "--apply"))
    throw new Error("Only --apply is accepted");
  const canonicalSource = await realpath(sourceRoot);
  const snapshots = [];
  for (const tool of EDI_TOOLS) {
    const source = await realpath(join(sourceRoot, tool.sourceFolder));
    const sourceRelative = relative(canonicalSource, source);
    if (sourceRelative.startsWith("..") || isAbsolute(sourceRelative))
      throw new Error("Source escaped root");
    const destination = join(workspace, "apps", tool.id);
    if (await exists(destination))
      throw new Error(`Destination already exists; refusing to overwrite ${tool.id}`);
    const files = await collect(source);
    snapshots.push({ tool: tool.id, source, destination, files });
    console.log(
      `${tool.name}: ${files.length} files, ${files.reduce((sum, item) => sum + item.size, 0)} bytes`,
    );
  }
  if (!apply) {
    console.log("Read-only inventory complete. Run with --apply to import.");
    return;
  }
  const snapshotDirectory = join(workspace, "docs/migrations/edi/origins");
  await mkdir(snapshotDirectory, { recursive: true });
  const manifest = { version: 1, capturedAt: new Date().toISOString(), tools: [] };
  for (const snapshot of snapshots) {
    const archive = [];
    for (const file of snapshot.files) {
      const original = join(snapshot.source, file.path);
      const content = await readFile(original);
      if (sha256(content) !== file.sha256)
        throw new Error(`Source changed during capture: ${original}`);
      const target = join(snapshot.destination, file.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(original, target);
      if (sha256(await readFile(target)) !== file.sha256)
        throw new Error(`Copy mismatch: ${target}`);
      archive.push({ path: file.path, content: content.toString("base64"), sha256: file.sha256 });
    }
    const current = await collect(snapshot.source);
    if (JSON.stringify(current) !== JSON.stringify(snapshot.files))
      throw new Error(`Source changed: ${snapshot.tool}`);
    const compressed = gzipSync(JSON.stringify({ version: 1, files: archive }));
    await writeFile(join(snapshotDirectory, `${snapshot.tool}.json.gz`), compressed, {
      flag: "wx",
    });
    manifest.tools.push({
      id: snapshot.tool,
      source: snapshot.source,
      archiveSha256: sha256(compressed),
      files: snapshot.files,
    });
    console.log(`Imported and verified ${snapshot.tool}`);
  }
  await writeFile(
    join(snapshotDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log("Origins preserved; baseline archives and SHA-256 manifest recorded.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await run();
