import assert from "node:assert/strict";
import { test } from "node:test";
import { newProject } from "../../shared/project";
import { editScene } from "../../shared/scene.js";
import { createCompositionPreview } from "./compositionPreview";

test("composition previews prepare native effect sources instead of treating them as missing paths", () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  const source = editScene(board.scene, null, "add", {
      tag: "circle",
      attrs: { cx: "40", cy: "40", r: "28" },
    }),
    target = editScene(board.scene, null, "add", {
      tag: "rect",
      attrs: { width: "90", height: "90" },
    });
  assert.ok(source && target);
  editScene(board.scene, source, "visibility", false);
  editScene(board.scene, target, "effects", { clip: { sourceId: source, rule: "nonzero" } });
  const before = JSON.stringify(project),
    result = createCompositionPreview()(
      { sessionId: crypto.randomUUID(), revision: 0, artboardId: board.id },
      () => project,
    );
  assert.ok(result);
  assert.equal(result.effectContext.objects.get(source)?.nativeShape?.kind, "circle");
  assert.match(result.markup, /clipPath[^>]*><circle/);
  assert.equal(JSON.stringify(project), before);
});

test("navigation reuses a bounded preview, while edits and document sessions invalidate it", () => {
  const project = newProject(),
    preview = createCompositionPreview(),
    context = {
      sessionId: crypto.randomUUID(),
      revision: 0,
      artboardId: project.defaultArtboardId,
    };
  const first = preview(context, () => project);
  assert.ok(first);
  assert.equal(
    preview(context, () => {
      throw new Error("Navigation must not rebuild a document");
    }),
    first,
  );
  assert.notEqual(
    preview({ ...context, revision: 1 }, () => project),
    first,
  );
  assert.notEqual(
    preview({ ...context, sessionId: crypto.randomUUID() }, () => project),
    first,
  );
  assert.equal(
    preview({ ...context, artboardId: null }, () => project),
    null,
  );
});
