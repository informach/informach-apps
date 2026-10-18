import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDataModels, parseDataModels } from "@informach/edi-motion/data";
import { dataLeafPaths, reconcileDataDefinitions } from "./data-model-editing";

test("definition edits preserve retained nested/list values and add defaults to every affected instance", () => {
  const data = emptyDataModels();
  data.models = [
    {
      id: "model-row",
      name: "Linha",
      fields: [{ id: "field-label", name: "Nome", kind: "string" }],
    },
    {
      id: "model-root",
      name: "Raiz",
      fields: [{ id: "field-rows", name: "Linhas", kind: "list", modelId: "model-row" }],
    },
  ];
  data.instances = [
    {
      id: "instance-root",
      name: "Raiz",
      modelId: "model-root",
      value: { "field-rows": [{ id: "item-row", value: { "field-label": "Ana" } }] },
    },
  ];
  const before = structuredClone(data);
  data.models[0]?.fields.push({
    id: "field-count",
    name: "Contagem",
    kind: "number",
    min: 2,
    max: 10,
  });
  const next = reconcileDataDefinitions(data),
    context = parseDataModels(next);
  assert.deepEqual(context.initial.get("instance-root"), {
    "field-rows": [{ id: "item-row", value: { "field-label": "Ana", "field-count": 2 } }],
  });
  assert.deepEqual(data.instances, before.instances);
  assert.deepEqual(
    dataLeafPaths(context, "instance-root").map((value) => value.path),
    [
      ["field-rows", "item-row", "field-label"],
      ["field-rows", "item-row", "field-count"],
    ],
  );
  data.links = [
    {
      id: "link-name",
      instanceId: "instance-root",
      path: ["field-rows", "item-row", "field-label"],
      inputId: "input-name",
      direction: "one-way",
    },
  ];
  const model = data.models[0];
  if (!model) throw new Error("Missing model");
  model.fields = model.fields.filter((field) => field.id !== "field-label");
  assert.throws(() => reconcileDataDefinitions(data), /órfão/);
});
