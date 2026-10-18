import assert from "node:assert/strict";
import { test } from "node:test";
import { executeDocumentTransaction } from "./documentCommands";
import { parsePath } from "./pathGeometry.js";
import { newProject } from "./project";
import { editScene } from "./scene.js";

function fixture(d?: string) {
  const project = newProject(),
    scene = project.artboards[0]?.scene;
  if (!scene) throw new Error("No scene");
  const a = editScene(
      scene,
      null,
      "add",
      d
        ? { tag: "path", attrs: { d } }
        : { tag: "rect", attrs: { x: "0", y: "0", width: "10", height: "10", fill: "red" } },
    ),
    b = editScene(scene, null, "add", {
      tag: "rect",
      attrs: {
        x: d ? "6" : "5",
        y: d ? "6" : "0",
        width: d ? "2" : "10",
        height: d ? "2" : "10",
        fill: "blue",
      },
    });
  if (!a || !b) throw new Error("No operands");
  const sessionId = crypto.randomUUID();
  return {
    project,
    scene,
    a,
    b,
    run: (operation: string, patch = {}) =>
      executeDocumentTransaction(
        { project, sessionId, revision: 0 },
        {
          projectId: project.id,
          sessionId,
          revision: 0,
          commands: [
            {
              type: "vector-boolean",
              operation,
              targetIds: [a, b],
              tolerance: 0.25,
              approximateCurves: false,
              useFirstAppearance: true,
              ...patch,
            },
          ],
        },
      ),
  };
}
function area(d: string) {
  return Math.abs(
    parsePath(d).reduce(
      (sum, contour) =>
        sum +
        contour.points.reduce((area, p, index) => {
          const next = contour.points[(index + 1) % contour.points.length];
          if (!next) throw new Error("No point");
          return area + (p.x * next.y - next.x * p.y) / 2;
        }, 0),
      0,
    ),
  );
}
test("union/intersection/difference/xor operate on real geometry atomically and preserve first identity/appearance/transform", () => {
  for (const [operation, expected] of Object.entries({
    union: 150,
    intersection: 50,
    difference: 50,
    xor: 100,
  })) {
    const f = fixture();
    for (const node of f.scene.nodes)
      Object.assign(node.transform, {
        x: 20,
        y: 30,
        rotation: 35,
        sx: -2,
        sy: 0.5,
        px: 3,
        py: 4,
        skewX: 12,
      });
    const before = structuredClone(f.project),
      result = f.run(operation),
      node = result.project.artboards[0]?.scene.nodes[0];
    assert.ok(node);
    assert.equal(node.id, f.a);
    assert.equal(node.attrs.fill, "red");
    assert.equal(node.tag, "path");
    assert.deepEqual(node.transform, f.scene.nodes[0]?.transform);
    assert.ok(Math.abs(area(node.attrs.d ?? "") - expected) < 0.01);
    assert.equal(result.project.artboards[0]?.scene.nodes.length, 1);
    assert.deepEqual(f.project, before);
  }
});
test("nonzero winding preserves holes and overlapping signed regions; evenodd remains distinct", () => {
  for (const [inner, rule, expected] of [
    ["M5 5V15H15V5Z", "nonzero", 0],
    ["M5 5H15V15H5Z", "nonzero", 4],
    ["M5 5H15V15H5Z", "evenodd", 0],
  ] satisfies [string, string, number][]) {
    const f = fixture(`M0 0H20V20H0Z ${inner}`),
      node = f.scene.nodes[0];
    assert.ok(node);
    node.attrs["fill-rule"] = rule;
    const result = f.run("intersection"),
      path = result.project.artboards[0]?.scene.nodes[0];
    assert.equal(path ? area(path.attrs.d ?? "") : 0, expected);
  }
});
test("invalid, locked and ambiguous geometry refuse without mutation; curves need explicit approximation", () => {
  const f = fixture("M0 0C0 10 10 10 10 0L0 0Z"),
    before = structuredClone(f.project);
  assert.throws(() => f.run("union"), /aproximação/);
  assert.deepEqual(f.project, before);
  assert.equal(
    f.run("union", { approximateCurves: true }).project.artboards[0]?.scene.nodes[0]?.tag,
    "path",
  );
  const node = f.scene.nodes[1];
  assert.ok(node);
  node.locked = true;
  assert.throws(() => f.run("union", { approximateCurves: true }), /desbloqueadas/);
  const crossing = fixture("M0 0L10 10L0 10L10 0Z");
  assert.throws(() => crossing.run("union"), /autointersectantes/);
});
