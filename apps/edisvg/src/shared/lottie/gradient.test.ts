import assert from "node:assert/strict";
import { test } from "node:test";
import { type Affine, inverse, transformPoint } from "@informach/edi-motion";
import type { Gradient } from "@informach/edi-motion/graphics";
import { prepareLottieGradient } from "./gradient";

const linear: Extract<Gradient, { kind: "linear" }> = {
  kind: "linear",
  units: "userSpaceOnUse",
  spread: "pad",
  x1: 10,
  y1: 20,
  x2: 90,
  y2: 30,
  stops: [
    { offset: 0, color: "#102030", opacity: 0.2 },
    { offset: 0.5, color: "#406080", opacity: 0.7 },
    { offset: 1, color: "#f0e0d0", opacity: 1 },
  ],
};

test("linear gradient affine conversion preserves its scalar field, not merely transformed endpoints", () => {
  const matrices: Affine[] = [
    [1, 0, 0, 1, 0, 0],
    [2, 0.25, 1, 3, 5, -7],
    [-2, 0.2, 0.8, 0.4, 80, 2],
    [0, 2, -2, 0, 5, 10],
    [0.0001, 0, 0.0002, 0.0003, 0, 0],
  ];
  for (const transform of matrices) {
    const source = { ...structuredClone(linear), transform },
      before = JSON.stringify(source),
      output = prepareLottieGradient(source, 65, 2),
      undo = inverse(transform),
      [sx, sy] = output.s.k,
      [ex, ey] = output.e.k,
      vx = ex - sx,
      vy = ey - sy;
    for (let x = -100; x <= 200; x += 25)
      for (let y = -50; y <= 100; y += 25) {
        const local = transformPoint(undo, x, y),
          reference =
            ((local.x - linear.x1) * 80 + (local.y - linear.y1) * 10) / (80 * 80 + 10 * 10),
          actual = ((x - sx) * vx + (y - sy) * vy) / (vx * vx + vy * vy);
        assert.ok(
          Math.abs(actual - reference) <= 1e-10 * Math.max(1, Math.abs(reference)),
          `${actual} != ${reference}`,
        );
      }
    assert.equal(JSON.stringify(source), before);
    assert.equal(output.o.k, 65);
    assert.equal(output.r, 2);
    output.g.k.k[0] = 0.25;
    assert.equal(source.stops[0]?.offset, 0);
  }
});

test("gradient stops retain separate RGB and alpha arrays, duplicate offsets and source ownership", () => {
  const source = {
      ...structuredClone(linear),
      stops: [...linear.stops, { offset: 1, color: "#000000", opacity: 0 }],
    },
    before = JSON.stringify(source),
    output = prepareLottieGradient(source, 100, 1);
  assert.equal(output.g.p, 4);
  assert.deepEqual(output.g.k.k, [
    0,
    16 / 255,
    32 / 255,
    48 / 255,
    0.5,
    64 / 255,
    96 / 255,
    128 / 255,
    1,
    240 / 255,
    224 / 255,
    208 / 255,
    1,
    0,
    0,
    0,
    0,
    0.2,
    0.5,
    0.7,
    1,
    1,
    1,
    0,
  ]);
  assert.equal(JSON.stringify(source), before);
});

test("radial conformal transforms preserve the actual circle and internal focus under reflection/rotation", () => {
  const source: Gradient = {
      kind: "radial",
      units: "userSpaceOnUse",
      spread: "pad",
      cx: 10,
      cy: 20,
      r: 40,
      fx: 20,
      fy: 25,
      transform: [0, -2, -2, 0, 100, 30],
      stops: linear.stops,
    },
    output = prepareLottieGradient(source, 80, 1),
    center = transformPoint(source.transform ?? [1, 0, 0, 1, 0, 0], 10, 20),
    focal = transformPoint(source.transform ?? [1, 0, 0, 1, 0, 0], 20, 25),
    radius = Math.hypot(output.e.k[0] - output.s.k[0], output.e.k[1] - output.s.k[1]),
    angle = (output.a.k * Math.PI) / 180;
  assert.deepEqual(output.s.k, [center.x, center.y]);
  assert.equal(radius, 80);
  assert.ok(
    Math.abs(output.s.k[0] + (Math.cos(angle) * radius * output.h.k) / 100 - focal.x) < 1e-12,
  );
  assert.ok(
    Math.abs(output.s.k[1] + (Math.sin(angle) * radius * output.h.k) / 100 - focal.y) < 1e-12,
  );
});

test("gradient profile refuses lossy units/spreads/offsets, radial distortion/focus and float32 collapse", () => {
  const radial: Gradient = {
    kind: "radial",
    units: "userSpaceOnUse",
    spread: "pad",
    cx: 0,
    cy: 0,
    r: 10,
    fx: 0,
    fy: 0,
    stops: linear.stops,
  };
  const unsupported: Gradient[] = [
    { ...linear, units: "objectBoundingBox" },
    { ...linear, spread: "repeat" },
    { ...linear, spread: "reflect" },
    {
      ...linear,
      stops: [
        { offset: 0.333, color: "#000000", opacity: 1 },
        { offset: 1, color: "#ffffff", opacity: 1 },
      ],
    },
    { ...radial, transform: [2, 0, 0, 1, 0, 0] },
    { ...radial, fx: 10 },
    { ...linear, x1: 99999, y1: 0, x2: 99999.000001, y2: 0 },
  ];
  for (const source of unsupported) assert.throws(() => prepareLottieGradient(source, 100, 1));
  assert.throws(() => prepareLottieGradient(linear, Number.NaN, 1));
});
