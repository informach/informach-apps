import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createHistory } from "./history.js";
import {
  deleteVertex,
  moveHandle,
  moveVertex,
  parsePath,
  pathDataFromNode,
  pathFromNode,
  pointOnSegment,
  reverseContour,
  serializePath,
  setVertexType,
  splitSegment,
} from "./pathGeometry.js";
import { newProject, parseProject } from "./project.js";
import { editScene, identity, renderScene } from "./scene.js";

const close = (a, b, epsilon = 1e-5) => {
  assert.ok(Math.abs(a.x - b.x) < epsilon, `x: ${a.x} != ${b.x}`);
  assert.ok(Math.abs(a.y - b.y) < epsilon, `y: ${a.y} != ${b.y}`);
};
test("native primitive path syntax preserves arcs while editable geometry remains the same", () => {
  for (const [tag, attrs] of [
    ["circle", { cx: "40", cy: "50", r: "20" }],
    ["ellipse", { cx: "40", cy: "50", rx: "20", ry: "10" }],
    ["rect", { x: "10", y: "20", width: "40", height: "30", rx: "5" }],
  ]) {
    const node = {
      id: "node-primitive",
      name: "Forma",
      tag,
      attrs,
      children: [],
      text: "",
      transform: identity(),
      visible: true,
      locked: false,
    };
    const d = pathDataFromNode(node);
    assert.match(d, /A/);
    assert.deepEqual(parsePath(d), pathFromNode(node));
  }
});
test("a segment following closepath starts at the closed subpath's initial point", () => {
  for (const command of ["L20 20", "l20 20", "C5 5 10 10 20 20", "A10 10 0 0 1 20 20"]) {
    const parsed = parsePath(`M0 0L10 0Z${command}`);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].closed, true);
    assert.equal(parsed[1].closed, false);
    close(parsed[1].points[0], { x: 0, y: 0 });
    close(parsed[1].points.at(-1), { x: 20, y: 20 });
    const reopened = parsePath(serializePath(parsed));
    assert.equal(reopened.length, parsed.length);
    parsed.forEach((contour, index) => {
      contour.points.forEach((p, i) => {
        const restored = reopened[index].points[i];
        close(restored, p);
        if (p.in) close(restored.in, p.in);
        if (p.out) close(restored.out, p.out);
      });
    });
  }
});
test("SVG parser handles implicit/relative commands, exponents, subpaths and smooth curves", () => {
  const model = parsePath(
    "m1e1 20 10 0 h10 v10 c0 10 10 10 10 0 s10 -10 10 0 q10 10 20 0 t20 0 z M100 100 l5 5",
  );
  assert.equal(model.length, 2);
  assert.equal(model[0].closed, true);
  close(model[0].points[1], { x: 20, y: 20 });
  close(model[0].points[4].out, { x: 40, y: 20 });
  close(model[0].points.at(-1), { x: 90, y: 30 });
  assert.equal(serializePath(parsePath(serializePath(model))), serializePath(model));
  for (const d of [
    "",
    "L0 0",
    "M0 0C2 3",
    "M0 0A3 3 0 2 0 5 5",
    "M0 0 LNaN 2",
    "M0 0 L1e999 2",
    "M0 0 @L1 1",
  ])
    assert.throws(() => parsePath(d));
});

test("arcs convert to cubic curves, preserve endpoints, support compact flags and zero radii", () => {
  const circle = pathFromNode({ tag: "circle", attrs: { cx: "10", cy: "20", r: "5" } })[0];
  assert.equal(circle.points.length, 4);
  assert.equal(circle.closed, true);
  close(circle.points[0], { x: 15, y: 20 });
  close(circle.points[1], { x: 10, y: 25 });
  close(pointOnSegment(circle, 0, 0.5), { x: 10 + 5 / Math.sqrt(2), y: 20 + 5 / Math.sqrt(2) });
  close(parsePath("M0 0A10 20 45 1 0 40 50")[0].points.at(-1), { x: 40, y: 50 });
  close(parsePath("M0 0A10 10 0 0110 20")[0].points.at(-1), { x: 10, y: 20 });
  const line = parsePath("M0 0A0 10 0 0 1 10 20")[0];
  assert.equal(line.points[0].out, null);
});

test("primitive conversion preserves rounded corners, closure and dimensions", () => {
  const rect = pathFromNode({
    tag: "rect",
    attrs: { x: "-10", y: "4", width: "80", height: "30" },
  })[0];
  assert.equal(rect.closed, true);
  assert.equal(rect.points.length, 4);
  close(rect.points[2], { x: 70, y: 34 });
  const round = pathFromNode({ tag: "rect", attrs: { width: "80", height: "30", rx: "5" } })[0];
  assert.equal(round.points.length, 8);
  assert.ok(round.points.some((p) => p.out));
  assert.equal(
    pathFromNode({ tag: "polygon", attrs: { points: "0,0 20,0 10,20" } })[0].closed,
    true,
  );
  assert.equal(pathFromNode({ tag: "polyline", attrs: { points: "0,0 20,0" } })[0].closed, false);
  assert.throws(() => pathFromNode({ tag: "rect", attrs: { width: "-1", height: "10" } }));
  assert.throws(() => pathFromNode({ tag: "text", attrs: {} }));
});

test("moving anchors carries handles; handle modes enforce their geometric constraints", () => {
  const contour = parsePath("M0 0C10 0 20 10 30 10L60 10")[0],
    p = contour.points[1];
  p.out = { x: 40, y: 10 };
  moveVertex(p, 40, 20);
  close(p.in, { x: 30, y: 20 });
  close(p.out, { x: 50, y: 20 });
  moveHandle(p, "out", 50, 30, "mirrored");
  close(p.in, { x: 30, y: 10 });
  const length = Math.hypot(p.in.x - p.x, p.in.y - p.y);
  moveHandle(p, "out", 60, 20, "asymmetric");
  assert.ok(Math.abs(Math.hypot(p.in.x - p.x, p.in.y - p.y) - length) < 1e-8);
  const before = { ...p.in };
  moveHandle(p, "out", 70, 70, "detached");
  assert.deepEqual(p.in, before);
  setVertexType(contour, 1, "straight");
  assert.equal(p.in, null);
  assert.equal(p.out, null);
  setVertexType(contour, 1, "mirrored");
  assert.ok(p.in && p.out);
  close({ x: (p.in.x + p.out.x) / 2, y: (p.in.y + p.out.y) / 2 }, p);
});

test("inserting on a cubic preserves the curve using de Casteljau subdivision", () => {
  const original = parsePath("M0 0C20 80 70 -40 100 20")[0],
    edited = structuredClone(original),
    t = 0.37;
  assert.equal(splitSegment(edited, 0, t), 1);
  for (let i = 0; i <= 100; i++) {
    const u = i / 100,
      expected = pointOnSegment(original, 0, u);
    const actual =
      u <= t ? pointOnSegment(edited, 0, u / t) : pointOnSegment(edited, 1, (u - t) / (1 - t));
    close(actual, expected);
  }
  const closed = parsePath("M0 0L40 0L40 40Z")[0];
  splitSegment(closed, 2);
  assert.equal(closed.points.length, 4);
  deleteVertex(closed, 3);
  assert.equal(closed.points.length, 3);
  assert.throws(() => deleteVertex(closed, 1));
  const before = serializePath([edited]);
  reverseContour(edited);
  reverseContour(edited);
  assert.equal(serializePath([edited]), before);
});

test("path conversion and edits preserve identity, style, parent transforms, save and history", () => {
  const p = newProject();
  p.artboards[0].scene.nodes = [
    {
      id: "node-parent",
      name: "Grupo",
      tag: "g",
      attrs: { transform: "translate(20 30) rotate(25)", fill: "#123456" },
      transform: identity(),
      children: [
        {
          id: "node-shape",
          name: "Retângulo",
          tag: "rect",
          attrs: {
            x: "0",
            y: "0",
            width: "80",
            height: "40",
            stroke: "#fff",
            "stroke-width": "2",
            transform: "scale(2)",
          },
          transform: identity(),
          children: [],
        },
      ],
    },
  ];
  const history = createHistory(p),
    node = p.artboards[0].scene.nodes[0].children[0],
    geometry = pathFromNode(node);
  editScene(p.artboards[0].scene, node.id, "path", serializePath(geometry));
  history.commit(p);
  moveVertex(geometry[0].points[0], -20, 10);
  editScene(p.artboards[0].scene, node.id, "path", serializePath(geometry));
  history.commit(p);
  const reopened = parseProject(JSON.parse(JSON.stringify(p))),
    edited = reopened.artboards[0].scene.nodes[0].children[0];
  assert.equal(edited.id, node.id);
  assert.equal(edited.tag, "path");
  assert.equal(edited.attrs.transform, "scale(2)");
  assert.equal(edited.attrs.stroke, "#fff");
  assert.equal(edited.attrs.width, undefined);
  assert.match(renderScene(reopened.artboards[0].scene), /translate\(20 30\) rotate\(25\)/);
  close(parsePath(edited.attrs.d)[0].points[0], { x: -20, y: 10 });
  assert.equal(
    history.undo().artboards[0].scene.nodes[0].children[0].attrs.d,
    "M0 0 L80 0 L80 40 L0 40 Z",
  );
  assert.equal(history.undo().artboards[0].scene.nodes[0].children[0].tag, "rect");
  assert.equal(history.redo().artboards[0].scene.nodes[0].children[0].tag, "path");
  const before = JSON.stringify(p.artboards[0].scene);
  assert.throws(() => editScene(p.artboards[0].scene, node.id, "path", "M0 0 C1"));
  assert.equal(JSON.stringify(p.artboards[0].scene), before);
  p.artboards[0].scene.nodes[0].locked = true;
  assert.throws(() => editScene(p.artboards[0].scene, node.id, "path", "M0 0L1 1"));
});

test("every path in the bundled mascot can be opened, serialized and reopened", () => {
  const svg = readFileSync(new URL("../renderer/public/assets/zeze.svg", import.meta.url), "utf8");
  const paths = [...svg.matchAll(/\bd="([^"]+)"/g)];
  assert.ok(paths.length > 10);
  for (const [, d] of paths) {
    const model = parsePath(d),
      out = serializePath(model);
    assert.equal(serializePath(parsePath(out)), out);
  }
});
