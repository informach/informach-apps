import assert from "node:assert/strict";
import { test } from "node:test";
import { geometryBounds } from "@informach/edi-motion/geometry";
import type { Gradient } from "@informach/edi-motion/graphics";
import { parseSvgPath } from "@informach/edi-motion/svg-path";
import { prepareRelativeGradient } from "./relativeGradient";

const gradient: Gradient = {
  kind: "linear",
  units: "objectBoundingBox",
  spread: "pad",
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 1,
  stops: [
    { offset: 0, color: "#000000", opacity: 0.2 },
    { offset: 1, color: "#ffffff", opacity: 1 },
  ],
};
test("relative gradient follows actual cubic bounds rather than its control hull and owns its validated definition", () => {
  const source = structuredClone(gradient),
    prepared = prepareRelativeGradient(source, 80, 1),
    geometry = parseSvgPath("M0 0C0 100 100 100 100 0"),
    before = structuredClone(geometry),
    result = prepared.sample(geometry, { remaining: 2_000_000 });
  assert.deepEqual(result.start, [0, 0]);
  const [ex, ey] = result.end;
  assert.ok(Math.abs(ex / (ex * ex + ey * ey) - 1 / 200) < 1e-12);
  assert.ok(Math.abs(ey / (ex * ex + ey * ey) - 1 / 150) < 1e-12);
  assert.equal(result.opacity, 80);
  assert.deepEqual(geometry, before);
  assert.ok(source.stops[0]);
  source.stops[0].color = "#ff0000";
  assert.equal(prepared.style.g.k.k[1], 0);
});

test("relative gradients handle zero bounds without disabling other paint and refuse ambiguous disconnected moves", () => {
  const prepared = prepareRelativeGradient(gradient, 75, 1);
  assert.deepEqual(prepared.sample(parseSvgPath("M0 0L0 100"), { remaining: 2_000_000 }), {
    start: [0, 0],
    end: [0, 0],
    opacity: 0,
  });
  assert.equal(prepared.sample(parseSvgPath("M0 0L100 100"), { remaining: 2_000_000 }).opacity, 75);
  assert.throws(
    () => prepared.sample(parseSvgPath("M0 0L100 100 M-20 -30"), { remaining: 2_000_000 }),
    /subcaminho isolado.*revise.*HTML\/React/,
  );
  assert.throws(() => prepared.sample(parseSvgPath("M0 0L100 100"), { remaining: 0 }), /orçamento/);
  assert.deepEqual(
    geometryBounds(parseSvgPath("M0 0L100 100 M-20 -30"), { remaining: 2_000_000 }),
    { x: -20, y: -30, width: 120, height: 130 },
  );
});
