// Investigation harness only: derives a copy from the repository's native runner.
// Run from the repository root after reproduzir-integridade.mts.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const output = ".cache/edipdf-analysis";
await mkdir(output, { recursive: true });
let source = await readFile("scripts/edi/test-native.mts", "utf8");
const replacements = [
  ['from "./native-diagnostics.mts"', 'from "../../scripts/edi/native-diagnostics.mts"'],
  ['from "./native-installation.mts"', 'from "../../scripts/edi/native-installation.mts"'],
  ["applicationRoot],", 'applicationRoot, resolve(".cache/edipdf-analysis/audit.pdf")],'],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`Native harness changed: ${before}`);
  source = source.replace(before, after);
}
const anchor = '      if (id === "ediaula") await verifyNativeDialog';
if (!source.includes(anchor)) throw new Error("Native harness journey anchor changed");
const journey = await readFile(new URL("./jornada-electron.txt", import.meta.url), "utf8");
source = source.replace(anchor, `${journey}\n${anchor}`);
await writeFile(`${output}/native.mts`, source);
await writeFile(
  `${output}/package.json`,
  JSON.stringify(
    {
      private: true,
      scripts: { native: "node run-native.mts" },
    },
    null,
    2,
  ),
);
await writeFile(
  `${output}/run-native.mts`,
  [
    'import { fileURLToPath } from "node:url";',
    'process.chdir(fileURLToPath(new URL("../../", import.meta.url)));',
    'await import("./native.mts");',
    "",
  ].join("\n"),
);
console.log(
  "Prepared isolated investigation. Run: pnpm --dir .cache/edipdf-analysis run native edipdf",
);
