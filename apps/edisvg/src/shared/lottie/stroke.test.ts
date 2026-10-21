import assert from "node:assert/strict";
import { test } from "node:test";
import { identityTransform, transformMatrix } from "@informach/edi-motion";
import { lottieFixture } from "../../../tests/lottieFixture";
import { editScene } from "../scene.js";
import { compileLottie, LottieExportError } from "./compile";
import type { ShapeElement } from "./model";
import { shapeLayers } from "./model";
import { inspectLottieCompatibility, prepareLottie } from "./prepare";
import { visitLottieSamples } from "./sample";
import { conformalStrokeScale, prepareLottieStroke } from "./stroke";

test("stroke paint preserves absolute units, alpha, SVG cap/join defaults and refuses unproved profiles", () => {
  assert.equal(prepareLottieStroke({ stroke: "none" }), undefined);
  assert.deepEqual(
    prepareLottieStroke({
      stroke: "rgba(255,0,0,0.5)",
      "stroke-width": "8px",
      "stroke-opacity": "50%",
      "stroke-linecap": "square",
      "stroke-linejoin": "bevel",
    }),
    {
      color: [1, 0, 0, 1],
      opacity: (128 / 255) * 50,
      width: 8,
      cap: 3,
      join: 3,
    },
  );
  assert.deepEqual(prepareLottieStroke({ stroke: "black" }), {
    color: [0, 0, 0, 1],
    opacity: 100,
    width: 1,
    cap: 1,
    join: 1,
  });
  for (const width of ["1em", "1%", "2pt", "NaN", "-1", "1e309", "10000001", ""])
    assert.throws(() => prepareLottieStroke({ stroke: "red", "stroke-width": width }));
  assert.throws(
    () => prepareLottieStroke({ stroke: "red", "stroke-dasharray": Array(33).fill("2").join(" ") }),
    /32 valores/,
  );
  assert.throws(() => prepareLottieStroke({ stroke: "url(#paint)" }));
  assert.throws(() => prepareLottieStroke({ stroke: "red", "stroke-linecap": "inherit" }));
});
test("conformal stroke math covers reflection/rotation/collapse, not anisotropic or skewed averages", () => {
  const scales: [number, number][] = [
    [2, 2],
    [-2, 2],
    [2, -2],
    [-2, -2],
    [0, 0],
  ];
  for (const [sx, sy] of scales) {
    const matrix = transformMatrix({ ...identityTransform(), sx, sy, rotation: 33 });
    assert.ok(Math.abs(conformalStrokeScale(matrix) - Math.abs(sx ?? NaN)) < 1e-12);
  }
  for (const matrix of [
    [2, 0, 0, 1, 0, 0],
    [1, 0, 0.1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0],
  ] satisfies import("@informach/edi-motion").Affine[])
    assert.throws(() => conformalStrokeScale(matrix), /escala uniforme/);
});
test("inspection and compilation refuse anisotropy introduced only in a later sample, atomically", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    clip = fixture.project.motion.animations[0];
  assert.ok(board && clip);
  editScene(board.scene, fixture.shapeId, "attrs", {
    d: "M20 30C20 30 80 30 80 30C80 30 80 90 80 90C80 90 20 90 20 90C20 90 20 30 20 30Z",
    stroke: "red",
    "stroke-width": "8",
  });
  clip.tracks.push({
    id: "track-scale-x",
    targetId: fixture.shapeId,
    property: "sx",
    keys: [
      { id: "key-scale-a", frame: 0, value: 1, easing: "hold" },
      { id: "key-scale-b", frame: 30, value: 2, easing: "linear" },
    ],
  });
  const before = JSON.stringify(fixture.project),
    options = {
      artboardId: board.id,
      animationId: clip.id,
      confirmSampling: true,
      confirmRendererPrecision: true,
    },
    report = inspectLottieCompatibility(fixture.project, options);
  assert.equal(report.supported, false);
  assert.equal(report.issues[0]?.objectId, fixture.shapeId);
  assert.match(report.issues[0]?.message ?? "", /escala uniforme/);
  assert.throws(
    () => compileLottie(fixture.project, options),
    (error: unknown) =>
      error instanceof LottieExportError &&
      error.report.supported === false &&
      error.report.issues[0]?.objectId === fixture.shapeId,
  );
  assert.equal(JSON.stringify(fixture.project), before);
});
test("stroke-only cubic paths emit real geometry/animated widths; native lines remain explicitly refused", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    clip = fixture.project.motion.animations[0];
  assert.ok(board && clip);
  editScene(board.scene, fixture.shapeId, "attrs", {
    d: "M20 30C20 30 80 30 80 30C80 30 80 90 80 90C80 90 20 90 20 90C20 90 20 30 20 30Z",
    fill: "none",
    stroke: "rgba(0,0,255,0.5)",
    "stroke-width": "8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  for (const property of ["sx", "sy"] as const)
    clip.tracks.push({
      id: `track-${property}`,
      targetId: fixture.shapeId,
      property,
      keys: [
        { id: `key-${property}-a`, frame: 0, value: 1, easing: "linear" },
        { id: `key-${property}-b`, frame: 30, value: 2, easing: "linear" },
      ],
    });
  const options = {
    artboardId: board.id,
    animationId: clip.id,
    confirmSampling: true,
    confirmRendererPrecision: true,
  };
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, true);
  const output = compileLottie(fixture.project, options),
    shapes: ShapeElement[] = [];
  function collect(items: ShapeElement[]) {
    for (const item of items) {
      shapes.push(item);
      if (item.ty === "gr") collect(item.it);
    }
  }
  for (const layer of shapeLayers(output.document)) collect(layer.shapes);
  const stroke = shapes.find((item) => item.ty === "st");
  assert.ok(stroke && stroke.w.a === 0);
  assert.equal(stroke.w.k, 8);
  const transform = shapes.find((item) => item.ty === "tr" && item.s.a === 1);
  assert.ok(transform?.ty === "tr" && transform.s.a === 1);
  assert.deepEqual(transform.s.k[0]?.s, [100, 100]);
  assert.deepEqual(transform.s.k.at(-1)?.s, [200, 200]);
  assert.equal(stroke.o.k, (128 / 255) * 100);
  assert.equal(stroke.ml, 4);
  assert.equal(stroke.lc, 2);
  assert.equal(stroke.lj, 2);
  assert.ok(shapes.some((item) => item.ty === "sh"));
  assert.equal(
    shapes.some((item) => item.ty === "fl"),
    false,
  );
  const lineId = editScene(board.scene, null, "add", {
    tag: "line",
    attrs: { x1: "20", y1: "30", x2: "80", y2: "90", stroke: "black", "stroke-width": "4" },
  });
  assert.ok(lineId);
  assert.equal(inspectLottieCompatibility(fixture.project, options).supported, false);
  assert.throws(() => compileLottie(fixture.project, options), /cúbico explícito/);
});

test("stroke sampling unwraps many turns and bounds the whole inspection job without mutating its snapshot", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0],
    clip = fixture.project.motion.animations[0];
  assert.ok(board && clip);
  editScene(board.scene, fixture.shapeId, "attrs", {
    d: "M20 30C30 20 70 50 80 30",
    stroke: "red",
    "stroke-width": "8",
  });
  clip.tracks.push({
    id: "track-many-turns",
    targetId: fixture.shapeId,
    property: "rotation",
    keys: [
      { id: "key-turn-a", frame: 0, value: 0, easing: "linear" },
      { id: "key-turn-b", frame: 30, value: 3600, easing: "linear" },
    ],
  });
  const prepared = prepareLottie(fixture.project, { artboardId: board.id, animationId: clip.id }),
    before = JSON.stringify(prepared.project),
    angles: number[] = [];
  visitLottieSamples(prepared, { remaining: 2_000_000 }, ({ paintTransforms }) => {
    const transform = paintTransforms.get(fixture.shapeId);
    assert.ok(transform);
    angles.push(transform.rotation);
  });
  assert.ok(Math.abs((angles.at(-1) ?? NaN) - 3600) < 1e-8);
  for (const [index, angle] of angles.entries())
    if (index) assert.ok(Math.abs(angle - (angles[index - 1] ?? NaN)) <= 120.00000001);
  assert.throws(() => visitLottieSamples(prepared, { remaining: 1 }, () => {}), /orçamento/);
  assert.equal(JSON.stringify(prepared.project), before);
});

test("late fatal stroke diagnostics remain visible after bounded conversion warnings", () => {
  const fixture = lottieFixture(),
    board = fixture.project.artboards[0];
  assert.ok(board);
  for (let index = 0; index < 110; index++)
    editScene(board.scene, null, "add", {
      tag: "circle",
      attrs: { cx: "40", cy: "40", r: "5", fill: "red", stroke: "none" },
    });
  const invalid = editScene(board.scene, null, "add", {
    tag: "line",
    attrs: { x1: "0", y1: "0", x2: "10", y2: "10", stroke: "red" },
  });
  assert.ok(invalid);
  const report = inspectLottieCompatibility(fixture.project, {
    artboardId: board.id,
    animationId: fixture.clipId,
  });
  assert.equal(report.supported, false);
  assert.equal(report.issues[0]?.severity, "error");
  assert.equal(report.issues[0]?.objectId, invalid);
  assert.equal(report.issues.length, 100);
  assert.ok(report.omitted > 0);
});
