import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior, parseFormulaText } from "@informach/edi-motion/behavior";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { inspectBehavior } from "./behaviorInspection";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, parseProject } from "./project";

test("formulas are a project v23 / blueprint v12 capability and are inspectable", () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  board.behavior = {
    ...emptyBehavior(),
    inputs: [
      { id: "input-points", name: "Pontos", kind: "number", min: 0, max: 100, initial: 4 },
      { id: "input-square", name: "Quadrado", kind: "number", min: 0, max: 10000, initial: 0 },
    ],
    formulas: [
      {
        id: "formula-square",
        inputId: "input-square",
        expression: parseFormulaText("$input-points * $input-points"),
      },
    ],
  };
  const parsed = parseProject(project);
  assert.throws(
    () => parseProject({ ...structuredClone(project), version: 22 }),
    /Fórmulas requerem projeto v23/,
  );
  const listing = inspectBehavior(parsed.artboards[0]?.behavior, { collection: "formulas" });
  assert.equal(listing.total, 1);
  assert.deepEqual(listing.items[0], {
    id: "formula-square",
    inputId: "input-square",
    nodes: 3,
  });
  const compiled = compileInteractiveArtboard(parsed, board.id);
  assert.equal(parseInteractiveDocument(compiled.document).behavior.formulas?.length, 1);
  assert.throws(
    () => parseInteractiveDocument({ ...structuredClone(compiled.document), version: 11 }),
    /Fórmulas requerem blueprint v12/,
  );
});
