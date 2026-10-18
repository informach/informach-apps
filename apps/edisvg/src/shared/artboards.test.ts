import assert from "node:assert/strict";
import { test } from "node:test";
import { firstScene } from "../../tests/fixtures";
import { bindActiveArtboard, replaceActiveScene } from "../renderer/src/artboardWorkspace";
import { buildExport } from "../renderer/src/export.js";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, PROJECT_VERSION, parseProject } from "./project";
import { editScene } from "./scene.js";

function fixture() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID();
  const run = (commands: unknown[], artboardId = project.defaultArtboardId) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, revision, sessionId, artboardId, commands },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  return { project: () => project, run };
}
test("artboards are independently editable, identified and persist without workspace selection", () => {
  const { project, run } = fixture();
  const original = structuredClone(project());
  run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-second",
      name: "Botão",
      width: 320,
      height: 80,
    },
  ]);
  run([{ type: "scene", operation: "add", targetId: null, value: "rect" }], "artboard-second");
  assert.equal(firstScene(project()).nodes.length, 0);
  const second = project().artboards[1];
  assert.ok(second);
  assert.equal(second.scene.nodes.length, 1);
  assert.deepEqual(second.scene.viewBox, [0, 0, 320, 80]);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project()))), project());
  const workspace = { ...project(), activeArtboardId: project().defaultArtboardId };
  bindActiveArtboard(workspace, "artboard-second");
  assert.equal(workspace.activeArtboardId, "artboard-second");
  assert.equal(workspace.defaultArtboardId, original.defaultArtboardId);
  replaceActiveScene(workspace, { viewBox: [0, 0, 200, 100], nodes: [] });
  assert.deepEqual(workspace.artboards[1]?.scene.viewBox, [0, 0, 200, 100]);
});
test("duplicating remaps objects, tracks and keys; deletion cleans references without changing other boards", () => {
  const { project, run } = fixture();
  const id = editScene(firstScene(project()), null, "add", "circle");
  assert.ok(id);
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-one",
          name: "A",
          fps: 30,
          frames: 30,
          mode: "loop",
          tracks: [],
        },
      },
    },
    {
      type: "motion",
      command: {
        type: "set-key",
        animationId: "animation-one",
        targetId: id,
        property: "x",
        frame: 0,
        value: 10,
      },
    },
  ]);
  const original = structuredClone(project());
  run([
    {
      type: "artboard",
      operation: "duplicate",
      id: "artboard-main",
      newId: "artboard-copy",
      name: "Cópia",
    },
  ]);
  const copied = project().artboards[1]?.scene.nodes[0],
    tracks = project().motion.animations[0]?.tracks;
  assert.ok(copied && tracks);
  assert.notEqual(copied.id, id);
  assert.equal(tracks[1]?.targetId, copied.id);
  assert.notEqual(tracks[0]?.keys[0]?.id, tracks[1]?.keys[0]?.id);
  const exported = buildExport(
    { ...project(), activeArtboardId: "artboard-copy", activeClipId: "animation-one" },
    { format: "svg", alt: "Cópia", reduced: false, offscreen: false },
  ).content;
  assert.ok(exported.includes(`data-edi-object="${copied.id}"`));
  assert.ok(!exported.includes(`data-edi-object="${id}"`));
  run([{ type: "artboard", operation: "delete", id: "artboard-copy" }]);
  assert.deepEqual(project(), original);
});
test("v1-v4 migrate to boards and v5 refuses unknown capabilities, duplicate IDs and aggregated budgets", () => {
  const base = {
    id: "project-old",
    name: "Antigo",
    animation: "Parado",
    transforms: {},
    keys: [],
    scene: { viewBox: [0, 0, 100, 80], nodes: [] },
  };
  for (const version of [1, 2, 3, 4]) {
    const migrated = parseProject({ ...base, version });
    assert.equal(migrated.version, PROJECT_VERSION);
    assert.deepEqual(firstScene(migrated).viewBox, [0, 0, 100, 80]);
    assert.deepEqual(parseProject(migrated), migrated);
  }
  const project = newProject();
  assert.throws(() => parseProject({ ...project, scene: base.scene }));
  assert.throws(() => parseProject({ ...project, defaultArtboardId: "artboard-missing" }));
  assert.throws(() =>
    parseProject({ ...project, artboards: [...project.artboards, ...project.artboards] }),
  );
  const nodeId = editScene(firstScene(project), null, "add", "rect");
  assert.ok(nodeId);
  const board = project.artboards[0];
  assert.ok(board);
  assert.throws(
    () =>
      parseProject({
        ...project,
        artboards: [board, { ...structuredClone(board), id: "artboard-other" }],
      }),
    /únicos/,
  );
  const many = Array.from({ length: 1001 }, (_, index) => ({
    ...board.scene.nodes[0],
    id: `node-${index}`,
  }));
  assert.throws(() =>
    parseProject({
      ...project,
      artboards: [
        { ...board, scene: { ...board.scene, nodes: many } },
        {
          ...board,
          id: "artboard-many",
          scene: {
            ...board.scene,
            nodes: many.map((node) => ({ ...node, id: `${node.id}-other` })),
          },
        },
      ],
    }),
  );
});
test("invalid multi-board transactions and deleting the only board preserve the original document", () => {
  const { project, run } = fixture(),
    before = structuredClone(project());
  assert.throws(() =>
    run([
      {
        type: "artboard",
        operation: "create",
        id: "artboard-second",
        name: "Outro",
        width: 10,
        height: 10,
      },
      {
        type: "artboard",
        operation: "update",
        id: "artboard-missing",
        name: "x",
        width: 1,
        height: 1,
      },
    ]),
  );
  assert.deepEqual(project(), before);
  assert.throws(() => run([{ type: "artboard", operation: "delete", id: "artboard-main" }]));
  assert.deepEqual(project(), before);
});
test("importing a scene is atomic and preserves existing artboards, clocks and referenced masters", () => {
  const project = newProject(),
    board = project.artboards[0];
  assert.ok(board);
  const id = editScene(board.scene, null, "add", "rect");
  assert.ok(id);
  const sessionId = crypto.randomUUID();
  const source = {
    viewBox: [0, 0, 100, 100],
    nodes: [
      {
        id: "node-imported",
        tag: "rect",
        name: "Importado",
        attrs: { width: "10", height: "20" },
        text: "",
        transform: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, opacity: 100 },
        children: [],
        visible: true,
        locked: false,
      },
    ],
  };
  const result = executeDocumentTransaction(
    { project, sessionId, revision: 0 },
    {
      projectId: project.id,
      sessionId,
      revision: 0,
      commands: [
        {
          type: "artboard",
          operation: "import",
          id: "artboard-imported",
          name: "Importado",
          scene: source,
        },
      ],
    },
  );
  assert.deepEqual(result.project.artboards[0], project.artboards[0]);
  assert.deepEqual(result.project.motion, project.motion);
  assert.equal(result.selectedArtboard, "artboard-imported");
  assert.equal(project.artboards.length, 1);
  assert.throws(() =>
    executeDocumentTransaction(
      { project, sessionId, revision: 0 },
      {
        projectId: project.id,
        sessionId,
        revision: 0,
        commands: [
          {
            type: "artboard",
            operation: "import",
            id: "artboard-imported",
            name: "Importado",
            scene: { ...source, nodes: [{ ...source.nodes[0], id }] },
          },
        ],
      },
    ),
  );
  assert.equal(project.artboards.length, 1);
});
