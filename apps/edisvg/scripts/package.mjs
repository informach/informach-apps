import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("Versão de pacote inválida.");
const root = resolve(`release/EdiSVG-${pkg.version}-win32-x64`);
await mkdir(root, { recursive: true });
await cp("node_modules/electron/dist", root, { recursive: true });
const app = join(root, "resources/app");
await mkdir(app, { recursive: true });
await cp("out", join(app, "out"), { recursive: true });
await writeFile(
  join(app, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: "module",
      main: pkg.main,
      dependencies: pkg.dependencies,
    },
    null,
    2,
  ),
);
const copied = new Set();
async function dependency(name) {
  if (copied.has(name)) return;
  copied.add(name);
  const src = resolve("node_modules", name);
  let data;
  try {
    data = JSON.parse(await readFile(join(src, "package.json"), "utf8"));
  } catch {
    return;
  }
  const dest = join(app, "node_modules", name);
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  for (const child of Object.keys({ ...data.dependencies, ...data.optionalDependencies }))
    await dependency(child);
}
for (const name of Object.keys(pkg.dependencies)) await dependency(name);
await cp(join(root, "electron.exe"), join(root, "EdiSVG.exe"));
console.log(`Desktop portátil: ${join(root, "EdiSVG.exe")}`);
