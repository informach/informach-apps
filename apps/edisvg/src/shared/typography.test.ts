import assert from "node:assert/strict";
import { test } from "node:test";
import type { FontAsset } from "@informach/edi-motion/assets";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { arabicFontFixture, fontFixture } from "../../tests/assetFixtures";
import { executeDocumentTransaction } from "./documentCommands";
import { inspectFontCoverage } from "./fontInspection";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, parseProject } from "./project";
import { renderScene } from "./scene.js";

function typed(text: string, fonts: FontAsset[] = []) {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
      return result;
    };
  for (const font of fonts) run([{ type: "asset", operation: "put", value: font }]);
  const id = run([{ type: "scene", operation: "add", targetId: null, value: "text" }]).selected;
  assert.ok(id);
  run([{ type: "scene", operation: "text", targetId: id, value: text }]);
  if (fonts[0])
    run([
      {
        type: "asset",
        operation: "set-font",
        assetId: fonts[0].id,
        fontFallbackIds: fonts.slice(1).map((font) => font.id),
        targetId: id,
      },
    ]);
  const node = () => project.artboards[0]?.scene.nodes.find((item) => item.id === id);
  return { id, run, project: () => project, node };
}

test("auto direction follows the text and replaces an explicit direction", () => {
  const f = typed("שלום abc");
  f.run([{ type: "scene", operation: "text-direction", targetId: f.id, value: "rtl" }]);
  assert.equal(f.node()?.attrs.direction, "rtl");
  f.run([{ type: "scene", operation: "text-direction", targetId: f.id, value: "auto" }]);
  assert.equal(f.node()?.textDirection, "auto");
  assert.equal(f.node()?.attrs.direction, undefined);
  const scene = f.project().artboards[0]?.scene;
  assert.ok(scene);
  assert.match(renderScene(scene), /<text[^>]* direction="rtl"/);
  f.run([{ type: "scene", operation: "text", targetId: f.id, value: "Olá שלום" }]);
  const latin = f.project().artboards[0]?.scene;
  assert.ok(latin);
  assert.match(renderScene(latin), /<text[^>]* direction="ltr"/);
  assert.throws(
    () =>
      f.run([{ type: "scene", operation: "attrs", targetId: f.id, value: { direction: "rtl" } }]),
    /sem direção explícita/,
  );
  assert.throws(
    () => parseProject({ ...structuredClone(f.project()), version: 22 }),
    /requer projeto v23/,
  );
  const board = f.project().artboards[0];
  assert.ok(board);
  const compiled = compileInteractiveArtboard(f.project(), board.id);
  const content = parseInteractiveDocument(compiled.document).content.find(
    (object) => object.id === f.id,
  );
  assert.equal(content?.textDirection, "auto");
  assert.equal(content?.visual?.textDirection, "auto");
  assert.throws(
    () => parseInteractiveDocument({ ...structuredClone(compiled.document), version: 11 }),
    /blueprint v12/,
  );
});

test("exports refuse Arabic drawn by a font without its contextual substitutions", () => {
  const greeting = "مرحبا بالعالم",
    shaped = typed(greeting, [arabicFontFixture()]),
    unjoined = typed(greeting, [arabicFontFixture(true)]),
    sceneOf = (f: ReturnType<typeof typed>) => {
      const scene = f.project().artboards[0]?.scene;
      assert.ok(scene);
      return scene;
    };
  assert.match(
    renderScene(sceneOf(shaped), { assets: shaped.project().assets, verifyFonts: true }),
    /<text/,
  );
  assert.throws(
    () => renderScene(sceneOf(unjoined), { assets: unjoined.project().assets, verifyFonts: true }),
    /formas contextuais.*não aplica/,
  );
  const report = inspectFontCoverage(sceneOf(unjoined), unjoined.project().assets, {
    id: unjoined.id,
  });
  assert.equal(report.coverage?.unshapedCount, 12);
  assert.equal(report.coverage?.unshaped[0]?.script, "árabe");
  // Latin first, Arabic font as fallback: each cluster is drawn by a font that can shape it.
  const mixed = typed(`Olá ${greeting}`, [fontFixture(), arabicFontFixture()]);
  assert.equal(
    inspectFontCoverage(sceneOf(mixed), mixed.project().assets, { id: mixed.id }).coverage?.covered,
    true,
  );
});
