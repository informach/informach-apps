import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { exportPdfTable } from "../src/shared/table-export.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  directory = resolve(root, ".cache/edipdf-analysis/table-export"),
  require = createRequire(import.meta.url);
await mkdir(directory, { recursive: true });
const engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  ),
  document = await PDFDocument.create();
document.registerFontkit(fontkit);
const font = await document.embedFont(
  await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
  { subset: true },
);
const page = document.addPage([600, 800]);
for (const [text, x, y] of [
  ["Produto", 50, 700],
  ["Valor", 300, 700],
  ["Ação αβγ", 50, 670],
  ["12,50", 300, 670],
  ["=1+2", 50, 640],
] as const)
  page.drawText(text, { x, y, font, size: 12 });
const source = new Uint8Array(await document.save());
await writeFile(join(directory, "source.pdf"), source);
for (const format of ["xlsx", "ods", "csv", "json"] as const) {
  const result = await exportPdfTable(
    source,
    "Local independent table",
    engine,
    { page: 0, area: { x: 40, y: 80, w: 500, h: 100 }, separators: [250], header: true },
    format,
  );
  await writeFile(join(directory, `table.${format}`), result.bytes);
}
execFileSync(
  "python",
  [
    fileURLToPath(new URL("./validate-open-document.py", import.meta.url)),
    join(directory, "table.ods"),
  ],
  { stdio: "inherit", cwd: root, windowsHide: true },
);
execFileSync(
  "python",
  [fileURLToPath(new URL("./validate-table-export.py", import.meta.url)), directory],
  { stdio: "inherit", cwd: root, windowsHide: true },
);
