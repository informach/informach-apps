import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyBehavior } from "@informach/edi-motion/behavior";
import { deformationFixture } from "../../tests/deformationFixture";
import { compileArtboard } from "./components";
import { compileInteractiveArtboard } from "./interactive";
import { PROJECT_VERSION, parseProject } from "./project";
import { inspectRigValue } from "./rigInspection";

test("deformation persists typed curves and topology, duplicates identities, and scoped exports keep the same base geometry", () => {
  const fixture = deformationFixture(),
    project = fixture.project(),
    before = structuredClone(project),
    compiled = compileArtboard(project, fixture.rootId);
  assert.equal(project.version, PROJECT_VERSION);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  assert.equal(
    compiled.playback.objects.find((object) => object.id === fixture.mouthId)?.geometry?.[0]?.points
      .length,
    3,
  );
  const interactive = compileInteractiveArtboard(project, fixture.rootId, {
    animationId: fixture.clipId,
  });
  assert.equal(interactive.document.playback.rigScopes?.[0]?.rig.morphs?.length, 1);
  const chunk = inspectRigValue(project.artboards[0]?.rig, {
    collection: "morphs",
    id: "morph-smile",
  });
  assert.equal(JSON.parse(chunk.value).targetId, fixture.mouthId);
  const result = fixture.run([
      {
        type: "artboard",
        operation: "duplicate",
        id: fixture.rootId,
        newId: "artboard-copy",
        name: "Cópia",
      },
    ]),
    copy = result.project.artboards[1];
  assert.ok(copy?.rig?.morphs?.[0]?.targetId !== fixture.mouthId);
  assert.equal(copy?.rig?.solos?.[0]?.children.length, 2);
  assert.deepEqual(project, before);
});
test("component parameter bindings stay scoped with input overrides, and incompatible geometry overrides are refused before publication", () => {
  const fixture = deformationFixture();
  fixture.run([
    {
      type: "behavior",
      operation: "replace",
      value: {
        ...emptyBehavior(),
        version: 2,
        inputs: [
          { id: "input-mood", kind: "number", name: "Humor", initial: 0.25, min: 0, max: 1 },
        ],
        bindings: [
          {
            id: "binding-mood",
            kind: "parameter",
            inputId: "input-mood",
            targetId: "morph-smile",
            property: "weight",
            scale: 1,
            offset: 0,
            direction: "two-way",
          },
        ],
      },
    },
  ]);
  const instance = {
    artboardId: fixture.rootId,
    animationId: fixture.clipId,
    width: 300,
    height: 300,
    fit: "contain",
    speed: 2,
    offsetSeconds: 0,
    overrides: [],
    inputOverrides: [{ inputId: "input-mood", value: 0.8 }],
  };
  fixture.run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-owner",
      name: "Owner",
      width: 300,
      height: 300,
    },
    { type: "component", operation: "create", name: "Face", instance },
  ]);
  const compiled = compileInteractiveArtboard(fixture.project(), "artboard-owner"),
    child = compiled.document.components?.[0]?.document;
  assert.equal(child?.behavior.inputs[0]?.kind, "number");
  assert.equal(
    child?.behavior.inputs[0]?.kind === "number" ? child.behavior.inputs[0].initial : null,
    0.8,
  );
  assert.equal(child?.behavior.bindings[0]?.targetId, "morph-smile");
  assert.notEqual(child?.playback.rigScopes?.[0]?.rig.morphs?.[0]?.targetId, fixture.mouthId);
  const before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        {
          type: "artboard",
          operation: "create",
          id: "artboard-invalid",
          name: "Invalid",
          width: 300,
          height: 300,
        },
        {
          type: "component",
          operation: "create",
          name: "Invalid face",
          instance: {
            ...instance,
            overrides: [{ targetId: fixture.mouthId, attrs: { d: "M0 0L100 0" } }],
          },
        },
      ]),
    /topologia/,
  );
  assert.deepEqual(fixture.project(), before);
});
test("incompatible topology, stale parameter references, and locked deformation/solo owners fail atomically", () => {
  const fixture = deformationFixture(),
    rig = fixture.project().artboards[0]?.rig;
  if (!rig) throw new Error("Missing rig");
  let before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        { type: "scene", operation: "path", targetId: fixture.mouthId, value: "M0 0L100 0" },
      ]),
    /topologia/,
  );
  assert.deepEqual(fixture.project(), before);
  assert.throws(
    () => fixture.run([{ type: "rig", operation: "replace", value: { ...rig, morphs: [] } }]),
    /órfão/,
  );
  assert.deepEqual(fixture.project(), before);
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.mouthId, value: true }]);
  before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        {
          type: "rig",
          operation: "replace",
          value: { ...rig, morphs: rig.morphs?.map((morph) => ({ ...morph, weight: 1 })) },
        },
      ]),
    /bloqueado/,
  );
  assert.deepEqual(fixture.project(), before);
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.faceA, value: true }]);
  before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        {
          type: "rig",
          operation: "replace",
          value: { ...rig, solos: rig.solos?.map((solo) => ({ ...solo, activeIndex: 1 })) },
        },
      ]),
    /bloqueado/,
  );
  assert.deepEqual(fixture.project(), before);
});
