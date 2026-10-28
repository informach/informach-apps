import { expect, test } from "vitest";
import {
  advanceBehavior,
  bindBehaviorDataInstance,
  createBehaviorContext,
  createBehaviorSession,
  editBehaviorData,
  evaluateBehavior,
  setBehaviorInput,
} from "../behavior/engine";
import { emptyBehavior } from "../behavior/model";
import { identityTransform } from "../model";
import { applyDataChanges } from "./commands";
import {
  type DataModelDocument,
  defaultDataRecord,
  parseDataModels,
  resolveDataPath,
} from "./model";

function document(): DataModelDocument {
  return {
    version: 1,
    models: [
      {
        id: "model-person",
        name: "Pessoa",
        fields: [
          { id: "field-name", name: "Nome", kind: "string" },
          { id: "field-score", name: "Pontos", kind: "number", min: 0, max: 100 },
        ],
      },
      {
        id: "model-class",
        name: "Turma",
        fields: [
          { id: "field-teacher", name: "Professor", kind: "model", modelId: "model-person" },
          { id: "field-rows", name: "Alunos", kind: "list", modelId: "model-person" },
        ],
      },
    ],
    instances: [
      {
        id: "instance-class",
        name: "Turma A",
        modelId: "model-class",
        value: {
          "field-teacher": { "field-name": "Ana", "field-score": 50 },
          "field-rows": [
            { id: "item-a", value: { "field-name": "Bia", "field-score": 20 } },
            { id: "item-b", value: { "field-name": "Caio", "field-score": 30 } },
          ],
        },
      },
    ],
    links: [],
  };
}
test("composed data and stable-ID lists persist, reorder, insert and remove without aliasing the original", () => {
  const context = parseDataModels(document()),
    source = context.initial,
    before = structuredClone(new Map(source));
  const changed = applyDataChanges(context, source, [
    {
      operation: "move",
      instanceId: "instance-class",
      path: ["field-rows"],
      id: "item-a",
      index: 1,
    },
    {
      operation: "set",
      instanceId: "instance-class",
      path: ["field-rows", "item-a", "field-name"],
      value: "Bia nova",
    },
    {
      operation: "insert",
      instanceId: "instance-class",
      path: ["field-rows"],
      id: "item-c",
      index: 0,
    },
  ]);
  expect(
    resolveDataPath(context, changed, "instance-class", ["field-rows", "item-a", "field-name"])
      .value,
  ).toBe("Bia nova");
  expect(
    resolveDataPath(context, changed, "instance-class", ["field-rows", "item-c", "field-score"])
      .value,
  ).toBe(0);
  expect([...source]).toEqual([...before]);
  expect(defaultDataRecord(context, "model-class")).toEqual({
    "field-teacher": { "field-name": "", "field-score": 0 },
    "field-rows": [],
  });
  expect(
    applyDataChanges(context, changed, [
      { operation: "remove", instanceId: "instance-class", path: ["field-rows"], id: "item-c" },
    ]).size,
  ).toBe(1);
  expect(() =>
    applyDataChanges(context, source, [
      {
        operation: "set",
        instanceId: "instance-class",
        path: ["field-teacher", "field-score"],
        value: 40,
      },
      {
        operation: "set",
        instanceId: "instance-class",
        path: ["field-teacher", "field-score"],
        value: 101,
      },
    ]),
  ).toThrow(/intervalo/);
  expect([...source]).toEqual([...before]);
});
test("data models reject cycles, orphan links, unsafe/excessive values and deleting a linked stable item", () => {
  const value = document();
  value.models[0]?.fields.push({
    id: "field-loop",
    name: "Ciclo",
    kind: "model",
    modelId: "model-class",
  });
  expect(() => parseDataModels(value)).toThrow(/cíclicos/);
  const linked = document();
  linked.links.push({
    id: "link-a",
    instanceId: "instance-class",
    path: ["field-rows", "item-a", "field-name"],
    inputId: "input-name",
    direction: "two-way",
  });
  const context = parseDataModels(linked);
  expect(() =>
    applyDataChanges(context, context.initial, [
      { operation: "remove", instanceId: "instance-class", path: ["field-rows"], id: "item-a" },
    ]),
  ).toThrow(/não existe/);
  const cycle: Record<string, unknown> = {};
  cycle.child = cycle;
  expect(() => parseDataModels(cycle)).toThrow(/cíclicos/);
  expect(() => parseDataModels(JSON.parse('{"constructor":1}'))).toThrow(/reservada/);
  const large = document();
  const instance = large.instances[0];
  if (!instance) throw new Error("Missing instance");
  instance.value = {
    "field-teacher": { "field-name": "x".repeat(10001), "field-score": 20 },
    "field-rows": [],
  };
  expect(() => parseDataModels(large)).toThrow(/inválido/);
});
test("data links drive inputs and actual poses bidirectionally, remain atomic, and time advancement does not copy immutable data", () => {
  const data = document();
  data.links.push({
    id: "link-score",
    instanceId: "instance-class",
    path: ["field-teacher", "field-score"],
    inputId: "input-score",
    direction: "two-way",
  });
  const behavior = {
    ...emptyBehavior(),
    data,
    inputs: [{ id: "input-score", name: "Pontos", kind: "number", min: 0, max: 100, initial: 0 }],
    bindings: [
      {
        id: "binding-x",
        kind: "transform",
        inputId: "input-score",
        targetId: "node-body",
        property: "x",
        scale: 2,
        offset: 0,
        direction: "two-way",
      },
    ],
  };
  const objects = new Map([["node-body", { tag: "rect", transform: identityTransform() }]]),
    context = createBehaviorContext(behavior, [], objects),
    initial = createBehaviorSession(context);
  expect(initial.inputs.get("input-score")).toBe(50);
  expect(evaluateBehavior(context, initial).poses.get("node-body")?.x).toBe(100);
  const changed = setBehaviorInput(context, initial, "input-score", 70);
  if (!context.data || !changed.data) throw new Error("Missing data");
  expect(
    resolveDataPath(context.data, changed.data, "instance-class", ["field-teacher", "field-score"])
      .value,
  ).toBe(70);
  const stepped = advanceBehavior(context, changed, 0.2).session;
  expect(stepped.data).toBe(changed.data);
  expect(stepped.inputs).toBe(changed.inputs);
  expect(
    editBehaviorData(context, changed, [
      {
        operation: "set",
        instanceId: "instance-class",
        path: ["field-teacher", "field-score"],
        value: 30,
      },
    ]).inputs.get("input-score"),
  ).toBe(30);
  expect(initial.inputs.get("input-score")).toBe(50);
  const link = data.links[0];
  if (!link) throw new Error("Missing link");
  data.links[0] = { ...link, direction: "one-way" };
  expect(() => createBehaviorContext({ ...behavior, data }, [], objects)).toThrow(
    /somente leitura/,
  );
  const readonly = createBehaviorContext(
    {
      ...behavior,
      data,
      bindings: behavior.bindings.map((binding) => ({ ...binding, direction: "one-way" })),
    },
    [],
    objects,
  );
  expect(() =>
    setBehaviorInput(readonly, createBehaviorSession(readonly), "input-score", 70),
  ).toThrow(/somente leitura/);
});

test("the artboard's bound instance drives null-instance links and can be swapped at runtime", () => {
  const data = document();
  data.instances.push({
    id: "instance-class-b",
    name: "Turma B",
    modelId: "model-class",
    value: {
      "field-teacher": { "field-name": "Davi", "field-score": 80 },
      "field-rows": [],
    },
  });
  data.context = { modelId: "model-class", instanceId: "instance-class" };
  data.links.push({
    id: "link-score",
    instanceId: null,
    path: ["field-teacher", "field-score"],
    inputId: "input-score",
    direction: "two-way",
  });
  const behavior = {
      ...emptyBehavior(),
      data,
      inputs: [{ id: "input-score", name: "Pontos", kind: "number", min: 0, max: 100, initial: 0 }],
    },
    context = createBehaviorContext(behavior, [], new Map()),
    initial = createBehaviorSession(context);
  expect(initial.dataInstanceId).toBe("instance-class");
  expect(initial.inputs.get("input-score")).toBe(50);
  const swapped = bindBehaviorDataInstance(context, initial, "instance-class-b");
  expect(swapped.inputs.get("input-score")).toBe(80);
  // Two-way writes go to whichever instance is bound, never the default one.
  const written = setBehaviorInput(context, swapped, "input-score", 90);
  if (!context.data || !written.data) throw new Error("Missing data");
  const score = (instanceId: string) =>
    context.data &&
    written.data &&
    resolveDataPath(context.data, written.data, instanceId, ["field-teacher", "field-score"]).value;
  expect(score("instance-class-b")).toBe(90);
  expect(score("instance-class")).toBe(50);
  expect(bindBehaviorDataInstance(context, swapped, "instance-class-b")).toBe(swapped);
  expect(() => bindBehaviorDataInstance(context, swapped, "instance-missing")).toThrow(
    /modelo da prancheta/,
  );
});
test("the data context validates its model and instance, and bound links stay unambiguous", () => {
  const data = document();
  data.context = { modelId: "model-person", instanceId: "instance-class" };
  expect(() => parseDataModels(data)).toThrow(/precisa ser do modelo da prancheta/);
  data.context = { modelId: "model-class", instanceId: "instance-gone" };
  expect(() => parseDataModels(data)).toThrow(/Instância da prancheta ausente/);
  delete data.context;
  data.links.push({
    id: "link-unbound",
    instanceId: null,
    path: ["field-teacher", "field-score"],
    inputId: "input-score",
    direction: "one-way",
  });
  expect(() => parseDataModels(data)).toThrow(/requer modelo da prancheta/);
  data.context = { modelId: "model-class", instanceId: "instance-class" };
  expect(parseDataModels(data).document.context?.instanceId).toBe("instance-class");
  data.links[0] = {
    id: "link-list",
    instanceId: null,
    path: ["field-rows", "item-a", "field-score"],
    inputId: "input-score",
    direction: "one-way",
  };
  expect(() => parseDataModels(data)).toThrow(/não atravessa listas/);
  data.links = [
    {
      id: "link-bound",
      instanceId: null,
      path: ["field-teacher", "field-score"],
      inputId: "input-a",
      direction: "two-way",
    },
    {
      id: "link-fixed",
      instanceId: "instance-class",
      path: ["field-teacher", "field-score"],
      inputId: "input-b",
      direction: "two-way",
    },
  ];
  expect(() => parseDataModels(data)).toThrow(/conflitantes/);
  delete data.context;
  data.links = data.links.slice(1);
  expect(parseDataModels(data).document.links).toHaveLength(1);
});
test("a missing bound instance reports the artboard context, not a generic path error", () => {
  const data = document();
  data.context = { modelId: "model-class", instanceId: "instance-gone" };
  data.links.push({
    id: "link-score",
    instanceId: null,
    path: ["field-teacher", "field-score"],
    inputId: "input-score",
    direction: "one-way",
  });
  expect(() => parseDataModels(data)).toThrow(/Instância da prancheta ausente/);
  data.context = { modelId: "model-class", instanceId: "instance-class" };
  data.links[0] = {
    id: "link-list",
    instanceId: null,
    path: ["field-rows", "item-gone", "field-score"],
    inputId: "input-score",
    direction: "one-way",
  };
  expect(() => parseDataModels(data)).toThrow(/não atravessa listas/);
});
