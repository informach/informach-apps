import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { zlibSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { readTrueTypeProgram } from "../src/shared/font-program.ts";

test("TrueType font streams decode exactly with bounded expansion and reject other filters", async () => {
  const pdf = await PDFDocument.create(),
    bytes = new Uint8Array(
      await readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
    );
  const font = (contents: Uint8Array, filter?: string) =>
    pdf.context.obj({
      Type: "Font",
      Subtype: "TrueType",
      FontDescriptor: {
        FontFile2: pdf.context.register(
          pdf.context.stream(contents, filter ? { Filter: filter } : {}),
        ),
      },
    });
  assert.deepEqual(readTrueTypeProgram(pdf, font(bytes)), bytes);
  assert.deepEqual(readTrueTypeProgram(pdf, font(zlibSync(bytes), "FlateDecode")), bytes);
  assert.throws(() => readTrueTypeProgram(pdf, font(bytes, "ASCII85Decode")), /Compressão/);
  assert.throws(
    () => readTrueTypeProgram(pdf, font(zlibSync(new Uint8Array(9 * 1024 * 1024)), "FlateDecode")),
    /expandida/,
  );
});
