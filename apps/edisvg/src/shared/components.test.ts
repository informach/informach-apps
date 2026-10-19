import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePlayback } from "@informach/edi-motion";
import { buildExport } from "../renderer/src/export.js";
import { compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { newProject, parseProject } from "./project";
import { flattenScene, renderScene } from "./scene.js";

function fixture() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID();
  const run = (commands: unknown[], artboardId = project.defaultArtboardId) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, sessionId, revision, artboardId, commands },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-master",
      name: "Símbolo",
      width: 100,
      height: 100,
    },
    { type: "scene", operation: "add", targetId: null, value: "rect" },
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-root",
          name: "Cena",
          fps: 30,
          frames: 60,
          mode: "once",
          tracks: [],
        },
      },
    },
  ]);
  const target = project.artboards.find((board) => board.id === "artboard-master")?.scene.nodes[0];
  assert.ok(target);
  run(
    [
      {
        type: "motion",
        command: {
          type: "create-animation",
          animation: {
            id: "animation-symbol",
            name: "Aceno",
            fps: 24,
            frames: 24,
            mode: "ping-pong",
            tracks: [],
          },
        },
      },
      ...[0, 24].map((frame) => ({
        type: "motion",
        command: {
          type: "set-key",
          animationId: "animation-symbol",
          targetId: target.id,
          property: "x",
          frame,
          value: (frame / 24) * 100,
        },
      })),
    ],
    "artboard-master",
  );
  const instance = {
    artboardId: "artboard-master",
    animationId: "animation-symbol",
    width: 200,
    height: 100,
    fit: "contain",
    speed: 1,
    offsetSeconds: 0,
    overrides: [],
  };
  return { project: () => project, run, instance, targetId: target.id };
}
test("instances remain live, independently overridable and faithfully compiled with one shared clock", () => {
  const { project, run, instance, targetId } = fixture();
  const a = run(
    [{ type: "component", operation: "create", name: "Primeira", instance }],
    "artboard-main",
  ).selected;
  const b = run(
    [
      {
        type: "component",
        operation: "create",
        name: "Segunda",
        instance: {
          ...instance,
          offsetSeconds: 0.25,
          overrides: [{ targetId, attrs: { fill: "#ff0000" } }],
        },
      },
    ],
    "artboard-main",
  ).selected;
  assert.ok(a && b);
  const before = structuredClone(project());
  const compiled = compileArtboard(project(), "artboard-main"),
    root = compiled.playback.motion.animations.find((clip) => clip.id === "animation-root");
  assert.ok(root);
  assert.equal(compiled.playback.drivers.length, 2);
  const copies = [...compiled.sourceMap].filter(([, source]) => source.objectId === targetId);
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0]?.[0], copies[1]?.[0]);
  const first = copies.find(([, source]) => source.instancePath[0] === a),
    second = copies.find(([, source]) => source.instancePath[0] === b);
  assert.ok(first && second);
  assert.equal(evaluatePlayback(root, 15, compiled.playback.drivers).get(first[0])?.x, 50);
  assert.equal(evaluatePlayback(root, 15, compiled.playback.drivers).get(second[0])?.x, 75);
  const secondNode = flattenScene(compiled.scene).find(({ node }) => node.id === second[0])?.node;
  assert.equal(secondNode?.attrs.fill, "#ff0000");
  run(
    [{ type: "scene", operation: "attrs", targetId, value: { stroke: "#123456" } }],
    "artboard-master",
  );
  const changed = compileArtboard(project(), "artboard-main");
  assert.ok(
    flattenScene(changed.scene)
      .filter(({ node }) => node.tag === "rect")
      .every(({ node }) => node.attrs.stroke === "#123456"),
  );
  assert.deepEqual(
    before.artboards.find((board) => board.id === "artboard-master")?.scene.nodes[0]?.attrs.stroke,
    undefined,
  );
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project()))), project());
  assert.match(
    renderScene(changed.scene, { runtime: true, compiled: true }),
    /preserveAspectRatio="xMidYMid meet"/,
  );
  const exported = buildExport(
    { ...project(), activeArtboardId: "artboard-main", activeClipId: "animation-root" },
    { format: "svg", alt: "Instâncias", reduced: true, offscreen: true },
  ).content;
  assert.match(exported, /animateTransform/);
  assert.match(exported, /50 0/);
});
test("nested components inherit parent phase and compile deterministically without changing source IDs", () => {
  const { project, run, instance, targetId } = fixture();
  run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-wrapper",
      name: "Wrapper",
      width: 200,
      height: 200,
    },
    { type: "component", operation: "create", name: "Interna", instance },
  ]);
  const outer = run(
    [
      {
        type: "component",
        operation: "create",
        name: "Externa",
        instance: { ...instance, artboardId: "artboard-wrapper", animationId: "animation-root" },
      },
    ],
    "artboard-main",
  ).selected;
  assert.ok(outer);
  const first = compileArtboard(project(), "artboard-main"),
    second = compileArtboard(project(), "artboard-main");
  assert.deepEqual(first.playback, second.playback);
  assert.deepEqual(first.scene, second.scene);
  assert.equal(first.playback.drivers[0]?.id, outer);
  assert.equal(first.playback.drivers[1]?.parentId, outer);
  assert.equal(
    [...first.sourceMap.values()].find((source) => source.objectId === targetId)?.instancePath
      .length,
    2,
  );
});
test("cycles, orphan overrides, referenced master/clip deletion and incompatible operations fail atomically", () => {
  const { project, run, instance, targetId } = fixture();
  const id = run(
    [{ type: "component", operation: "create", name: "Instância", instance }],
    "artboard-main",
  ).selected;
  assert.ok(id);
  const before = structuredClone(project());
  for (const [commands, board] of [
    [
      [
        {
          type: "component",
          operation: "create",
          name: "Ciclo",
          instance: { ...instance, artboardId: "artboard-main" },
        },
      ],
      "artboard-master",
    ],
    [[{ type: "artboard", operation: "delete", id: "artboard-master" }], "artboard-main"],
    [
      [{ type: "motion", command: { type: "delete-animation", animationId: "animation-symbol" } }],
      "artboard-main",
    ],
    [
      [
        {
          type: "component",
          operation: "update",
          targetId: id,
          instance: { ...instance, overrides: [{ targetId: "node-absent", text: "x" }] },
        },
      ],
      "artboard-main",
    ],
    [
      [
        {
          type: "component",
          operation: "update",
          targetId: id,
          instance: { ...instance, overrides: [{ targetId, text: "x" }] },
        },
      ],
      "artboard-main",
    ],
    [[{ type: "composition", operation: "ungroup", targetId: id }], "artboard-main"],
  ] as const) {
    assert.throws(() => run([...commands], board));
    assert.deepEqual(project(), before);
  }
  assert.throws(() => renderScene(project().artboards[0]?.scene), /compilados/);
});
test("small component graphs cannot expand geometry or animation data beyond the resource budget", () => {
  const geometry = fixture();
  geometry.run(
    [
      {
        type: "scene",
        operation: "attrs",
        targetId: geometry.targetId,
        value: { "font-family": "Arial".repeat(100000) },
      },
    ],
    "artboard-master",
  );
  const before = structuredClone(geometry.project());
  assert.throws(
    () =>
      geometry.run(
        Array.from({ length: 9 }, () => ({
          type: "component",
          operation: "create",
          name: "Instância",
          instance: geometry.instance,
        })),
        "artboard-main",
      ),
    /expandido.*orçamento/,
  );
  assert.deepEqual(geometry.project(), before);
  const keys = fixture();
  const clip = keys.project().motion.animations.find((clip) => clip.id === "animation-symbol"),
    track = clip?.tracks[0];
  assert.ok(clip && track);
  clip.frames = 10000;
  track.keys = Array.from({ length: 10000 }, (_, frame) => ({
    id: `key-budget-${frame}`,
    frame,
    value: frame % 100,
    easing: "linear",
  }));
  const keysBefore = structuredClone(keys.project());
  assert.throws(
    () =>
      keys.run(
        Array.from({ length: 11 }, () => ({
          type: "component",
          operation: "create",
          name: "Instância",
          instance: keys.instance,
        })),
        "artboard-main",
      ),
    /chaves expandidas/,
  );
  assert.deepEqual(keys.project(), keysBefore);
});
