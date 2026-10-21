import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultLayoutContainer, defaultLayoutItem } from "@informach/edi-motion/layout";
import { parseInteractiveDocument } from "@informach/edi-motion/runtime";
import { buildClipExport } from "../renderer/src/clipExport";
import { compileArtboard } from "./components";
import { executeDocumentTransaction } from "./documentCommands";
import { compileInteractiveArtboard } from "./interactive";
import { inspectLottieCompatibility } from "./lottie/prepare";
import { newProject, type Project, parseProject } from "./project";
import { flattenScene } from "./scene.js";

const clipId = "animation-order";
function stacked() {
  let project = newProject(),
    revision = 0;
  const sessionId = crypto.randomUUID(),
    boardId = project.defaultArtboardId;
  assert.ok(boardId);
  const run = (commands: unknown[], artboardId = boardId) => {
    const result = executeDocumentTransaction(
      { project, revision, sessionId },
      { projectId: project.id, sessionId, revision, artboardId, commands },
    );
    project = result.project;
    revision = result.revision;
    return result;
  };
  const add = (artboardId = boardId) =>
    run([{ type: "scene", operation: "add", targetId: null, value: "rect" }], artboardId)
      .selected ?? assert.fail("Missing shape");
  const [a, b, c] = [add(), add(), add()];
  const group = run([
    { type: "composition", operation: "group", targetIds: [b, c], name: "G" },
  ]).selected;
  assert.ok(group);
  const setOrder = (scopeId: string | null, frame: number, order: string[], animationId = clipId) =>
    run([
      { type: "motion", command: { type: "set-draw-order", animationId, scopeId, frame, order } },
    ]);
  run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: { id: clipId, name: "Ordem", fps: 10, frames: 10, mode: "loop", tracks: [] },
      },
    },
  ]);
  setOrder(null, 0, [group, a]);
  setOrder(null, 5, [a, group]);
  setOrder(group, 3, [c, b]);
  return { project: () => project, run, add, setOrder, boardId, a, b, c, group };
}
const clip = (project: Project, id = clipId) =>
  project.motion.animations.find((animation) => animation.id === id);

test("draw orders stack direct siblings of one artboard and require project v23", () => {
  const f = stacked();
  assert.deepEqual(
    clip(f.project())?.drawOrders?.map((drawOrder) => [
      drawOrder.scopeId,
      drawOrder.keys.map((key) => [key.frame, key.order]),
    ]),
    [
      [
        null,
        [
          [0, [f.group, f.a]],
          [5, [f.a, f.group]],
        ],
      ],
      [f.group, [[3, [f.c, f.b]]]],
    ],
  );
  assert.throws(() => f.setOrder(null, 2, [f.a, f.b]), /fora do grupo animado/);
  assert.throws(() => f.setOrder(f.a, 2, [f.b]), /fora do grupo animado/);
  const legacy = { ...structuredClone(f.project()), version: 22 };
  assert.throws(() => parseProject(legacy), /requer projeto v23/);
});

test("compiled timeline and interactive documents carry the orders under blueprint v12", () => {
  const f = stacked(),
    project = f.project(),
    timeline = compileArtboard(project, f.boardId).playback.motion.animations[0],
    interactive = compileInteractiveArtboard(project, f.boardId, { animationId: clipId });
  assert.equal(timeline?.drawOrders?.length, 2);
  const parsed = parseInteractiveDocument(interactive.document);
  assert.deepEqual(
    parsed.playback.motion.animations[0]?.drawOrders?.map((drawOrder) => drawOrder.scopeId),
    [null, f.group],
  );
  assert.throws(
    () => parseInteractiveDocument({ ...structuredClone(interactive.document), version: 11 }),
    /blueprint v12/,
  );
});

test("a component's root stacking reorders its viewport under the instance clock", () => {
  const f = stacked();
  f.run([
    {
      type: "artboard",
      operation: "create",
      id: "artboard-part",
      name: "Peça",
      width: 100,
      height: 100,
    },
  ]);
  const [x, y] = [f.add("artboard-part"), f.add("artboard-part")];
  f.run([
    {
      type: "motion",
      command: {
        type: "create-animation",
        animation: {
          id: "animation-part",
          name: "Peça",
          fps: 10,
          frames: 10,
          mode: "loop",
          tracks: [],
        },
      },
    },
  ]);
  f.setOrder(null, 0, [y, x], "animation-part");
  // The shared clip now stacks the root of two artboards, once each.
  assert.equal(clip(f.project(), "animation-part")?.drawOrders?.length, 1);
  const instance = f.run([
    {
      type: "component",
      operation: "create",
      name: "Instância",
      instance: {
        artboardId: "artboard-part",
        animationId: "animation-part",
        width: 100,
        height: 100,
        fit: "contain",
        speed: 1,
        offsetSeconds: 0,
        overrides: [],
      },
    },
  ]).selected;
  assert.ok(instance);
  const compiled = compileArtboard(f.project(), f.boardId),
    viewport = flattenScene(compiled.scene).find(({ parentId }) => parentId === instance)?.node,
    driver = compiled.playback.drivers.find((item) => item.id === instance);
  assert.equal(viewport?.tag, "svg");
  const [drawOrder] = driver?.animation.drawOrders ?? [];
  assert.equal(drawOrder?.scopeId, viewport?.id);
  const compiledIds = (drawOrder?.keys[0]?.order ?? []).map(
    (id) => compiled.sourceMap.get(id)?.objectId,
  );
  assert.deepEqual(compiledIds, [y, x]);
  // At the root, the component clip's orders list objects of another artboard: dropped.
  assert.equal(
    compiled.playback.motion.animations.find((item) => item.id === "animation-part")?.drawOrders,
    undefined,
  );
});

test("delete, duplicate and artboard copies keep draw orders coherent", () => {
  const f = stacked();
  f.run([{ type: "scene-batch", operation: "duplicate", targetIds: [f.group] }]);
  let project = f.project();
  const copy = project.artboards[0]?.scene.nodes.find(
    (node) => node.id !== f.group && node.id !== f.a,
  );
  assert.ok(copy);
  const [root, inner, copied] = clip(project)?.drawOrders ?? [];
  // The copy is stacked right above its source, as it is placed in the scene.
  assert.deepEqual(
    root?.keys.map((key) => key.order),
    [
      [f.group, copy.id, f.a],
      [f.a, f.group, copy.id],
    ],
  );
  assert.equal(inner?.scopeId, f.group);
  assert.equal(copied?.scopeId, copy.id);
  assert.deepEqual(copied?.keys[0]?.order, copy.children.map((child) => child.id).reverse());
  f.run([{ type: "scene-batch", operation: "delete", targetIds: [copy.id, f.a] }]);
  project = f.project();
  assert.deepEqual(
    clip(project)?.drawOrders?.map((drawOrder) => drawOrder.keys.map((key) => key.order)),
    [[[f.group], [f.group]], [[f.c, f.b]]],
  );
  f.run([
    {
      type: "artboard",
      operation: "duplicate",
      id: f.boardId,
      newId: "artboard-copy",
      name: "Cópia",
    },
  ]);
  project = f.project();
  const roots = clip(project)?.drawOrders?.filter((drawOrder) => drawOrder.scopeId === null) ?? [];
  assert.equal(roots.length, 2);
  assert.notDeepEqual(roots[0]?.keys[0]?.order, roots[1]?.keys[0]?.order);
  f.run([{ type: "artboard", operation: "delete", id: "artboard-copy" }]);
  assert.equal(
    clip(f.project())?.drawOrders?.filter((drawOrder) => drawOrder.scopeId === null).length,
    1,
  );
});

test("regrouping refuses objects an animated stacking refers to", () => {
  const f = stacked();
  assert.throws(
    () => f.run([{ type: "composition", operation: "ungroup", targetId: f.group }]),
    /ordem de desenho animada/,
  );
  assert.throws(
    () =>
      f.run([
        { type: "composition", operation: "reparent", targetId: f.a, parentId: f.group, index: 0 },
      ]),
    /ordem de desenho animada/,
  );
  assert.throws(
    () =>
      f.run([{ type: "composition", operation: "group", targetIds: [f.group, f.a], name: "H" }]),
    /ordem de desenho animada/,
  );
  // Reordering inside the same parent keeps the meaning of the keys.
  f.run([{ type: "composition", operation: "reparent", targetId: f.a, parentId: null, index: 0 }]);
});

test("sampled SVG and Lottie refuse an animated stacking they cannot represent", () => {
  const f = stacked(),
    project = f.project();
  assert.throws(
    () =>
      buildClipExport(
        project,
        clipId,
        { format: "svg", alt: "Ordem", reduced: false, offscreen: false, artboardId: f.boardId },
        "",
      ),
    /SVG\/SMIL/,
  );
  const report = inspectLottieCompatibility(project, {
    artboardId: f.boardId,
    animationId: clipId,
    alt: "Ordem",
  });
  assert.ok(
    report.issues.some((issue) => issue.code === "draw-order" && issue.severity === "error"),
  );
});

test("an animated draw order and a responsive layout cannot share an artboard", () => {
  const f = stacked();
  assert.throws(
    () =>
      f.run([
        {
          type: "layout",
          operation: "replace",
          value: {
            version: 1,
            root: defaultLayoutContainer(),
            containers: [],
            items: [defaultLayoutItem(f.a)],
          },
        },
      ]),
    /layout responsivo/,
  );
});
