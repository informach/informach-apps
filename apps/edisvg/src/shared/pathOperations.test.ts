import assert from "node:assert/strict";
import { test } from "node:test";
import { executeDocumentTransaction } from "./documentCommands";
import { parsePath, pointOnSegment, serializePath } from "./pathGeometry.js";
import { simplifyContours } from "./pathOperations";
import { newProject } from "./project";
import { editScene } from "./scene.js";

function fixture(d: string) {
  const project = newProject(),
    scene = project.artboards[0]?.scene;
  if (!scene) throw new Error("No scene");
  const id = editScene(scene, null, "add", { tag: "path", attrs: { d } });
  if (!id) throw new Error("No path");
  const sessionId = crypto.randomUUID();
  return {
    project,
    id,
    run: (command: unknown) =>
      executeDocumentTransaction(
        { project, sessionId, revision: 0 },
        { projectId: project.id, sessionId, revision: 0, commands: [command] },
      ),
  };
}
test("multi-vertex commands are atomic, preserve handles and reject invalid selection or locks", () => {
  const f = fixture("M0 0C10 0 20 0 30 0L40 20L50 30"),
    before = structuredClone(f.project);
  const result = f.run({
    type: "path-edit",
    targetId: f.id,
    operation: "move",
    vertices: [
      { contour: 0, index: 0 },
      { contour: 0, index: 1 },
    ],
    dx: 5,
    dy: 10,
  });
  const path = parsePath(result.project.artboards[0]?.scene.nodes[0]?.attrs.d ?? "")[0];
  assert.ok(path);
  assert.deepEqual(path.points[0], { x: 5, y: 10, in: null, out: { x: 15, y: 10 } });
  assert.equal(path.points[1]?.x, 35);
  assert.deepEqual(f.project, before);
  for (const vertices of [
    [{ contour: 0, index: 99 }],
    [
      { contour: 0, index: 0 },
      { contour: 0, index: 0 },
    ],
    [
      { contour: 0, index: 0 },
      { contour: 0, index: 1 },
      { contour: 0, index: 2 },
    ],
  ])
    assert.throws(() =>
      f.run({ type: "path-edit", targetId: f.id, operation: "delete", vertices }),
    );
  const node = f.project.artboards[0]?.scene.nodes[0];
  assert.ok(node);
  node.locked = true;
  assert.throws(
    () => f.run({ type: "path-edit", targetId: f.id, operation: "simplify", tolerance: 1 }),
    /Desbloqueie/,
  );
});
test("split and endpoint join preserve cubic segments, IDs and roundtrip geometry", () => {
  const f = fixture("M0 0C10 0 20 0 30 0C40 0 50 10 60 10");
  const split = f.run({
    type: "path-edit",
    targetId: f.id,
    operation: "split",
    vertex: { contour: 0, index: 1 },
  });
  const splitScene = split.project.artboards[0]?.scene,
    node = splitScene?.nodes[0];
  assert.ok(node);
  assert.equal(node.id, f.id);
  const pieces = parsePath(node.attrs.d ?? "");
  assert.equal(pieces.length, 2);
  assert.deepEqual(
    pointOnSegment(pieces[0], 0, 0.3),
    pointOnSegment(parsePath(f.project.artboards[0]?.scene.nodes[0]?.attrs.d ?? "")[0], 0, 0.3),
  );
  const sessionId = crypto.randomUUID(),
    joined = executeDocumentTransaction(
      { project: split.project, sessionId, revision: 0 },
      {
        projectId: split.project.id,
        sessionId,
        revision: 0,
        commands: [
          {
            type: "path-edit",
            targetId: f.id,
            operation: "join",
            vertices: [
              { contour: 0, index: 1 },
              { contour: 1, index: 0 },
            ],
          },
        ],
      },
    );
  assert.deepEqual(
    parsePath(joined.project.artboards[0]?.scene.nodes[0]?.attrs.d ?? ""),
    parsePath(f.project.artboards[0]?.scene.nodes[0]?.attrs.d ?? ""),
  );
  const closed = fixture("M0 0C10 0 20 0 30 0L30 30Z"),
    opened = closed.run({
      type: "path-edit",
      targetId: closed.id,
      operation: "split",
      vertex: { contour: 0, index: 1 },
    });
  const contour = parsePath(opened.project.artboards[0]?.scene.nodes[0]?.attrs.d ?? "")[0];
  assert.ok(contour);
  assert.equal(contour.closed, false);
  assert.equal(contour.points.length, 4);
  assert.deepEqual(contour.points[0]?.out, null);
  assert.deepEqual(contour.points.at(-1)?.in, { x: 20, y: 0 });
});
test("simplification is explicitly polygonal, bounded, and within local tolerance for a sampled cubic", () => {
  const source = parsePath("M0 0C0 100 100 100 100 0"),
    tolerance = 0.25,
    result = parsePath(serializePath(simplifyContours(source, tolerance)));
  const contour = result[0];
  assert.ok(contour);
  assert.ok(contour.points.length > 2 && contour.points.length < 100);
  for (let step = 0; step <= 100; step++) {
    const point = pointOnSegment(source[0], 0, step / 100);
    let best = Infinity;
    for (let i = 0; i < contour.points.length - 1; i++) {
      const a = contour.points[i],
        b = contour.points[i + 1];
      assert.ok(a);
      assert.ok(b);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
        );
      best = Math.min(best, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
    }
    assert.ok(best <= tolerance, `error ${best}`);
  }
  assert.throws(() => simplifyContours(source, 0));
  assert.equal(source[0]?.points.length, 2);
});
