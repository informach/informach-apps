import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { plainText } from "@informach/edi-ocr/search";
import { windowsPowerShellEnvironment } from "../../../packages/edi-desktop/src/windows-powershell.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import type { OfficeDocument } from "../src/shared/office-format.ts";
import { officeDocumentSchema } from "../src/shared/office-format.ts";
import { renderOfficePdf } from "../src/shared/office-render.ts";
import { importRtf } from "../src/shared/office-rtf.ts";
import { exportRtf } from "../src/shared/rtf-export.ts";
import { rtfTokens } from "../src/shared/rtf-tokens.ts";

const ascii = (value: string) => new Uint8Array(Buffer.from(value, "ascii"));
const text = (document: OfficeDocument) =>
  document.pages
    .map((page) =>
      page.blocks
        .map((block) =>
          block.kind === "paragraph"
            ? block.runs.map((run) => run.text).join("")
            : block.kind === "table"
              ? block.rows.map((row) => row.join("\t")).join("\n")
              : "[image]",
        )
        .join("\n"),
    )
    .join("\f");
test("RTF generated independently by Windows RichEdit retains source text, font charset, style, color and alignment", async () => {
  const root = new URL("./fixtures/rtf/", import.meta.url),
    source = await readFile(new URL("richedit.rtf", root)),
    expected = await readFile(new URL("richedit.txt", root), "utf8"),
    result = importRtf(source, "RichEdit");
  assert.equal(text(result), expected);
  const first = result.pages[0]?.blocks[0];
  assert.ok(first?.kind === "paragraph");
  assert.equal(first.align, "center");
  assert.equal(first.runs[0]?.bold, true);
  assert.equal(first.runs[0]?.size, 16);
  assert.equal(first.runs[0]?.color, "#0000ff");
  const [regular, bold, italic, boldItalic] = await Promise.all(
    ["Regular", "Bold", "Italic", "BoldItalic"].map((name) =>
      readFile(new URL(`../resources/fonts/NotoSans-${name}.ttf`, import.meta.url)),
    ),
  );
  assert.ok(regular && bold && italic && boldItalic);
  const output = await renderOfficePdf(result, { regular, bold, italic, boldItalic });
  const require = createRequire(import.meta.url),
    engine = await LocalPdfEngine.create(
      await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
    );
  const extracted = engine
    .textDocument(output.bytes, { includeAnnotations: false })
    .pages.map((page) => plainText(page.glyphs))
    .join(" ");
  assert.match(extracted, /RTF_LOCAL_αβγ/);
  assert.match(extracted, /João e café/);
  assert.match(extracted, /ULTIMA_LINHA/);
});
test("RTF Unicode fallback, surrogate pairs, escaped braces and group scope preserve the actual characters", () => {
  const result = importRtf(
    ascii(
      String.raw`{\rtf1\ansi\uc1 A\u945?{\b B\u946?}C \uc2\u947?? \uc0\u-10179\u-8704  \{x\} \\}`,
    ),
    "Unicode",
  );
  assert.equal(text(result), `AαBβC γ 😀 {x} ${String.fromCharCode(92)}`);
  const paragraph = result.pages[0]?.blocks[0];
  assert.ok(paragraph?.kind === "paragraph");
  assert.equal(paragraph.runs.find((run) => run.text.includes("Bβ"))?.bold, true);
  assert.equal(paragraph.runs.find((run) => run.text.includes("C"))?.bold, false);
  const alternate = importRtf(
    ascii(
      String.raw`{\rtf1\ansi\ansicpg1251{\fonttbl{\f0\fcharset0 Test;}}\f0 \'cf\'f0\'e8\'e2\'e5\'f2}`,
    ),
    "Cyrillic",
  );
  assert.equal(text(alternate), "Привет");
});
test("RTF binary destinations cannot terminate groups or become visible text; hidden content and field instructions never execute", () => {
  const source = ascii(
    String.raw`{\rtf1 A{\*\private\bin3{\}}B{\v PRIVATE}\v0 C {\field{\*\fldinst INCLUDETEXT file:///secret}{\fldrslt VISIBLE}}}`,
  );
  assert.equal(text(importRtf(source, "Binary")), "ABC VISIBLE");
  assert.equal([...rtfTokens(source)].filter((token) => token.kind === "binary").length, 1);
  assert.equal(
    text(
      importRtf(
        ascii(String.raw`{\rtf1{\fonttbl{\f0\fcharset0 Test;}{\f1\fcharset199 Unknown;}}\f0 SAFE}`),
        "Unused font",
      ),
    ),
    "SAFE",
  );
  assert.throws(
    () =>
      importRtf(
        ascii(String.raw`{\rtf1{\fonttbl{\f1\fcharset199 Unknown;}}\f1 UNSAFE_MAPPING}`),
        "Unknown",
      ),
    /Charset/,
  );
});
test("RTF keeps complete table cells, explicit page breaks and physical page geometry", () => {
  const source = ascii(
    String.raw`{\rtf1\paperw12000\paperh16000\margl800\margr800\margt1000\margb1000 FIRST\par\trowd\cellx2000\cellx4000\intbl Nome\cell Valor\cell\row\trowd\cellx2000\cellx4000\intbl Jo\'e3o\cell 12,50\cell\row\pard\page SECOND}`,
  );
  const result = importRtf(source, "Table");
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0]?.width, 600);
  assert.equal(result.pages[0]?.height, 800);
  assert.deepEqual(result.pages[0]?.margins, { left: 40, right: 40, top: 50, bottom: 50 });
  const table = result.pages[0]?.blocks.find((block) => block.kind === "table");
  assert.ok(table?.kind === "table");
  assert.deepEqual(table.rows, [
    ["Nome", "Valor"],
    ["João", "12,50"],
  ]);
  assert.equal(text(result), "FIRST\nNome\tValor\nJoão\t12,50\fSECOND");
});
test("RTF cached list labels retain their numbers as text and do not gain another bullet", () => {
  const result = importRtf(
    ascii(String.raw`{\rtf1\pard\ls1{\listtext 12.\tab}ITEM\par\pard{\pntext 13.\tab}NEXT}`),
    "Lists",
  );
  assert.equal(text(result), "12.\tITEM\n13.\tNEXT");
  assert.ok(result.pages[0]?.blocks.every((block) => block.kind !== "paragraph" || !block.bullet));
});
test("RTF images preserve PNG bytes and reject unsupported crops instead of exposing hidden pixels", async () => {
  const png = await readFile(new URL("./fixtures/tiff/rgb-raw-1.png", import.meta.url)),
    hex = png.toString("hex");
  const result = importRtf(
    ascii(`{\\rtf1 BEFORE\\par{\\pict\\pngblip\\picwgoal1280\\pichgoal960 ${hex}}AFTER}`),
    "Picture",
  );
  const image = result.pages[0]?.blocks.find((block) => block.kind === "image");
  assert.ok(image?.kind === "image");
  assert.equal(Buffer.compare(Buffer.from(image.bytes), png), 0);
  assert.equal(image.width, 64);
  assert.equal(image.height, 48);
  assert.equal(text(result), "BEFORE\n[image]\nAFTER");
  assert.throws(
    () => importRtf(ascii(`{\\rtf1{\\pict\\pngblip\\piccropl100 ${hex}}}`), "Cropped"),
    /ocultas/,
  );
});
test("RTF rejects incomplete groups, binary overruns, invalid Unicode limits and unsupported active content before adoption", () => {
  for (const source of [
    String.raw`{\rtf1 Missing`,
    String.raw`{\rtf1}EXTRA`,
    String.raw`{\rtf1\u999999?}`,
    String.raw`{\rtf1\bin9999 x}`,
    String.raw`{\rtf1{\object\objdata 00}}`,
    String.raw`{\rtf1\trowd\cellx1000 A\row}`,
    String.raw`{\rtf1` + "{".repeat(101) + "}".repeat(102),
    String.raw`{\rtf1\'GG}`,
  ])
    assert.throws(() => importRtf(ascii(source), "Bad input"));
});

async function exportInput() {
  const image = new Uint8Array(
    await readFile(new URL("./fixtures/tiff/rgb-raw-1.png", import.meta.url)),
  );
  return officeDocumentSchema.parse({
    title: "RTF editável",
    warnings: [],
    pages: [
      {
        width: 600,
        height: 800,
        margins: { left: 40, right: 40, top: 50, bottom: 50 },
        blocks: [
          {
            kind: "paragraph",
            align: "center",
            runs: [
              { text: "EDITAVEL_αβγ João café {literal}", size: 18, bold: true, color: "#0000ff" },
            ],
          },
          {
            kind: "table",
            header: true,
            rows: [
              ["Nome", "Valor"],
              ["Maria", 12.5],
            ],
          },
          { kind: "image", format: "png", bytes: image, width: 64, height: 48 },
          { kind: "table", rows: [["ULTIMA_CELULA", "=SUM(1)"]] },
        ],
      },
      {
        width: 800,
        height: 600,
        blocks: [{ kind: "paragraph", runs: [{ text: "SEGUNDA_SECAO", italic: true }] }],
      },
    ],
  });
}
test("RTF export retains Unicode, sections, margins, formatting, images and table order without active destinations", async () => {
  const input = await exportInput(),
    output = exportRtf(input),
    result = importRtf(output.bytes, "Returned");
  assert.deepEqual(
    result.pages.map((page) => [page.width, page.height]),
    [
      [600, 800],
      [800, 600],
    ],
  );
  assert.deepEqual(result.pages[0]?.margins, input.pages[0]?.margins);
  const blocks = result.pages[0]?.blocks;
  assert.ok(blocks);
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph", "table", "image", "table"],
  );
  assert.ok(blocks[0]?.kind === "paragraph");
  assert.equal(blocks[0].runs[0]?.color, "#0000ff");
  assert.ok(blocks[1]?.kind === "table");
  assert.equal(blocks[1].header, true);
  assert.equal(blocks[1].rows[1]?.[1], "12.5");
  assert.ok(blocks[3]?.kind === "table");
  assert.equal(blocks[3].rows[0]?.[0], "ULTIMA_CELULA");
  assert.match(text(result), /EDITAVEL_αβγ João café \{literal\}/);
  assert.match(text(result), /SEGUNDA_SECAO/);
  assert.equal(
    /\\(?:object|objdata|fldinst)\b/.test(new TextDecoder().decode(output.bytes)),
    false,
  );
  assert.ok(output.warnings.some((warning) => warning.includes("sem incorporar")));
});
test("Windows RichEdit independently accepts generated RTF and preserves editable Unicode, table values and later sections", {
  skip: process.platform !== "win32",
}, async () => {
  const output = exportRtf(await exportInput()),
    source = new TextDecoder().decode(output.bytes);
  const code = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); Add-Type -AssemblyName System.Windows.Forms; $payload=[Console]::ReadLine() | ConvertFrom-Json; $reader=New-Object Windows.Forms.RichTextBox; try { $reader.Rtf=$payload.rtf; [Console]::WriteLine(($reader.Text | ConvertTo-Json -Compress)) } finally { $reader.Dispose() }`;
  const actual = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-STA", "-Command", code],
      {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        env: windowsPowerShellEnvironment(),
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const parsed: unknown = JSON.parse(stdout);
          assert.equal(typeof parsed, "string");
          if (typeof parsed !== "string") throw new Error("RichEdit returned a non-text value");
          resolve(parsed);
        } catch (failure) {
          reject(failure);
        }
      },
    );
    child.stdin?.end(JSON.stringify({ rtf: source }));
  });
  for (const value of [
    "EDITAVEL_αβγ",
    "João café {literal}",
    "Maria",
    "12.5",
    "ULTIMA_CELULA",
    "=SUM(1)",
    "SEGUNDA_SECAO",
  ])
    assert.ok(actual.includes(value), value);
  assert.ok(actual.indexOf("ULTIMA_CELULA") < actual.indexOf("SEGUNDA_SECAO"));
});
