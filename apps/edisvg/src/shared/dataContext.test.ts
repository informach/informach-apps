import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { inspectBehavior } from "./behaviorInspection";
import { compileInteractiveArtboard } from "./interactive";
import { newProject, parseProject } from "./project";

test("the artboard's model and bound instance are a project v24 / blueprint v13 capability", () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  board.behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-price", name: "Preço", kind: "number", min: 0, max: 1000, initial: 0 }],
    data: {
      version: 1,
      models: [
        {
          id: "model-product",
          name: "Produto",
          fields: [{ id: "field-price", name: "Preço", kind: "number", min: 0, max: 1000 }],
        },
      ],
      instances: [
        {
          id: "instance-a",
          name: "Caneca",
          modelId: "model-product",
          value: { "field-price": 30 },
        },
        {
          id: "instance-b",
          name: "Camiseta",
          modelId: "model-product",
          value: { "field-price": 80 },
        },
      ],
      context: { modelId: "model-product", instanceId: "instance-b" },
      links: [
        {
          id: "link-price",
          instanceId: null,
          path: ["field-price"],
          inputId: "input-price",
          direction: "one-way",
        },
      ],
    },
  };
  const parsed = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(parsed.artboards[0]?.behavior?.data?.context, {
    modelId: "model-product",
    instanceId: "instance-b",
  });
  // The assistant must see the binding to keep it when it replaces behavior.
  assert.deepEqual(
    inspectBehavior(parsed.artboards[0]?.behavior, { collection: "dataLinks" }).dataContext,
    { modelId: "model-product", instanceId: "instance-b" },
  );
  assert.throws(
    () => parseProject({ ...structuredClone(project), version: 23 }),
    /Modelo da prancheta requer projeto v24/,
  );
  const compiled = compileInteractiveArtboard(parsed, board.id);
  assert.equal(
    parseInteractiveDocument(compiled.document).behavior.data?.links[0]?.instanceId,
    null,
  );
  assert.throws(
    () => parseInteractiveDocument({ ...structuredClone(compiled.document), version: 12 }),
    /Modelo da prancheta requer blueprint v13/,
  );
});
