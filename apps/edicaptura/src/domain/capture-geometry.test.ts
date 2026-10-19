import assert from "node:assert/strict";
import { test } from "node:test";
import { composeCapture, planCapture, topologyKey } from "./capture-geometry.ts";

const displays = [
  { id: "left", bounds: { x: -2, y: 0, width: 2, height: 2 }, scaleFactor: 1, rotation: 0 },
  { id: "right", bounds: { x: 0, y: 0, width: 2, height: 2 }, scaleFactor: 2, rotation: 0 },
];
const sources = [
  { id: "left", width: 2, height: 2 },
  { id: "right", width: 4, height: 4 },
];
test("negative mixed-scale monitors map actual pixels to one explicit scale", () => {
  const plan = planCapture(displays, sources);
  assert.equal(plan.scale, 2);
  assert.deepEqual(plan.region, { x: -2, y: 0, width: 4, height: 2 });
  assert.deepEqual([plan.width, plan.height, plan.bytes], [8, 4, 208]);
  const result = composeCapture(plan, [
    { ...sources[0], id: "left", width: 2, height: 2, pixels: Buffer.alloc(16, 11) },
    { ...sources[1], id: "right", width: 4, height: 4, pixels: Buffer.alloc(64, 22) },
  ]);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 8; x++) assert.equal(result[(y * 8 + x) * 4], x < 4 ? 11 : 22);
});
test("crossing region clips sources and keeps actual monitor gaps transparent", () => {
  const topology = [displays[0], { ...displays[1], bounds: { x: 1, y: 0, width: 2, height: 2 } }];
  const plan = planCapture(topology, sources, { x: -1, y: 0, width: 3, height: 1 }, 1);
  const pixels = composeCapture(plan, [
    { id: "left", width: 2, height: 2, pixels: Buffer.alloc(16, 11) },
    { id: "right", width: 4, height: 4, pixels: Buffer.alloc(64, 22) },
  ]);
  assert.deepEqual([...pixels], [11, 11, 11, 11, 0, 0, 0, 0, 22, 22, 22, 22]);
});
test("identity, topology, actual aspect and aggregate budget fail closed", () => {
  assert.throws(() => planCapture(displays, sources.slice(1)), /fonte/i);
  assert.throws(() => planCapture(displays, [...sources, sources[0]]), /duplic/i);
  assert.throws(
    () => planCapture(displays, [{ id: "left", width: 100, height: 2 }, sources[1]]),
    /propor/i,
  );
  assert.throws(() => planCapture(displays, sources, undefined, 20_000), /limite|escala/i);
  assert.throws(
    () => planCapture(displays, sources, { x: 100, y: 0, width: 2, height: 2 }),
    /região/i,
  );
  assert.throws(() => planCapture(displays, sources, undefined, 2, 100), /memória/i);
  assert.equal(topologyKey(displays), topologyKey([...displays].reverse()));
  assert.notEqual(
    topologyKey(displays),
    topologyKey([{ ...displays[0], rotation: 90 }, displays[1]]),
  );
});
test("fractional output edges share a rounding function without seams", () => {
  const plan = planCapture(displays, sources, undefined, 1.25);
  assert.equal(plan.tiles[0]?.destination.width, plan.tiles[1]?.destination.x);
  const right = plan.tiles[1];
  assert(right);
  assert.equal(right.destination.x + right.destination.width, plan.width);
  assert.throws(() => composeCapture(plan, []), /fonte/i);
});
test("cross-monitor clipping samples distinct physical pixels on both axes", () => {
  const plan = planCapture(displays, sources, { x: -1, y: 0.5, width: 2, height: 1 }, 2);
  const left = Uint8Array.from([10, 20, 30, 40].flatMap((v) => [v, v, v, 255]));
  const right = Uint8Array.from(
    Array.from({ length: 16 }, (_, i) => [i + 1, i + 1, i + 1, 255]).flat(),
  );
  const pixels = composeCapture(plan, [
    { id: "left", width: 2, height: 2, pixels: left },
    { id: "right", width: 4, height: 4, pixels: right },
  ]);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => pixels[i * 4]),
    [20, 20, 5, 6, 40, 40, 9, 10],
  );
  assert.throws(
    () =>
      composeCapture(plan, [
        { id: "left", width: 2, height: 2, pixels: left },
        { id: "left", width: 2, height: 2, pixels: left },
      ]),
    /duplicada/,
  );
});
