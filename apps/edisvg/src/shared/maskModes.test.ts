import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, PROJECT_VERSION, parseProject } from "./project";
import { renderScene } from "./scene.js";

test("luminance masks are a v23/v12 capability set through the shared command", () => {
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
    };
  run([
    { type: "scene", operation: "add", targetId: null, value: "rect" },
    { type: "scene", operation: "add", targetId: null, value: "circle" },
  ]);
  const [target, source] = project.artboards[0]?.scene.nodes ?? [];
  assert.ok(target && source);
  run([
    { type: "scene", operation: "attrs", targetId: source.id, value: { fill: "#808080" } },
    {
      type: "scene",
      operation: "effects",
      targetId: target.id,
      value: { mask: { sourceId: source.id, rule: "nonzero", opacity: 1, mode: "luminance" } },
    },
  ]);
  const scene = project.artboards[0]?.scene;
  assert.ok(scene);
  const svg = renderScene(scene);
  assert.match(svg, /<mask [^>]*mask-type="luminance"/);
  assert.match(svg, /<mask [^>]*>.*fill="#808080"/);
  assert.throws(
    () => parseProject({ ...project, version: 22 }),
    /Modos de máscara requerem projeto v23/,
  );
  const board = project.artboards[0];
  assert.ok(board);
  const compiled = compileInteractiveArtboard(project, board.id);
  assert.equal(
    compiled.document.content.find((item) => item.effects)?.effects?.mask?.mode,
    "luminance",
  );
  assert.throws(
    () => parseInteractiveDocument({ ...compiled.document, version: 11 }),
    /Modos de máscara requerem blueprint v12/,
  );
  // Silhouette keeps the historical shape of the field: no mode is written.
  run([
    {
      type: "scene",
      operation: "effects",
      targetId: target.id,
      value: { mask: { sourceId: source.id, rule: "nonzero", opacity: 1 } },
    },
  ]);
  assert.equal(parseProject({ ...project, version: 22 }).version, PROJECT_VERSION);
});
