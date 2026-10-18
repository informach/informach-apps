import assert from "node:assert/strict";
import { test } from "node:test";
import { animationTimelineFixture as mixedFixture } from "../../tests/animationTimelineFixture";
import { deformationFixture } from "../../tests/deformationFixture";
import { animationKeyReferenceSchema, animationKeySelectionId } from "./animationKeyReference";
import { timelineClip } from "./animationTimeline";
import { executeDocumentTransaction } from "./documentCommands";
import { parseProject } from "./project";

test("timeline projection preserves valid duplicate IDs across domains, readonly source arrays and snapshot cache ownership", () => {
  const fixture = mixedFixture(),
    project = fixture.project(),
    board = project.artboards[0],
    animation = project.motion.animations[0];
  assert.ok(board && animation);
  const before = JSON.stringify(project),
    projection = timelineClip(board, animation);
  assert.equal(projection.tracks.length, 2);
  assert.equal(projection.keyIndex.size, 4);
  assert.equal(timelineClip(board, animation), projection);
  assert.notEqual(animationKeySelectionId(fixture.motion), animationKeySelectionId(fixture.rig));
  assert.equal(
    projection.keyIndex.get(animationKeySelectionId(fixture.motion))?.reference.kind,
    "motion",
  );
  assert.equal(
    projection.keyIndex.get(animationKeySelectionId(fixture.rig))?.reference.kind,
    "rig",
  );
  assert.equal(projection.tracks[0]?.keys, animation.tracks[0]?.keys);
  assert.equal(projection.tracks[1]?.keys, board.rig?.parameterClips?.[0]?.tracks[0]?.keys);
  assert.deepEqual(projection.tracks[1]?.definition.bounds, [0, 1]);
  assert.match(projection.tracks[1]?.label ?? "", /Recorte/);
  const restored = parseProject(JSON.parse(before)),
    nextBoard = restored.artboards[0],
    nextAnimation = restored.motion.animations[0];
  assert.ok(nextBoard && nextAnimation);
  assert.notEqual(timelineClip(nextBoard, nextAnimation), projection);
  assert.equal(JSON.stringify(project), before);
});

test("mixed motion/rig move, copy and delete share one transaction without losing identities or controllers", () => {
  const fixture = mixedFixture(),
    before = JSON.stringify(fixture.project());
  const moved = fixture.run([
    {
      type: "animation-keys",
      command: {
        operation: "move",
        animationId: fixture.animationId,
        references: [fixture.motion, fixture.rig],
        deltaFrames: 2,
        scale: 1,
        anchorFrame: 0,
      },
    },
  ]);
  assert.equal(moved.project.motion.animations[0]?.tracks[0]?.keys[0]?.frame, 2);
  assert.equal(moved.project.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys[0]?.frame, 2);
  assert.notEqual(JSON.stringify(fixture.project()), before);
  const copied = fixture.run([
      {
        type: "animation-keys",
        command: {
          operation: "copy",
          animationId: fixture.animationId,
          references: [fixture.motion, fixture.rig],
          deltaFrames: 2,
          scale: 1,
          anchorFrame: 0,
        },
      },
    ]).project,
    motionTrack = copied.motion.animations[0]?.tracks[0],
    rigTrack = copied.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0];
  assert.ok(motionTrack && rigTrack);
  for (const track of [motionTrack, rigTrack]) {
    assert.deepEqual(
      track.keys.map((key) => key.frame),
      [2, 4, 10],
    );
    assert.notEqual(track.keys[0]?.id, track.keys[1]?.id);
  }
  const references = [
    ...motionTrack.keys.map((key) => ({ kind: "motion", trackId: motionTrack.id, keyId: key.id })),
    ...rigTrack.keys.map((key) => ({
      kind: "rig",
      artboardId: fixture.boardId,
      trackId: rigTrack.id,
      keyId: key.id,
    })),
  ];
  const deleted = fixture.run([
    {
      type: "animation-keys",
      command: { operation: "delete", animationId: fixture.animationId, references },
    },
  ]).project;
  assert.equal(deleted.motion.animations[0]?.tracks.length, 0);
  assert.equal(deleted.artboards[0]?.rig?.parameterClips?.length, 0);
  assert.equal(deleted.artboards[0]?.rig?.trims?.length, 1);
});

test("rig key references include the artboard and never edit a sibling rig reusing the same IDs", () => {
  const fixture = mixedFixture(),
    project = fixture.project(),
    original = project.artboards[0];
  assert.ok(original);
  const sibling = structuredClone(original),
    node = sibling.scene.nodes[0],
    trim = sibling.rig?.trims?.[0];
  assert.ok(node && trim);
  sibling.id = "artboard-sibling";
  node.id = "node-sibling";
  trim.targetId = node.id;
  project.artboards.push(sibling);
  parseProject(project);
  const other = animationKeyReferenceSchema.parse({ ...fixture.rig, artboardId: sibling.id });
  fixture.run([
    {
      type: "animation-keys",
      command: {
        operation: "move",
        animationId: fixture.animationId,
        references: [other],
        deltaFrames: 2,
        scale: 1,
        anchorFrame: 0,
      },
    },
  ]);
  assert.equal(
    fixture.project().artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys[0]?.frame,
    0,
  );
  assert.equal(
    fixture.project().artboards[1]?.rig?.parameterClips?.[0]?.tracks[0]?.keys[0]?.frame,
    2,
  );
  assert.notEqual(animationKeySelectionId(other), animationKeySelectionId(fixture.rig));
});

test("rig updates retain numeric units and require integer/hold semantics for discrete channels", () => {
  const fixture = deformationFixture(),
    track = fixture
      .project()
      .artboards[0]?.rig?.parameterClips?.[0]?.tracks.find(
        (track) => track.property === "activeIndex",
      );
  assert.ok(track?.keys[0]);
  const reference = {
      kind: "rig",
      artboardId: fixture.rootId,
      trackId: track.id,
      keyId: track.keys[0].id,
    },
    command = {
      operation: "update",
      animationId: fixture.clipId,
      reference,
      frame: 1,
      value: 1,
      easing: "hold",
    };
  fixture.run([{ type: "animation-keys", command }]);
  const before = JSON.stringify(fixture.project());
  for (const patch of [{ value: 0.5 }, { easing: "linear" }, { frame: 10 }]) {
    assert.throws(() =>
      fixture.run([{ type: "animation-keys", command: { ...command, ...patch } }]),
    );
    assert.equal(JSON.stringify(fixture.project()), before);
  }
  assert.equal(fixture.project().artboards[0]?.rig?.version, 2);
});

test("collision, missing/repeated references and late rig locks roll back mixed edits completely", () => {
  const fixture = mixedFixture(),
    initial = JSON.stringify(fixture.project());
  for (const references of [
    [fixture.motion, fixture.motion],
    [{ ...fixture.rig, artboardId: "artboard-missing" }],
    [{ ...fixture.motion, trackId: "track-missing" }],
  ]) {
    assert.throws(() =>
      fixture.run([
        {
          type: "animation-keys",
          command: {
            operation: "move",
            animationId: fixture.animationId,
            references,
            deltaFrames: 1,
            scale: 1,
            anchorFrame: 0,
          },
        },
      ]),
    );
    assert.equal(JSON.stringify(fixture.project()), initial);
  }
  assert.throws(
    () =>
      fixture.run([
        {
          type: "animation-keys",
          command: {
            operation: "move",
            animationId: fixture.animationId,
            references: [fixture.motion, fixture.rig],
            deltaFrames: 10,
            scale: 1,
            anchorFrame: 0,
          },
        },
      ]),
    /colisão/,
  );
  const otherId = fixture.run([
    { type: "scene", operation: "add", targetId: null, value: "rect" },
  ]).selected;
  assert.ok(otherId);
  fixture.run([{ type: "scene", operation: "lock", targetId: fixture.shapeId, value: true }]);
  const animation = fixture.project().motion.animations[0];
  assert.ok(animation?.tracks[0]);
  animation.tracks[0].targetId = otherId;
  const before = JSON.stringify(fixture.project());
  assert.throws(
    () =>
      fixture.run([
        {
          type: "animation-keys",
          command: {
            operation: "move",
            animationId: fixture.animationId,
            references: [fixture.motion, fixture.rig],
            deltaFrames: 1,
            scale: 1,
            anchorFrame: 0,
          },
        },
      ]),
    /bloqueado/,
  );
  assert.equal(JSON.stringify(fixture.project()), before);
});

test("dense mixed channels retime every selected key without mutation, and reject per-channel copy overflow", () => {
  const fixture = mixedFixture(),
    source = fixture.project(),
    animation = source.motion.animations[0],
    rigTrack = source.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0],
    motionTrack = animation?.tracks[0];
  assert.ok(animation && motionTrack && rigTrack);
  animation.frames = 20000;
  motionTrack.keys = Array.from({ length: 10000 }, (_, index) => ({
    id: `key-dense-${index}`,
    frame: index,
    value: index,
    easing: "linear",
  }));
  rigTrack.keys = motionTrack.keys.map((key) => ({ ...key, value: key.frame / 10000 }));
  parseProject(source);
  const references = [
      ...motionTrack.keys.map((key) => ({ ...fixture.motion, keyId: key.id })),
      ...rigTrack.keys.map((key) => ({ ...fixture.rig, keyId: key.id })),
    ],
    sessionId = crypto.randomUUID(),
    before = JSON.stringify(source),
    request = {
      projectId: source.id,
      sessionId,
      revision: 0,
      commands: [
        {
          type: "animation-keys",
          command: {
            operation: "move",
            animationId: animation.id,
            references,
            deltaFrames: 1,
            scale: 1,
            anchorFrame: 0,
          },
        },
      ],
    };
  const moved = executeDocumentTransaction(
    { project: source, sessionId, revision: 0 },
    request,
  ).project;
  for (const keys of [
    moved.motion.animations[0]?.tracks[0]?.keys,
    moved.artboards[0]?.rig?.parameterClips?.[0]?.tracks[0]?.keys,
  ]) {
    assert.ok(keys);
    assert.equal(keys.length, 10000);
    keys.forEach((key, index) => {
      assert.equal(key.frame, index + 1);
      assert.equal(key.id, `key-dense-${index}`);
    });
  }
  assert.equal(JSON.stringify(source), before);
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: source, sessionId, revision: 0 },
        {
          ...request,
          commands: [
            {
              type: "animation-keys",
              command: {
                operation: "copy",
                animationId: animation.id,
                references: [references[0], references[10000]],
                deltaFrames: 10001,
                scale: 1,
                anchorFrame: 0,
              },
            },
          ],
        },
      ),
    /por canal/,
  );
  assert.equal(JSON.stringify(source), before);
});

test("mixed reference payloads are budgeted before schema cloning and stale requests never edit", () => {
  const fixture = mixedFixture(),
    source = fixture.project(),
    sessionId = crypto.randomUUID(),
    before = JSON.stringify(source),
    command = {
      operation: "delete",
      animationId: fixture.animationId,
      references: Array(60000).fill(fixture.rig),
    };
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: source, sessionId, revision: 0 },
        {
          projectId: source.id,
          sessionId,
          revision: 0,
          commands: [
            { type: "animation-keys", command },
            { type: "animation-keys", command },
          ],
        },
      ),
    /Orçamento/,
  );
  assert.throws(
    () =>
      executeDocumentTransaction(
        { project: source, sessionId, revision: 0 },
        {
          projectId: source.id,
          sessionId,
          revision: 1,
          commands: [
            { type: "animation-keys", command: { ...command, references: [fixture.rig] } },
          ],
        },
      ),
    /mudou/,
  );
  assert.equal(JSON.stringify(source), before);
});
