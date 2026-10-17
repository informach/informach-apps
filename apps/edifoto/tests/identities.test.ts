import assert from "node:assert/strict";
import { test } from "node:test";
import { baseLayer, DEFAULT_GRADIENT, type Doc, identifyGradientStops } from "../src/shared/doc.ts";

test("legacy gradient stops receive durable unique IDs without no-op history changes", () => {
  const legacy: Doc = {
    version: 1,
    id: "review",
    name: "Review",
    width: 128,
    height: 128,
    background: "transparent",
    layers: [
      { ...baseLayer("Gradient"), kind: "gradient", gradient: structuredClone(DEFAULT_GRADIENT) },
    ],
  };
  const identified = identifyGradientStops(legacy);
  const gradient = identified.layers[0];
  assert.equal(gradient.kind, "gradient");
  if (gradient.kind !== "gradient") throw new Error("Missing gradient");
  assert.equal(
    new Set(gradient.gradient.stops.map((stop) => stop.id)).size,
    gradient.gradient.stops.length,
  );
  assert.ok(gradient.gradient.stops.every((stop) => stop.id));
  assert.equal(identifyGradientStops(identified), identified);
  const restored: Doc = JSON.parse(JSON.stringify(identified));
  assert.deepEqual(identifyGradientStops(restored), identified);
});
