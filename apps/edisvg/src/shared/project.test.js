import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProject, validateTransform } from "./project.js";

const valid = {
  version: 1,
  name: "Zezé",
  animation: "Acenar",
  keys: [0, 72],
  transforms: { x: 4 },
};
test("project round trip supplies defaults and rejects unsafe values", () => {
  assert.equal(parseProject(valid).transforms.opacity, 100);
  assert.throws(() => validateTransform({ x: Infinity }));
  assert.throws(() => validateTransform({ opacity: 101 }));
  assert.throws(() => parseProject({ ...valid, keys: [90] }));
  assert.throws(() => parseProject({ ...valid, version: 9 }));
  assert.throws(() => validateTransform({ __invalid: 4 }));
});
test("projects retain playback modes and inputs and accept older files", () => {
  const project = parseProject({
    ...valid,
    modes: { Acenar: "once" },
    inputs: { humor: 0.9, acenando: true },
  });
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  assert.equal(project.modes.Acenar, "once");
  assert.equal(project.inputs.humor, 0.9);
  assert.equal(parseProject(valid).modes.Pular, "once");
  assert.throws(() => parseProject({ ...valid, modes: { Acenar: "bad" } }));
  assert.throws(() => parseProject({ ...valid, inputs: { humor: NaN } }));
});
test("markers survive switching animations and round trips", () => {
  const a = parseProject({ ...valid, keys: [0, 7, 72] });
  const b = parseProject({ ...a, animation: "Pular", keys: [0, 13, 48] });
  const back = parseProject({ ...b, animation: "Acenar", keys: b.keysByAnimation.Acenar });
  assert.deepEqual(back.keys, [0, 7, 72]);
  assert.deepEqual(back.keysByAnimation.Pular, [0, 13, 48]);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(back))), back);
  assert.throws(() => parseProject({ ...valid, keysByAnimation: { Pular: [100] } }));
});
