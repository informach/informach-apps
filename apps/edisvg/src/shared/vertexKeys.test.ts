import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackContext, evaluatePlaybackFrame } from "@informach/edi-motion";
import { timelineClip } from "./animationTimeline";
import { compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { newProject, parseProject } from "./project";
import { vertexGeometryAt } from "./vertexKeys";

const line = (y: number) => [
  {
    closed: false,
    points: [
      { x: 0, y: 0, in: null, out: null },
      { x: 100, y, in: null, out: null },
    ],
  },
];

function animated() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    run = (commands: unknown[]) => {
      const result = executeDocumentTransaction(
        { project, revision, sessionId },
        { projectId: project.id, sessionId, revision, commands },
      );
      project = result.project;
      revision = result.revision;
      return project;
    };
  run([
    {
      type: "scene",
      operation: "add",
      targetId: null,
      value: { tag: "path", attrs: { d: "M0 0 L100 0", fill: "none", stroke: "#000000" } },
    },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-arm",
          name: "Braço",
          frames: 10,
          fps: 10,
          mode: "loop",
          tracks: [],
        },
      },
    },
  ]);
  const board = () => project.artboards[0],
    id = board()?.scene.nodes[0]?.id ?? "";
  const key = (frame: number, y: number) => ({
    type: "vertex-keys",
    command: {
      operation: "set",
      animationId: "animation-arm",
      targetId: id,
      frame,
      geometry: line(y),
    },
  });
  run([key(0, 0), key(10, 40)]);
  return { project: () => project, board, id, run, key };
}

test("vertex keys compile into morph channels that move the path between keys", () => {
  const { project, board, id } = animated();
  const clip = board()?.vertexClips?.[0];
  assert.deepEqual(
    clip?.keys.map((key) => key.frame),
    [0, 10],
  );
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project()))).artboards[0]?.vertexClips, [
    clip,
  ]);
  assert.throws(() => parseProject({ ...project(), version: 24 }), /vértices requer projeto v25/);
  assert.equal(board()?.rig, undefined, "the authored rig stays untouched");
  const compiled = compileArtboard(project(), board()?.id ?? "");
  const rig = compiled.playback.rigScopes?.[0]?.rig;
  assert.equal(rig?.morphs?.length, 2);
  const context = createPlaybackContext(compiled.playback),
    animation = compiled.playback.motion.animations[0];
  assert.ok(animation && clip);
  for (const [frame, y] of [
    [0, 0],
    [5, 20],
    [10, 40],
  ] as const) {
    const geometry = evaluatePlaybackFrame(context, animation, frame).geometry.get(id);
    assert.equal(geometry?.[0]?.points[1]?.y, y, `frame ${frame}`);
    assert.equal(vertexGeometryAt(clip, frame)[0]?.points[1]?.y, y, "the editor agrees");
  }
});

test("a key on an existing frame is replaced and keys follow the timeline", () => {
  const { board, run, key, project } = animated();
  run([key(10, 60)]);
  assert.equal(board()?.vertexClips?.[0]?.keys.length, 2);
  assert.equal(board()?.vertexClips?.[0]?.keys[1]?.geometry[0]?.points[1]?.y, 60);
  const boardId = board()?.id ?? "",
    animation = project().motion.animations[0];
  const current = board();
  assert.ok(current && animation);
  const row = timelineClip(current, animation).tracks.find(
    (track) => track.property === "vertices",
  );
  assert.equal(row?.label, "Caminho · Vértices");
  const last = row?.keys[1];
  assert.ok(row && last);
  const reference = { kind: "vertex", artboardId: boardId, trackId: row.id, keyId: last.id };
  run([
    {
      type: "animation-keys",
      command: {
        operation: "move",
        animationId: "animation-arm",
        references: [reference],
        deltaFrames: -4,
        scale: 1,
        anchorFrame: 0,
      },
    },
  ]);
  assert.deepEqual(
    board()?.vertexClips?.[0]?.keys.map((key) => [key.frame, key.geometry[0]?.points[1]?.y]),
    [
      [0, 0],
      [6, 60],
    ],
  );
  run([
    {
      type: "animation-keys",
      command: { operation: "delete", animationId: "animation-arm", references: [reference] },
    },
  ]);
  assert.equal(board()?.vertexClips?.[0]?.keys.length, 1);
});

test("vertex keys keep the path's points and go with their animation and path", () => {
  const { board, run, id, project } = animated();
  assert.throws(
    () =>
      run([
        {
          type: "scene",
          operation: "path",
          targetId: id,
          value: "M0 0 L50 0 L100 0",
        },
      ]),
    /mesmos pontos e alças/,
  );
  run([
    {
      type: "motion",
      command: {
        type: "duplicate-animation",
        animationId: "animation-arm",
        id: "animation-copy",
        name: "Cópia",
      },
    },
  ]);
  assert.deepEqual(
    board()?.vertexClips?.map((clip) => clip.animationId),
    ["animation-arm", "animation-copy"],
  );
  const report = inspectLottieCompatibility(project(), {
    artboardId: board()?.id ?? "",
    animationId: "animation-arm",
    alt: "Braço",
    subdivisions: 1,
    confirmSampling: true,
    confirmRendererPrecision: true,
    confirmAnimationOnly: true,
  });
  // Lottie only objects to the straight segments, not to the vertex keys.
  assert.deepEqual(
    report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code),
    ["geometry-paint"],
  );
  run([{ type: "motion", command: { type: "delete-animation", animationId: "animation-copy" } }]);
  assert.equal(board()?.vertexClips?.length, 1);
  run([{ type: "scene-batch", operation: "delete", targetIds: [id] }]);
  assert.equal(board()?.vertexClips, undefined);
});
