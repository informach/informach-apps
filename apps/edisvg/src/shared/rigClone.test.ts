import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Affine,
  createPlaybackContext,
  evaluatePlayback,
  evaluatePlaybackFrame,
  identityMatrix,
  multiply,
  parseTransformList,
  propertySchema,
  transformMatrix,
  transformPoint,
} from "@informach/edi-motion";
import { type Behavior, emptyBehavior } from "@informach/edi-motion/behavior";
import type { Point, Vertex } from "@informach/edi-motion/geometry";
import { createRigContext, evaluateRig } from "@informach/edi-motion/rig";
import { deformationFixture } from "../../tests/deformationFixture";
import { rigFixture } from "../../tests/rigFixture";
import { trimFixture } from "../../tests/trimFixture";
import { compileArtboard } from "./components";
import { compileInteractiveArtboard } from "./interactive";
import { parseProject } from "./project";
import { rigObjects } from "./rigObjects";
import { flattenScene } from "./scene.js";

test("both single and batch copies preserve trim controls, renew channel/key identities and keep the same local geometry in one existing clock", () => {
  for (const commandType of ["scene", "scene-batch"]) {
    const fixture = trimFixture(),
      before = structuredClone(fixture.project()),
      command =
        commandType === "scene"
          ? { type: "scene", operation: "duplicate", targetId: fixture.shapeId }
          : { type: "scene-batch", operation: "duplicate", targetIds: [fixture.shapeId] },
      result = fixture.run([command]),
      project = fixture.project(),
      board = project.artboards[0],
      copyId = result.selected;
    assert.ok(board?.rig?.trims?.[1] && copyId);
    const copy = board.rig.trims[1],
      old = before.artboards[0]?.rig,
      originalTrack = old?.parameterClips?.[0]?.tracks[0],
      copyTrack = board.rig.parameterClips?.[0]?.tracks[1];
    assert.equal(copy.targetId, copyId);
    assert.notEqual(copy.id, old?.trims?.[0]?.id);
    assert.equal(copyTrack?.targetId, copy.id);
    assert.notEqual(copyTrack?.id, originalTrack?.id);
    assert.notEqual(copyTrack?.keys[0]?.id, originalTrack?.keys[0]?.id);
    assert.equal(board.rig.parameterClips?.[0]?.animationId, fixture.animationId);
    assert.deepEqual(board.scene.nodes[0], before.artboards[0]?.scene.nodes[0]);
    const compiled = compileArtboard(project, board.id),
      context = createPlaybackContext(compiled.playback),
      animation = compiled.playback.motion.animations.find(
        (clip) => clip.id === fixture.animationId,
      );
    assert.ok(animation);
    for (const frame of [0, 2.5, 5, 10, 0]) {
      const evaluated = evaluatePlaybackFrame(context, animation, frame);
      assert.deepEqual(evaluated.geometry.get(copyId), evaluated.geometry.get(fixture.shapeId));
    }
    assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
    assert.equal(
      compileInteractiveArtboard(project, board.id, { animationId: fixture.animationId }).document
        .playback.rigScopes?.[0]?.rig.trims?.length,
      2,
    );
  }
});

test("copied parameter bindings and layer owner masks target only the new control IDs while inputs stay explicitly shared", () => {
  const fixture = trimFixture(),
    behavior: Behavior = {
      ...emptyBehavior(),
      version: 2,
      defaultMachineId: "machine-copy",
      machines: [
        {
          id: "machine-copy",
          name: "Copy",
          layers: [
            {
              id: "layer-copy",
              name: "Copy",
              entryStateId: "state-copy",
              mode: "override",
              weight: 1,
              targetIds: [fixture.shapeId],
              properties: [...propertySchema.options],
              states: [{ id: "state-copy", name: "Base", kind: "base", speed: 1, x: 0, y: 0 }],
              transitions: [],
            },
          ],
        },
      ],
      inputs: [{ id: "input-trim", name: "End", kind: "number", initial: 0.5, min: 0, max: 1 }],
      bindings: [
        {
          id: "binding-trim",
          kind: "parameter",
          inputId: "input-trim",
          targetId: "trim-draw",
          property: "end",
          scale: 1,
          offset: 0,
          direction: "two-way",
        },
      ],
    };
  fixture.run([{ type: "behavior", operation: "replace", value: behavior }]);
  const copyId = fixture.run([
      { type: "scene", operation: "duplicate", targetId: fixture.shapeId },
    ]).selected,
    board = fixture.project().artboards[0],
    control = board?.rig?.trims?.find((trim) => trim.targetId === copyId),
    bindings = board?.behavior?.bindings;
  assert.ok(control && bindings?.[1]);
  assert.equal(bindings[0]?.targetId, "trim-draw");
  assert.equal(bindings[1].targetId, control.id);
  assert.equal(bindings[1].inputId, "input-trim");
  assert.notEqual(bindings[1].id, bindings[0]?.id);
  assert.deepEqual(board?.behavior?.inputs, behavior.inputs);
  assert.deepEqual(board?.behavior?.machines[0]?.layers[0]?.targetIds, [fixture.shapeId, copyId]);
});

test("copy budgets and locks fail before publishing any part of a mixed transaction", () => {
  const fixture = trimFixture(),
    board = fixture.project().artboards[0],
    geometry = board ? rigObjects(board.scene).get(fixture.shapeId)?.geometry : undefined;
  assert.ok(board?.rig && geometry);
  fixture.run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...board.rig,
        morphs: Array.from({ length: 255 }, (_, index) => ({
          id: `morph-budget-${index}`,
          name: `Morph ${index}`,
          targetId: fixture.shapeId,
          weight: 0,
          geometry,
        })),
      },
    },
  ]);
  const before = structuredClone(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        { type: "scene", operation: "rename", targetId: fixture.shapeId, value: "Do not publish" },
        { type: "scene", operation: "duplicate", targetId: fixture.shapeId },
      ]),
    /orçamento agregado do rig/,
  );
  assert.deepEqual(fixture.project(), before);
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.shapeId, value: true }]);
  const locked = structuredClone(fixture.project());
  assert.throws(
    () => fixture.run([{ type: "scene", operation: "duplicate", targetId: fixture.shapeId }]),
    /Desbloqueie/,
  );
  assert.deepEqual(fixture.project(), locked);
  const interaction = trimFixture();
  interaction.run([
    {
      type: "behavior",
      operation: "replace",
      value: {
        ...emptyBehavior(),
        inputs: [{ id: "input-enter", kind: "boolean", name: "Enter", initial: false }],
        listeners: Array.from({ length: 1000 }, (_, index) => ({
          id: `listener-budget-${index}`,
          targetId: interaction.shapeId,
          event: "enter",
          actions: [{ kind: "set-input", inputId: "input-enter", value: true }],
        })),
      },
    },
  ]);
  const source = structuredClone(interaction.project());
  assert.throws(
    () =>
      interaction.run([{ type: "scene", operation: "duplicate", targetId: interaction.shapeId }]),
    /bindings\/listeners/,
  );
  assert.deepEqual(interaction.project(), source);
});

test("morph and complete solo copies retain local topology and discrete channels without changing the source solo index contract", () => {
  const fixture = deformationFixture(),
    before = structuredClone(fixture.project());
  assert.throws(
    () => fixture.run([{ type: "scene", operation: "duplicate", targetId: fixture.faceA }]),
    /grupo solo completo/,
  );
  assert.deepEqual(fixture.project(), before);
  const result = fixture.run([
      { type: "scene-batch", operation: "duplicate", targetIds: [fixture.mouthId, fixture.faceId] },
    ]),
    board = fixture.project().artboards[0];
  assert.ok(board?.rig?.morphs?.[1] && board.rig.solos?.[1]);
  const morph = board.rig.morphs[1],
    solo = board.rig.solos[1];
  assert.equal(morph.targetId, result.selectedIds?.[0]);
  assert.equal(solo.targetId, result.selectedIds?.[1]);
  assert.notEqual(morph.id, "morph-smile");
  assert.notEqual(solo.id, "solo-face");
  const compiled = compileArtboard(fixture.project(), board.id),
    context = createPlaybackContext(compiled.playback),
    animation = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId);
  assert.ok(animation);
  for (const frame of [0, 2.5, 5, 10, 0]) {
    const evaluated = evaluatePlaybackFrame(context, animation, frame);
    assert.deepEqual(
      evaluated.geometry.get(morph.targetId),
      evaluated.geometry.get(fixture.mouthId),
    );
    for (const [index, id] of solo.children.entries())
      assert.equal(
        evaluated.visibility.get(id),
        evaluated.visibility.get(index === 0 ? fixture.faceA : fixture.faceB),
      );
  }
  assert.deepEqual(board.rig.solos[0], before.artboards[0]?.rig?.solos?.[0]);
  assert.deepEqual(board.rig.morphs[0], before.artboards[0]?.rig?.morphs?.[0]);
});

test("closed vector skin cloning retains deformation beneath reflected/skewed animated parent spaces without recapturing bind pose", () => {
  const fixture = rigFixture(),
    originalRig = fixture.project().artboards[0]?.rig;
  assert.ok(originalRig);
  fixture.run([{ type: "rig", operation: "replace", value: { ...originalRig, constraints: [] } }]);
  const meshId = fixture.run([
    {
      type: "scene",
      operation: "add",
      targetId: null,
      value: { tag: "path", attrs: { d: "M0 0C30 20 70 -20 100 0C130 20 170 -20 200 0" } },
    },
  ]).selected;
  assert.ok(meshId);
  fixture.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-affine-copy",
      targetId: meshId,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
  ]);
  const board = fixture.project().artboards[0];
  assert.ok(board);
  const groupId = fixture.run([
    {
      type: "composition",
      operation: "group",
      targetIds: board.scene.nodes.map((node) => node.id),
      name: "Skin group",
    },
  ]).selected;
  assert.ok(groupId);
  const parentId = fixture.run([
    { type: "composition", operation: "group", targetIds: [groupId], name: "Reflected parent" },
  ]).selected;
  assert.ok(parentId);
  fixture.run([
    {
      type: "scene",
      operation: "transform",
      targetId: parentId,
      value: { x: 30, y: -20, rotation: 25, sx: -2, sy: 1.3, skewX: 20, px: 5, py: 8 },
    },
    ...[0, 10].flatMap((frame) => [
      {
        type: "motion",
        command: {
          type: "set-key",
          animationId: fixture.clipId,
          targetId: "node-lower",
          property: "rotation",
          frame,
          value: -30 + frame * 9,
        },
      },
      {
        type: "motion",
        command: {
          type: "set-key",
          animationId: fixture.clipId,
          targetId: parentId,
          property: "rotation",
          frame,
          value: 25 + frame * 4,
        },
      },
    ]),
  ]);
  const before = structuredClone(fixture.project()),
    source = before.artboards[0]?.rig?.skins?.[0];
  assert.ok(source);
  const copyId = fixture.run([
      { type: "scene", operation: "duplicate", targetId: groupId },
    ]).selected,
    current = fixture.project().artboards[0],
    copy = current?.rig?.skins?.[1];
  assert.ok(copyId && current?.rig && copy);
  assert.deepEqual(copy.bindMatrix, source.bindMatrix);
  assert.deepEqual(
    copy.bones.map((bone) => bone.inverseBindMatrix),
    source.bones.map((bone) => bone.inverseBindMatrix),
  );
  const compiled = compileArtboard(fixture.project(), current.id),
    animation = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId);
  assert.ok(animation);
  const context = createRigContext(current.rig, rigObjects(current.scene));
  for (const frame of [0, 2.5, 5, 10, 0]) {
    const sampled = evaluatePlayback(animation, frame, compiled.playback.drivers),
      poses = new Map(
        compiled.playback.objects.map((object) => [
          object.id,
          { ...object.transform, ...sampled.get(object.id) },
        ]),
      ),
      evaluated = evaluateRig(context, poses),
      a = evaluated.geometry.get(meshId),
      b = evaluated.geometry.get(copy.targetId),
      sourceMatrix = evaluated.world.get(meshId),
      copyMatrix = evaluated.world.get(copy.targetId),
      parentMatrix = evaluated.world.get(parentId);
    assert.ok(a && b && sourceMatrix && copyMatrix && parentMatrix);
    const zero = transformPoint(parentMatrix, 0, 0),
      shifted = transformPoint(parentMatrix, 20, 20),
      dx = shifted.x - zero.x,
      dy = shifted.y - zero.y;
    for (const [index, contour] of a.entries())
      for (const [pointIndex, point] of contour.points.entries()) {
        const copied: Vertex | undefined = b[index]?.points[pointIndex];
        assert.ok(copied);
        const pairs: readonly (readonly [Point | null, Point | null])[] = [
          [point, copied],
          [point.in, copied.in],
          [point.out, copied.out],
        ];
        for (const [from, to] of pairs) {
          if (!from || !to) {
            assert.equal(from, to);
            continue;
          }
          const p = transformPoint(sourceMatrix, from.x, from.y),
            q = transformPoint(copyMatrix, to.x, to.y);
          assert.ok(Math.abs(q.x - p.x - dx) < 0.000001, JSON.stringify({ frame, p, q, dx }));
          assert.ok(Math.abs(q.y - p.y - dy) < 0.000001, JSON.stringify({ frame, p, q, dy }));
        }
      }
  }
});

test("a closed group clone preserves IK, skin matrices and deformed world geometry under its real animated group transform", () => {
  const fixture = rigFixture(),
    meshId = fixture.run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: { tag: "path", attrs: { d: "M0 -10L100 -10L200 -10L200 10L100 10L0 10Z" } },
      },
    ]).selected;
  assert.ok(meshId);
  fixture.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-copy-source",
      targetId: meshId,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
  ]);
  const beforeGroup = fixture.project().artboards[0];
  assert.ok(beforeGroup);
  const groupId = fixture.run([
    {
      type: "composition",
      operation: "group",
      targetIds: beforeGroup.scene.nodes.map((node) => node.id),
      name: "Subrig completo",
    },
  ]).selected;
  assert.ok(groupId);
  fixture.run(
    [0, 10].flatMap((frame) =>
      ["x", "rotation"].map((property) => ({
        type: "motion",
        command: {
          type: "set-key",
          animationId: fixture.clipId,
          targetId: groupId,
          property,
          frame,
          value: frame * (property === "x" ? 3 : 4),
          easing: "linear",
        },
      })),
    ),
  );
  const before = structuredClone(fixture.project()),
    beforeRig = before.artboards[0]?.rig;
  assert.ok(beforeRig?.skins?.[0]);
  for (const ids of [[meshId], ["node-upper"], [meshId, "node-upper", "node-target"]]) {
    assert.throws(
      () => fixture.run([{ type: "scene-batch", operation: "duplicate", targetIds: ids }]),
      /cópia parcial/,
    );
    assert.deepEqual(fixture.project(), before);
  }
  const copyId = fixture.run([
      { type: "scene", operation: "duplicate", targetId: groupId },
    ]).selected,
    board = fixture.project().artboards[0];
  assert.ok(copyId && board?.rig?.skins?.[1]);
  const sourceGroup = board.scene.nodes.find((node) => node.id === groupId),
    copyGroup = board.scene.nodes.find((node) => node.id === copyId);
  assert.ok(sourceGroup && copyGroup);
  const original = flattenScene({ nodes: [sourceGroup] }),
    copies = flattenScene({ nodes: [copyGroup] }),
    mapping = new Map(
      original.map(({ node }, index) => {
        const copy = copies[index]?.node;
        assert.ok(copy);
        return [node.id, copy.id];
      }),
    );
  assert.equal(board.rig.bones.length, beforeRig.bones.length * 2);
  assert.equal(board.rig.constraints.length, beforeRig.constraints.length * 2);
  const copiedSkin = board.rig.skins[1],
    sourceSkin = beforeRig.skins[0];
  assert.deepEqual(copiedSkin.bindMatrix, sourceSkin.bindMatrix);
  for (const [index, bone] of copiedSkin.bones.entries()) {
    assert.equal(bone.targetId, mapping.get(sourceSkin.bones[index]?.targetId ?? ""));
    assert.deepEqual(bone.inverseBindMatrix, sourceSkin.bones[index]?.inverseBindMatrix);
  }
  assert.deepEqual(sourceGroup, before.artboards[0]?.scene.nodes[0]);
  const compiled = compileArtboard(fixture.project(), board.id),
    context = createPlaybackContext(compiled.playback),
    animation = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId),
    nodes = new Map(flattenScene(compiled.scene).map((entry) => [entry.node.id, entry]));
  assert.ok(animation);
  for (const frame of [0, 2.5, 5, 10, 0]) {
    const evaluated = evaluatePlaybackFrame(context, animation, frame),
      cache = new Map<string, Affine>();
    function world(id: string): Affine {
      const cached = cache.get(id);
      if (cached) return cached;
      const entry = nodes.get(id);
      assert.ok(entry);
      const value = multiply(
        multiply(
          multiply(
            entry.parentId ? world(entry.parentId) : identityMatrix(),
            entry.node.basis ?? identityMatrix(),
          ),
          transformMatrix(evaluated.poses.get(id) ?? entry.node.transform),
        ),
        parseTransformList(entry.node.attrs.transform ?? ""),
      );
      cache.set(id, value);
      return value;
    }
    const mappedMesh = mapping.get(meshId);
    assert.ok(mappedMesh);
    const a = evaluated.geometry.get(meshId),
      b = evaluated.geometry.get(mappedMesh);
    assert.ok(a && b);
    for (const [index, contour] of a.entries())
      for (const [pointIndex, point] of contour.points.entries()) {
        const copy = b[index]?.points[pointIndex];
        assert.ok(copy);
        const sourcePoint = transformPoint(world(meshId), point.x, point.y),
          copyPoint = transformPoint(world(mappedMesh), copy.x, copy.y);
        assert.ok(
          Math.abs(copyPoint.x - sourcePoint.x - 20) < 0.000001,
          JSON.stringify({ frame, sourcePoint, copyPoint }),
        );
        assert.ok(
          Math.abs(copyPoint.y - sourcePoint.y - 20) < 0.000001,
          JSON.stringify({ frame, sourcePoint, copyPoint }),
        );
      }
  }
  // JSON canonicalizes -0 in inverse-bind matrices; verify the entire on-disk
  // representation, not a JavaScript-only signed-zero distinction.
  const serialized = JSON.stringify(fixture.project());
  assert.equal(JSON.stringify(parseProject(JSON.parse(serialized))), serialized);
});
