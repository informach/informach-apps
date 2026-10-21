import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, parseProject } from "./project";
import { editScene } from "./scene.js";

function project(live: boolean, bound: boolean) {
  const value = newProject(),
    board = value.artboards[0];
  if (!board) throw new Error("Missing board");
  const id = editScene(board.scene, null, "add", "rect");
  if (!id) throw new Error("Missing shape");
  editScene(board.scene, id, "semantics", {
    kind: "image",
    label: "Placar",
    ...(live ? { live: "assertive" } : {}),
  });
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-name", name: "Nome", kind: "string", initial: "Ana" }],
    bindings: bound
      ? [
          {
            id: "binding-name",
            kind: "semantics",
            inputId: "input-name",
            targetId: id,
            property: "label",
            template: "Vez de {valor}",
            direction: "one-way",
          },
        ]
      : [],
  };
  return { value, boardId: board.id };
}

test("live regions and semantic bindings are project v23 and blueprint v12 capabilities", () => {
  for (const [live, bound, message] of [
    [true, false, /Região viva requer projeto v23/],
    [false, true, /Binding semântico requer projeto v23/],
  ] as const) {
    const f = project(live, bound);
    assert.throws(() => parseProject({ ...structuredClone(f.value), version: 22 }), message);
  }
  const f = project(true, true),
    compiled = compileInteractiveArtboard(parseProject(f.value), f.boardId);
  assert.match(compiled.svg, /aria-live="assertive"/);
  assert.match(compiled.svg, /aria-label="Placar"/);
  assert.throws(
    () => parseInteractiveDocument({ ...structuredClone(compiled.document), version: 11 }),
    /requer blueprint v12/,
  );
});
