import assert from "node:assert/strict";
import { test } from "node:test";
import { transformPoint } from "@informach/edi-motion";
import type { FontAsset } from "@informach/edi-motion/assets";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { arabicFontFixture, fontFixture } from "../../tests/assetFixtures";
import { nodeMatrix } from "./composition";
import { executeDocumentTransaction } from "./documentCommands";
import { inspectFontCoverage } from "./fontInspection";
import { compileInteractiveArtboard } from "./interactive";
import { parsePath } from "./pathGeometry.js";
import { newProject, parseProject } from "./project";
import { renderScene } from "./scene.js";
import { textPathFromShape, textPathSources } from "./textPath";

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

test("text follows its own copy of a sibling shape, in the text's local space", () => {
  const f = typed("Ao longo da curva");
  const shape = f.run([
    {
      type: "scene",
      operation: "add",
      targetId: null,
      value: { tag: "path", attrs: { d: "M10 80 C60 10 140 10 190 80", fill: "none" } },
    },
  ]).selected;
  assert.ok(shape);
  // The text is moved and scaled; the copied curve must cancel that motion.
  f.run([
    {
      type: "scene",
      operation: "transform",
      targetId: f.id,
      value: { x: 40, y: -10, sx: 2, sy: 2 },
    },
  ]);
  const scene = () => {
    const value = f.project().artboards[0]?.scene;
    assert.ok(value);
    return value;
  };
  assert.deepEqual(
    textPathSources(scene(), f.id).map(({ node }) => node.id),
    [shape],
  );
  const textPath = textPathFromShape(scene(), f.id, shape, 50);
  const [contour] = parsePath(textPath.d);
  const first = contour?.points[0];
  assert.ok(first);
  // Mapped back through the text's own matrix, the copy lands on the shape.
  const text = f.node();
  assert.ok(text);
  const world = transformPoint(nodeMatrix(text), first.x, first.y);
  assert.ok(Math.abs(world.x - 10) < 1e-6 && Math.abs(world.y - 80) < 1e-6, JSON.stringify(world));
  f.run([{ type: "scene", operation: "text-path", targetId: f.id, value: textPath }]);
  assert.deepEqual(f.node()?.textPath, textPath);
  assert.equal(f.node()?.textLayout, undefined);
  const svg = renderScene(scene());
  assert.match(svg, /<path id="edi-text-path-node-[\w-]+" d="M/);
  assert.match(
    svg,
    /<textPath href="#edi-text-path-node-[\w-]+" startOffset="50%">Ao longo da curva</,
  );
  assert.throws(
    () =>
      f.run([
        { type: "scene", operation: "text-layout", targetId: f.id, value: { lineHeight: 1.2 } },
      ]),
    /uma linha/,
  );
  assert.throws(
    () => parseProject({ ...structuredClone(f.project()), version: 22 }),
    /requer projeto v23/,
  );
  const board = f.project().artboards[0];
  assert.ok(board);
  const compiled = compileInteractiveArtboard(f.project(), board.id);
  assert.deepEqual(
    parseInteractiveDocument(compiled.document).content.find((object) => object.id === f.id)?.visual
      ?.textPath,
    textPath,
  );
  assert.match(compiled.svg, /<textPath href="#edi-text-path-/);
  f.run([{ type: "scene", operation: "text-path", targetId: f.id, value: null }]);
  assert.equal(f.node()?.textPath, undefined);
});
