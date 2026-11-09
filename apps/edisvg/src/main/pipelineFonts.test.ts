import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_FONTS } from "../shared/pipelines";
import { pipelineFont, pipelineFonts } from "./pipelineFonts";

/** EdiAula's bundle, where development reads it (the installer copies it beside EdiSVG). */
const ediaula = (path: string) =>
  fileURLToPath(new URL(`../../../ediaula/resources/${path}`, import.meta.url));
const source = { dir: ediaula("fonts"), manifest: ediaula("fonts.json") };

test("the pipeline fonts are EdiAula's bundle, with Baloo 2 and Nunito among them", async () => {
  const families = await pipelineFonts(source);
  const byName = new Map(families.map((f) => [f.family, f.weights]));
  assert.deepEqual(byName.get(DEFAULT_FONTS.title), [400, 600, 700, 800]);
  assert.deepEqual(byName.get(DEFAULT_FONTS.body), [400, 600, 700, 800, 900]);
  assert.ok(families.length >= 10);
});

test("a font comes by family and weight, with its copyright and the OFL text", async () => {
  const font = await pipelineFont(source, "Baloo 2", 700);
  assert.equal(font.name, "Baloo2-700.ttf");
  assert.ok(font.bytes.length > 100_000);
  // The bytes are the file's, as LICENSES.txt records it.
  const sha = createHash("sha256").update(font.bytes).digest("hex");
  assert.match(font.notice, /^Copyright 2019 The Baloo 2 Project Authors/);
  assert.match(font.notice, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(font.notice, /OTHER DEALINGS IN THE FONT SOFTWARE\.$/);
  assert.doesNotMatch(font.notice, /SHA-256/);
  assert.ok(font.notice.length < 16000);
  assert.match(
    readFileSync(ediaula("fonts/LICENSES.txt"), "utf8"),
    new RegExp(`Baloo2-700.ttf\n[^]*?SHA-256: ${sha}`),
  );
  // Nothing outside the list: a path, a weight the family lacks, an unknown family.
  for (const [family, weight] of [
    ["../../secret", 400],
    ["Baloo 2", 300],
    ["Comic Sans", 400],
    ["Nunito", "400"],
  ] as const)
    await assert.rejects(pipelineFont(source, family, weight), /não vem com o EdiSVG/);
});

test("without the bundle the list says so in Portuguese", async () => {
  await assert.rejects(
    pipelineFonts({ dir: ediaula("nao-existe"), manifest: ediaula("nao-existe.json") }),
    /As fontes do EdiSVG não foram encontradas/,
  );
});
