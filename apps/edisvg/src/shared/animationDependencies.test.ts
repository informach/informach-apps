import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackContext, evaluatePlaybackFrame } from "@informach/edi-motion";
import { rigParameterEntries } from "@informach/edi-motion/rig";
import { audioProjectFixture } from "../../tests/audioFixture";
import { deformationFixture } from "../../tests/deformationFixture";
import { rigFixture } from "../../tests/rigFixture";
import { trimFixture } from "../../tests/trimFixture";
import { applyComponent, compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { type Artboard, type Project, parseProject } from "./project";
import { serializeProject } from "./projectPolicy";
import { rigObjects } from "./rigObjects";

function transaction(project: Project, commands: unknown[]) {
  const sessionId = crypto.randomUUID();
  return executeDocumentTransaction(
    { project, sessionId, revision: 0 },
    { projectId: project.id, sessionId, revision: 0, commands },
  ).project;
}
const copyCommand = (id: string) => ({
  type: "motion",
  command: {
    type: "duplicate-animation",
    animationId: id,
    id: "animation-copy",
    name: "Cópia",
  },
});
const deleteCommand = (id: string) => ({
  type: "motion",
  command: {
    type: "delete-animation",
    animationId: id,
  },
});

function skinFixture() {
  const fixture = rigFixture(),
    meshId = fixture.run([
      {
        type: "scene",
        operation: "add",
        targetId: null,
        value: {
          tag: "path",
          attrs: { d: "M0 -10L100 -10L200 -10L200 10L100 10L0 10Z", fill: "red" },
        },
      },
    ]).selected;
  assert.ok(meshId);
  fixture.run([
    {
      type: "rig",
      operation: "bind-skin",
      id: "skin-clip",
      targetId: meshId,
      boneIds: ["node-upper", "node-lower"],
      confirmRestPose: true,
    },
  ]);
  const rig = fixture.project().artboards[0]?.rig;
  assert.ok(rig);
  fixture.run([
    {
      type: "rig",
      operation: "replace",
      value: {
        ...rig,
        parameterClips: [
          {
            animationId: fixture.clipId,
            tracks: [
              {
                id: "track-influence",
                targetId: "constraint-hand",
                property: "strength",
                keys: [
                  { id: "key-influence-zero", frame: 0, value: 0, easing: "linear" },
                  { id: "key-influence-one", frame: 10, value: 1, easing: "linear" },
                ],
              },
            ],
          },
        ],
      },
    },
  ]);
  return fixture;
}

test("clip copies retain actual trim/morph/path/solo animation with new channel/key identities and no source aliases", () => {
  for (const fixture of [trimFixture(), deformationFixture(), skinFixture()]) {
    const source = fixture.project(),
      animationId = "animationId" in fixture ? fixture.animationId : fixture.clipId,
      before = JSON.stringify(source),
      copied = transaction(source, [copyCommand(animationId)]),
      rig = copied.artboards[0]?.rig,
      original = rig?.parameterClips?.find((clip) => clip.animationId === animationId),
      clone = rig?.parameterClips?.find((clip) => clip.animationId === "animation-copy");
    assert.ok(original && clone);
    assert.equal(clone.tracks.length, original.tracks.length);
    for (const [index, track] of clone.tracks.entries()) {
      const old: typeof track | undefined = original.tracks[index];
      assert.ok(old);
      assert.notEqual(track.id, old.id);
      assert.equal(track.targetId, old.targetId);
      assert.equal(track.property, old.property);
      assert.notEqual(track.keys, old.keys);
      for (const [keyIndex, key] of track.keys.entries()) {
        const oldKey: typeof key | undefined = old.keys[keyIndex];
        assert.ok(oldKey);
        assert.notEqual(key.id, oldKey.id);
        assert.deepEqual({ ...key, id: oldKey.id }, oldKey);
      }
    }
    const board = copied.artboards[0];
    assert.ok(board);
    const compiled = compileArtboard(copied, board.id),
      context = createPlaybackContext(compiled.playback);
    for (const frame of [0, 2.5, 5, 10, 0]) {
      const evaluations = [animationId, "animation-copy"].map((id) => {
        const clip = compiled.playback.motion.animations.find((clip) => clip.id === id);
        assert.ok(clip);
        return evaluatePlaybackFrame(context, clip, frame);
      });
      assert.deepEqual(evaluations[1], evaluations[0]);
    }
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(copied.artboards[0]?.rig?.skins, source.artboards[0]?.rig?.skins);
    // JSON canonicalizes signed zero in inverse-bind matrices; compare the
    // complete on-disk representation, while the exact matrices stay above.
    const serialized = JSON.stringify(copied);
    assert.equal(JSON.stringify(parseProject(JSON.parse(serialized))), serialized);
    const removed = transaction(copied, [deleteCommand("animation-copy")]);
    assert.deepEqual(removed, source);
  }
});

test("event duplication refuses aggregate overflow without changing event data or audio references", () => {
  const fixture = audioProjectFixture(),
    board = fixture.project.artboards[0],
    event = board?.behavior?.events[0];
  assert.ok(board?.behavior && event);
  board.behavior.events = [
    event,
    ...Array.from({ length: 6000 }, (_, index) => ({
      ...event,
      id: `event-budget-${index}`,
      data: { value: index },
    })),
  ];
  const source = parseProject(fixture.project),
    before = JSON.stringify(source);
  assert.doesNotThrow(() => serializeProject(source));
  assert.throws(() => transaction(source, [copyCommand("animation-tone")]), /orçamento/);
  assert.equal(JSON.stringify(source), before);
});

test("clip events and linked audio copy on every artboard with distinct IDs and shared assets, and delete only clip-owned dependencies", () => {
  const fixture = audioProjectFixture(),
    second = structuredClone(fixture.project.artboards[0]);
  assert.ok(second);
  second.id = "artboard-second";
  fixture.project.artboards.push(second);
  const source = parseProject(fixture.project),
    before = JSON.stringify(source),
    copied = transaction(source, [copyCommand("animation-tone")]);
  assert.deepEqual(copied.assets, source.assets);
  for (const board of copied.artboards) {
    const event = board.behavior?.events.find((event) => event.animationId === "animation-copy"),
      original = board.behavior?.events.find((event) => event.animationId === "animation-tone"),
      audio = board.audio?.bindings.find((binding) => binding.eventId === event?.id);
    assert.ok(event && original && audio);
    assert.notEqual(event.id, original.id);
    assert.notEqual(event.data, original.data);
    assert.deepEqual({ ...event, id: original.id, animationId: original.animationId }, original);
    assert.notEqual(audio.id, source.artboards[0]?.audio?.bindings[0]?.id);
    assert.equal(audio.assetId, fixture.asset.id);
    assert.equal(board.audio?.bindings.length, 2);
  }
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(transaction(copied, [deleteCommand("animation-copy")]), source);
});

test("duplicating/deleting a rig clip respects inherited owner locks and a failed mixed transaction publishes nothing", () => {
  const fixture = trimFixture();
  const groupId = fixture.run([
    {
      type: "composition",
      operation: "group",
      targetIds: [fixture.shapeId],
      name: "Locked parent",
    },
  ]).selected;
  assert.ok(groupId);
  fixture.run([{ type: "scene", operation: "lock", targetId: groupId, value: true }]);
  const source = fixture.project(),
    before = JSON.stringify(source);
  for (const command of [copyCommand(fixture.animationId), deleteCommand(fixture.animationId)]) {
    assert.throws(() => transaction(source, [command]), /bloqueado|Desbloqueie/);
    assert.equal(JSON.stringify(source), before);
  }
  const free = trimFixture(),
    freeBefore = JSON.stringify(free.project());
  assert.throws(
    () =>
      transaction(free.project(), [
        copyCommand(free.animationId),
        {
          type: "scene",
          operation: "rename",
          targetId: "node-missing",
          value: "Never published",
        },
      ]),
    /Selecione um objeto/,
  );
  assert.equal(JSON.stringify(free.project()), freeBefore);
});

test("deleting clips cannot bypass TRS locks, component/machine references, or truncate rig keys through duration changes", () => {
  const fixture = trimFixture(),
    source = fixture.project(),
    board = source.artboards[0];
  assert.ok(board);
  const locked = structuredClone(source),
    lockedShape = locked.artboards[0]?.scene.nodes[0];
  assert.ok(lockedShape);
  lockedShape.locked = true;
  delete locked.artboards[0]?.rig;
  const clip = locked.motion.animations[0];
  assert.ok(clip);
  clip.tracks.push({
    id: "track-position",
    targetId: fixture.shapeId,
    property: "x",
    keys: [{ id: "key-position", frame: 0, value: 0, easing: "linear" }],
  });
  assert.throws(() => transaction(locked, [deleteCommand(fixture.animationId)]), /Desbloqueie/);
  assert.throws(
    () =>
      transaction(source, [
        {
          type: "motion",
          command: {
            type: "update-animation",
            animationId: fixture.animationId,
            name: "Shortened",
            fps: 10,
            frames: 5,
            mode: "once",
          },
        },
      ]),
    /duração/,
  );
  const machine = structuredClone(source),
    machineBoard = machine.artboards[0];
  assert.ok(machineBoard);
  machineBoard.behavior = {
    version: 1,
    defaultMachineId: "machine-source",
    inputs: [],
    bindings: [],
    listeners: [],
    events: [],
    machines: [
      {
        id: "machine-source",
        name: "Source",
        layers: [
          {
            id: "layer-source",
            name: "Source",
            entryStateId: "state-source",
            mode: "override",
            weight: 1,
            targetIds: [],
            properties: ["x"],
            transitions: [],
            states: [
              {
                id: "state-source",
                name: "Source",
                kind: "animation",
                animationId: fixture.animationId,
                speed: 1,
                x: 0,
                y: 0,
              },
            ],
          },
        ],
      },
    ],
  };
  const valid = parseProject(machine),
    before = JSON.stringify(valid);
  assert.throws(
    () => transaction(valid, [deleteCommand(fixture.animationId)]),
    /animação|Animação/,
  );
  assert.equal(JSON.stringify(valid), before);
  const componentProject = structuredClone(source);
  const host: Artboard = {
    id: "artboard-host",
    name: "Host",
    scene: { viewBox: [0, 0, 300, 300], nodes: [] },
  };
  componentProject.artboards.push(host);
  applyComponent(host.scene, {
    type: "component",
    operation: "create",
    name: "Animated source",
    instance: {
      artboardId: board.id,
      animationId: fixture.animationId,
      width: 200,
      height: 200,
      fit: "contain",
      speed: 1,
      offsetSeconds: 0,
      overrides: [],
    },
  });
  const withComponent = parseProject(componentProject),
    componentBefore = JSON.stringify(withComponent);
  assert.throws(
    () => transaction(withComponent, [deleteCommand(fixture.animationId)]),
    /animação|Animação/,
  );
  assert.equal(JSON.stringify(withComponent), componentBefore);
});

test("audio and rig duplication budgets reject before publishing any part of a clip copy", () => {
  const fixture = audioProjectFixture(),
    board = fixture.project.artboards[0],
    binding = board?.audio?.bindings[0];
  assert.ok(board?.audio && binding);
  board.audio.bindings = Array.from({ length: 256 }, (_, index) => ({
    ...binding,
    id: `audio-budget-${index}`,
  }));
  const source = parseProject(fixture.project),
    before = JSON.stringify(source);
  assert.throws(() => transaction(source, [copyCommand("animation-tone")]), /orçamento/);
  assert.equal(JSON.stringify(source), before);
});

test("rig track duplication honors the aggregate budget for a project still inside the file limit", () => {
  const fixture = trimFixture(),
    source = fixture.project(),
    board = source.artboards[0];
  assert.ok(board?.rig);
  const geometry = rigObjects(board.scene).get(fixture.shapeId)?.geometry;
  assert.ok(geometry);
  board.rig.morphs = Array.from({ length: 255 }, (_, index) => ({
    id: `morph-${index}`,
    name: "Pose",
    targetId: fixture.shapeId,
    weight: 0,
    geometry,
  }));
  const entries = rigParameterEntries(board.rig);
  assert.equal(entries.length, 258);
  source.motion.animations = Array.from({ length: 46 }, (_, index) => ({
    id: `animation-${index}`,
    name: "Clip",
    fps: 10,
    frames: 10,
    mode: "once",
    tracks: [],
  }));
  board.rig.parameterClips = source.motion.animations.map((animation, clipIndex) => ({
    animationId: animation.id,
    tracks: entries.map((entry, trackIndex) => ({
      id: `track-${clipIndex}-${trackIndex}`,
      targetId: entry.targetId,
      property: entry.property,
      keys: [
        {
          id: `key-${clipIndex}-${trackIndex}`,
          frame: 0,
          value: entry.definition.initial,
          easing: "linear",
        },
      ],
    })),
  }));
  const valid = parseProject(source),
    before = JSON.stringify(valid);
  assert.doesNotThrow(() => serializeProject(valid));
  assert.throws(() => transaction(valid, [copyCommand("animation-0")]), /orçamento/);
  assert.equal(JSON.stringify(valid), before);
});
