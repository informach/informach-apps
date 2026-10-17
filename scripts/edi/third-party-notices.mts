import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { desktopAppIdSchema } from "../../packages/edi-contracts/src/index.ts";

const execute = promisify(execFile);
const licensesSchema = z.record(
  z.string(),
  z.array(
    z.object({
      name: z.string(),
      versions: z.array(z.string()),
      paths: z.array(z.string()).min(1),
      license: z.string(),
      homepage: z.string().optional(),
    }),
  ),
);

/** Include production dependency notices even when Vite bundles their code/fonts. */
export async function writeThirdPartyNotices(appId: string, resourcesDirectory: string) {
  desktopAppIdSchema.parse(appId);
  const packageManager = process.env.npm_execpath;
  if (!packageManager || !isAbsolute(packageManager) || basename(packageManager) !== "pnpm.cjs")
    throw new Error("Notice generation requires the pinned pnpm workspace command");
  const result = await execute(
    process.execPath,
    [packageManager, "--filter", `@informach/${appId}...`, "licenses", "list", "--prod", "--json"],
    { windowsHide: true, maxBuffer: 8 * 1024 ** 2 },
  );
  const packages = Object.values(licensesSchema.parse(JSON.parse(result.stdout)))
    .flat()
    .sort((a, b) => a.name.localeCompare(b.name));
  const sections = [
    "Suíte Edi — third-party software notices",
    "These components retain their own licenses and copyright notices. Dependency names below include transitive runtime dependencies. Electron and Chromium notices are distributed alongside the application executable.",
  ];
  if (appId === "ediaula")
    sections.push(
      "FFmpeg and FFprobe are separately distributed native programs under GPLv3. Their licenses, complete corresponding source and rebuild instructions are installed in native-media/ beside this file; see native-media/README.md and native-media/Corresponding-Source.tar.xz.",
      "Bundled export fonts retain their SIL Open Font License 1.1. Their embedded copyright and reserved-name statements, original-file checksums and complete license text are installed in fonts/LICENSES.txt beside this file.",
    );
  for (const dependency of packages) {
    sections.push(
      `\n${"=".repeat(72)}\n${dependency.name} ${dependency.versions.join(", ")}\nLicense: ${dependency.license}${dependency.homepage ? `\nHomepage: ${dependency.homepage}` : ""}`,
    );
    const documents = new Map<string, string>();
    for (const path of dependency.paths) {
      const files = await readdir(path, { withFileTypes: true });
      const notices = files.filter(
        (file) => file.isFile() && /(^|\.)(licen[sc]e|copying|notice)(\.|$)/i.test(file.name),
      );
      // Native FFmpeg distributions include the exact build/configuration/source
      // references in executable README files, separate from the JS wrapper.
      notices.push(...files.filter((file) => file.isFile() && /\.exe\.README$/i.test(file.name)));
      if (notices.length === 0) {
        const readme = files.find((file) => file.isFile() && /^readme(\.|$)/i.test(file.name));
        if (!readme)
          throw new Error(`No license text or README is distributed by ${dependency.name}`);
        notices.push(readme);
      }
      for (const notice of notices.sort((a, b) => a.name.localeCompare(b.name))) {
        const content = await readFile(join(path, notice.name), "utf8");
        documents.set(content, notice.name);
      }
    }
    for (const [content, name] of documents) sections.push(`\n--- ${name} ---\n${content}`);
  }
  await writeFile(join(resourcesDirectory, "THIRD-PARTY-NOTICES.txt"), `${sections.join("\n")}\n`);
  return packages.length;
}
