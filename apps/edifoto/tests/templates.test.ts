import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDocument } from "../src/shared/documentFormat.ts";
import { createImageTemplate, IMAGE_TEMPLATES } from "../src/shared/templates.ts";

test("templates create independent editable documents with generic labels", () => {
  for (const template of IMAGE_TEMPLATES) {
    const first = createImageTemplate(template.id),
      second = createImageTemplate(template.id);
    validateDocument(first);
    assert.notEqual(first.id, second.id);
    assert.ok(first.layers.some((l) => l.kind === "text"));
    assert.ok(first.layers.every((l) => l.kind !== "raster"));
    assert.doesNotMatch(template.name, /aula|professor|escola/i);
    assert.notEqual(first.layers[0].id, second.layers[0].id);
  }
});
