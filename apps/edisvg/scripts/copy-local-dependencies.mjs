import { access, cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const source = resolve("../EDIAULA/node_modules"),
  target = resolve("node_modules");
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const visited = new Set();
async function copy(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const src = join(source, name),
    dest = join(target, name);
  try {
    await access(join(src, "package.json"));
  } catch {
    return;
  }
  const pkg = JSON.parse(await readFile(join(src, "package.json"), "utf8"));
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, force: false });
  for (const dependency of Object.keys({
    ...pkg.dependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  }))
    await copy(dependency);
}
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }))
  await copy(name);
await mkdir(join(target, ".bin"), { recursive: true });
const { writeFile } = await import("node:fs/promises");
for (const name of visited) {
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(target, name, "package.json"), "utf8"));
  } catch {
    continue;
  }
  const bins =
    typeof pkg.bin === "string" ? { [pkg.name.split("/").pop()]: pkg.bin } : pkg.bin || {};
  for (const [command, path] of Object.entries(bins))
    await writeFile(
      join(target, ".bin", command + ".cmd"),
      `@echo off\r\nnode "%~dp0\\..\\${name.replaceAll("/", "\\")}\\${path.replaceAll("/", "\\")}" %*\r\n`,
    );
}
console.log(`Dependências locais copiadas: ${visited.size}. Ediaula permaneceu intacto.`);
