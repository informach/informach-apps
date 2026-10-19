import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportOdt } from "../src/shared/open-document/export.ts";
import { exportOds, importOds } from "../src/shared/open-document/spreadsheet.ts";
import { importOdt } from "../src/shared/open-document/text.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixtures = new URL("../tests/fixtures/open-document/", import.meta.url);
const [regular, bold, italic, boldItalic, license, odt, ods] = await Promise.all([
  readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-Bold.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-BoldItalic.ttf", import.meta.url)),
  readFile(new URL("../resources/licenses/Noto-OFL.txt", import.meta.url), "utf8"),
  readFile(new URL("independent.odt", fixtures)),
  readFile(new URL("independent.ods", fixtures)),
]);
const directory = resolve(root, ".cache/edipdf-analysis/open-document-export");
await mkdir(directory, { recursive: true });
const textPath = join(directory, "exported.odt"),
  sheetPath = join(directory, "exported.ods");
await writeFile(
  textPath,
  exportOdt(
    importOdt(new Uint8Array(odt), "Independent export"),
    { regular, bold, italic, boldItalic },
    license,
  ),
);
await writeFile(sheetPath, exportOds(importOds(new Uint8Array(ods)).sheets));
execFileSync(
  "python",
  [fileURLToPath(new URL("./validate-open-document.py", import.meta.url)), textPath, sheetPath],
  { stdio: "inherit", cwd: root, windowsHide: true },
);
