import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPlaybackContext,
  evaluatePlaybackFrame,
  evaluatePlaybackStaticFrame,
} from "@informach/edi-motion";
import { rigParameterKey } from "@informach/edi-motion/rig";
import { INTERACTIVE_VERSION, parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { joystickFixture } from "../../tests/joystickFixture";
import { rigFixture } from "../../tests/rigFixture";
import { timelineClip } from "./animationTimeline";
import { compileArtboard } from "./components";
import { compileInteractiveArtboard } from "./interactive";
import { PROJECT_VERSION, parseProject } from "./project";
import { inspectRig, inspectRigValue } from "./rigInspection";

test("transient joystick preview overrides typed channels without mutating clocks or definitions and cancels to the same frame", () => {
  const fixture = joystickFixture({ animated: true }),
    compiled = compileArtboard(fixture.project(), fixture.boardId, { spatial: true }),
    before = JSON.stringify(compiled.playback),
    context = createPlaybackContext(compiled.playback),
    animation = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId);
  assert.ok(animation);
  const x = rigParameterKey([], fixture.joystickId, "x"),
    y = rigParameterKey([], fixture.joystickId, "y"),
    overrides = new Map([
      [x, -0.5],
      [y, 0.25],
    ]),
    original = evaluatePlaybackFrame(context, animation, 5),
    preview = evaluatePlaybackFrame(context, animation, 5, undefined, undefined, overrides),
    pose = preview.poses.get(fixture.targetId);
  assert.equal(pose?.x, 30);
  assert.equal(pose?.y, 110);
  assert.equal(
    evaluatePlaybackStaticFrame(context, undefined, undefined, overrides).poses.get(
      fixture.targetId,
    )?.x,
    80,
  );
  assert.deepEqual(evaluatePlaybackFrame(context, animation, 5), original);
  assert.deepEqual(
    [...overrides],
    [
      [x, -0.5],
      [y, 0.25],
    ],
  );
  for (const invalid of [new Map([[x, 2]]), new Map([[y, NaN]]), new Map([["orphan", 0]])])
    assert.throws(() =>
      evaluatePlaybackFrame(context, animation, 5, undefined, undefined, invalid),
    );
  assert.throws(
    () => evaluatePlaybackStaticFrame(context, undefined, { remaining: 0 }, overrides),
    /orçamento/i,
  );
  assert.throws(
    () =>
      evaluatePlaybackStaticFrame(
        context,
        undefined,
        undefined,
        new Map(Array.from({ length: 2_001 }, (_, i) => [String(i), 0])),
      ),
    /limite/,
  );
  const normalBudget = { remaining: 2_000_000 },
    previewBudget = { remaining: 2_000_000 };
  evaluatePlaybackFrame(context, animation, 5, undefined, normalBudget);
  evaluatePlaybackFrame(context, animation, 5, undefined, previewBudget, overrides);
  assert.equal(normalBudget.remaining - previewBudget.remaining, overrides.size);
  assert.equal(JSON.stringify(compiled.playback), before);
});

test("joystick persists only in project v22/Rig v4/blueprint v11 and old clean v21/v10 documents remain readable", () => {
  const fixture = joystickFixture(),
    project = fixture.project(),
    before = JSON.stringify(project);
  assert.equal(project.version, PROJECT_VERSION);
  assert.equal(project.artboards[0]?.rig?.version, 4);
  assert.deepEqual(parseProject(project), project);
  // JSON canonically serializes -0 bind-matrix entries as 0. Compare complete
  // serialized documents as well as the direct in-memory parse above.
  assert.equal(JSON.stringify(parseProject(JSON.parse(before))), before);
  assert.throws(() => parseProject({ ...project, version: 21 }), /v22/);
  const compiled = compileInteractiveArtboard(project, fixture.boardId, {
    animationId: fixture.clipId,
  });
  assert.equal(compiled.document.version, INTERACTIVE_VERSION);
  assert.deepEqual(parseInteractiveDocument(compiled.document), compiled.document);
  assert.equal(
    JSON.stringify(parseInteractiveDocument(JSON.parse(JSON.stringify(compiled.document)))),
    JSON.stringify(compiled.document),
  );
  assert.throws(() => parseInteractiveDocument({ ...compiled.document, version: 10 }), /v11/);
  const legacy = rigFixture(),
    migrated = parseProject({ ...legacy.project(), version: 21 });
  assert.equal(migrated.version, PROJECT_VERSION);
  const oldBlueprint = compileInteractiveArtboard(migrated, legacy.rootId, {
    animationId: legacy.clipId,
  }).document;
  assert.equal(parseInteractiveDocument({ ...oldBlueprint, version: 10 }).version, 10);
  assert.equal(JSON.stringify(project), before);
});

test("artboard copies remap joystick owners while two reused instances retain independent controller keys and clocks", () => {
  const fixture = joystickFixture({ animated: true }),
    original = fixture.project();
  fixture.run([
    {
      type: "artboard",
      operation: "duplicate",
      id: fixture.boardId,
      newId: "artboard-joystick-copy",
      name: "Cópia",
    },
  ]);
  const copied = fixture.project().artboards.find((board) => board.id === "artboard-joystick-copy"),
    copiedControl = copied?.rig?.joysticks?.[0];
  assert.ok(copied && copiedControl);
  assert.notEqual(copiedControl.targetId, fixture.targetId);
  assert.equal(copiedControl.id, fixture.joystickId);
  assert.deepEqual(fixture.project().artboards[0], original.artboards[0]);
  fixture.run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-joystick-owner",
      name: "Instâncias",
      width: 600,
      height: 300,
    },
    ...[1, 2].map((speed) => ({
      type: "component",
      operation: "create",
      name: `Mão ${speed}`,
      instance: {
        artboardId: fixture.boardId,
        animationId: fixture.clipId,
        width: 300,
        height: 300,
        fit: "contain",
        speed,
        offsetSeconds: 0,
        overrides: [],
      },
    })),
  ]);
  const compiled = compileArtboard(fixture.project(), "artboard-joystick-owner", { spatial: true }),
    context = createPlaybackContext(compiled.playback),
    animation = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId),
    scopes = compiled.playback.rigScopes;
  assert.ok(animation && scopes?.length === 2);
  const first = scopes[0],
    second = scopes[1];
  assert.ok(first && second);
  const target1 = first.rig.joysticks?.[0]?.targetId,
    target2 = second.rig.joysticks?.[0]?.targetId;
  assert.ok(target1 && target2);
  assert.notEqual(target1, target2);
  const baseline = evaluatePlaybackFrame(context, animation, 5),
    firstPose = baseline.poses.get(target1),
    secondPose = baseline.poses.get(target2);
  assert.ok(firstPose && secondPose);
  assert.ok(Math.abs(firstPose.x - 70) < 1e-9 && Math.abs(firstPose.y - 80) < 1e-9);
  assert.ok(Math.abs(secondPose.x - Math.SQRT1_2 * 40) < 1e-9);
  const preview = evaluatePlaybackFrame(
    context,
    animation,
    5,
    undefined,
    undefined,
    new Map([
      [rigParameterKey(first.instancePath, fixture.joystickId, "x"), -1],
      [rigParameterKey(first.instancePath, fixture.joystickId, "y"), 0],
    ]),
  );
  assert.equal(preview.poses.get(target1)?.x, 10);
  assert.deepEqual(preview.poses.get(target2), secondPose);
  assert.deepEqual(evaluatePlaybackFrame(context, animation, 5), baseline);
});

test("real joystick channels share the TRS clock, offset its animated center before skin and preserve authored keys on backward frames", () => {
  const fixture = joystickFixture({ animated: true }),
    project = fixture.project(),
    before = JSON.stringify(project),
    compiled = compileArtboard(project, fixture.boardId, { spatial: true }),
    context = createPlaybackContext(compiled.playback),
    clip = compiled.playback.motion.animations.find((clip) => clip.id === fixture.clipId);
  assert.ok(clip);
  for (const frame of [0, 5, 10, 5, 0]) {
    const result = evaluatePlaybackFrame(context, clip, frame),
      pose = result.poses.get(fixture.targetId);
    assert.ok(pose);
    const requested = frame / 10,
      divisor = Math.max(1, Math.hypot(requested, -requested));
    assert.ok(Math.abs(pose.x - (100 - frame * 10 + (requested / divisor) * 40)) < 1e-10);
    assert.ok(Math.abs(pose.y - (100 - (requested / divisor) * 40)) < 1e-10);
    assert.ok(result.geometry.get(fixture.shapeId)?.length);
  }
  assert.equal(JSON.stringify(project), before);
});

test("joystick parameter bindings remain typed and portable without inventing transform targets or dropping a numeric axis", () => {
  const fixture = joystickFixture({ animated: true, bindings: true }),
    project = fixture.project(),
    before = JSON.stringify(project),
    compiled = compileInteractiveArtboard(project, fixture.boardId, {
      animationId: fixture.clipId,
    });
  assert.deepEqual(
    compiled.document.behavior.bindings.map((binding) =>
      binding.kind === "parameter" ? [binding.targetId, binding.property] : null,
    ),
    [
      [fixture.joystickId, "x"],
      [fixture.joystickId, "y"],
    ],
  );
  assert.deepEqual(parseInteractiveDocument(compiled.document), compiled.document);
  assert.equal(JSON.stringify(project), before);
});

test("joystick edits honor target locks and failed removal cannot orphan live keys or bindings", () => {
  const fixture = joystickFixture({ animated: true, bindings: true });
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.targetId, value: true }]);
  const project = fixture.project(),
    before = JSON.stringify(project),
    rig = structuredClone(project.artboards[0]?.rig),
    joystick = rig?.joysticks?.[0];
  assert.ok(rig && joystick);
  joystick.x = 0.5;
  assert.throws(
    () => fixture.run([{ type: "rig", operation: "replace", value: rig }]),
    /bloqueado/,
  );
  assert.equal(JSON.stringify(fixture.project()), before);
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.targetId, value: false }]);
  const unlocked = JSON.stringify(fixture.project()),
    current = fixture.project().artboards[0]?.rig;
  assert.ok(current);
  assert.throws(
    () =>
      fixture.run([{ type: "rig", operation: "replace", value: { ...current, joysticks: [] } }]),
    /órfão/,
  );
  assert.equal(JSON.stringify(fixture.project()), unlocked);
  assert.throws(() =>
    fixture.run([{ type: "scene-batch", operation: "delete", targetIds: [fixture.targetId] }]),
  );
  assert.equal(JSON.stringify(fixture.project()), unlocked);
});

test("single and batch target copies preserve the complete joystick with fresh controller, key and binding identities", () => {
  for (const type of ["scene", "scene-batch"]) {
    const fixture = joystickFixture({ animated: true, bindings: true }),
      original = fixture.project(),
      before = JSON.stringify(original);
    fixture.run([
      type === "scene"
        ? { type, operation: "duplicate", targetId: fixture.targetId }
        : { type, operation: "duplicate", targetIds: [fixture.targetId] },
    ]);
    const project = fixture.project(),
      board = project.artboards[0],
      originalRig = original.artboards[0]?.rig,
      copy = board?.rig?.joysticks?.find((entry) => entry.id !== fixture.joystickId);
    assert.ok(board && originalRig && copy);
    assert.notEqual(copy.targetId, fixture.targetId);
    assert.equal(copy.name, "Mão");
    assert.equal(board.rig?.joysticks?.length, 2);
    const channels =
      board.rig?.parameterClips?.[0]?.tracks.filter((track) => track.targetId === copy.id) ?? [];
    assert.deepEqual(
      channels.map((track) => track.property),
      ["x", "y"],
    );
    const oldIds = new Set(
      originalRig.parameterClips?.flatMap((clip) =>
        clip.tracks.flatMap((track) => [track.id, ...track.keys.map((key) => key.id)]),
      ),
    );
    assert.ok(
      channels.every(
        (track) => !oldIds.has(track.id) && track.keys.every((key) => !oldIds.has(key.id)),
      ),
    );
    assert.equal(board.behavior?.inputs.length, 2);
    assert.equal(
      board.behavior?.bindings.filter((binding) => binding.targetId === copy.id).length,
      2,
    );
    assert.deepEqual(parseProject(project), project);
    assert.equal(JSON.stringify(original), before);
  }
});

test("joystick inspection and unified timeline expose both real axes with names, bounds and complete rig references", () => {
  const fixture = joystickFixture({ animated: true }),
    project = fixture.project(),
    board = project.artboards[0],
    animation = project.motion.animations[0];
  assert.ok(board && animation);
  const summary = inspectRig(board.rig, { collection: "joysticks" });
  assert.equal(summary.total, 1);
  assert.deepEqual(summary.items, [{ id: fixture.joystickId }]);
  assert.equal(
    JSON.parse(
      inspectRigValue(board.rig, { collection: "joysticks", id: fixture.joystickId }).value,
    ).targetId,
    fixture.targetId,
  );
  const projected = timelineClip(board, animation),
    axes = projected.tracks.filter(
      (track) => track.source.kind === "rig" && track.targetId === fixture.joystickId,
    );
  assert.equal(axes.length, 2);
  assert.ok(axes.every((track) => track.label.includes("Joystick 1 · Mão")));
  assert.ok(
    axes.every((track) => track.definition.bounds[0] === -1 && track.definition.bounds[1] === 1),
  );
});
