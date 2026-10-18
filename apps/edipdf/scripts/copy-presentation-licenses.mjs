import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function locate(name, resolver) {
  try {
    return resolver.resolve(`${name}/package.json`);
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      !["ERR_PACKAGE_PATH_NOT_EXPORTED", "MODULE_NOT_FOUND"].includes(error.code)
    )
      throw error;
    let directory = dirname(resolver.resolve(name));
    for (let depth = 0; depth < 8; depth++) {
      const candidate = join(directory, "package.json");
      if (existsSync(candidate) && JSON.parse(readFileSync(candidate, "utf8")).name === name)
        return candidate;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    throw new Error(`Installed presentation dependency manifest not found: ${name}`, {
      cause: error,
    });
  }
}
const pending = [locate("pptxgenjs", createRequire(import.meta.url))],
  visited = new Set(),
  notices = [];
while (pending.length) {
  const manifestPath = pending.pop();
  if (!manifestPath || visited.has(manifestPath)) continue;
  visited.add(manifestPath);
  if (visited.size > 100)
    throw new Error("Presentation license inventory exceeds the local bound.");
  const directory = dirname(manifestPath),
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const names = readdirSync(directory),
    licenses = names.filter((name) => /^(?:license|licence|copying)(?:\.|$)/i.test(name));
  if (!licenses.length)
    for (const name of names.filter((name) => /^readme(?:\.|$)/i.test(name))) {
      const text = readFileSync(join(directory, name), "utf8");
      if (
        /^#+\s+Licen[sc]e\b/m.test(text) &&
        /Copyright/i.test(text) &&
        /Permission is hereby granted/i.test(text)
      )
        licenses.push(name);
    }
  if (!licenses.length)
    throw new Error(`Missing license notice: ${manifest.name}@${manifest.version}`);
  const text = licenses
    .sort()
    .map((name) => {
      const value = readFileSync(join(directory, name), "utf8");
      if (value.length > 1_000_000) throw new Error("Presentation license notice exceeds 1 MB.");
      return `${name}\n${value}`;
    })
    .join("\n");
  notices.push({ name: manifest.name, version: manifest.version, license: manifest.license, text });
  const resolver = createRequire(manifestPath);
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (
      name.startsWith("@types/") ||
      (typeof manifest.browser === "object" && manifest.browser?.[name] === false)
    )
      continue;
    pending.push(locate(name, resolver));
  }
}
notices.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
writeFileSync(
  join(root, "resources/licenses/PptxGenJS-dependencies-LICENSES.txt"),
  "Installed browser/worker presentation writer dependencies. Type-only packages and dependencies explicitly excluded by package browser:false are not part of this runtime inventory. JSZip is used under its MIT option.\n\n" +
    notices
      .map((notice) => `${notice.name}@${notice.version} — ${notice.license}\n${notice.text}`)
      .join("\n\n"),
);
