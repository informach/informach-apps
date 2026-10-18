import { expect, test } from "vitest";
import { identityTransform } from "./model";
import { evaluatePlayback, parsePlaybackDocument } from "./playback";
import {
  createPlaybackContext,
  evaluatePlaybackFrame,
  evaluatePlaybackStaticFrame,
} from "./playbackFrame";

const animation = {
  id: "animation-root",
  name: "Cena",
  fps: 30,
  frames: 60,
  mode: "loop",
  tracks: [],
};
const component = {
  id: "animation-component",
  name: "Componente",
  fps: 24,
  frames: 24,
  mode: "ping-pong",
  tracks: [
    {
      id: "track-component",
      targetId: "node-expanded",
      property: "x",
      keys: [
        { id: "key-start", frame: 0, value: 0, easing: "linear" },
        { id: "key-end", frame: 24, value: 100, easing: "linear" },
      ],
    },
  ],
};
function fixture() {
  return {
    version: 2,
    motion: { version: 1, animations: [animation] },
    objects: ["node-instance", "node-expanded"].map((id) => ({
      id,
      transform: identityTransform(),
    })),
    drivers: [{ id: "node-instance", animation: component, speed: 1, offsetSeconds: 0 }],
  };
}
test("sampled callers can share an evaluation budget across frames/drivers without mutating the document", () => {
  const document = parsePlaybackDocument(fixture()),
    before = structuredClone(document),
    context = createPlaybackContext(document),
    clip = document.motion.animations[0];
  if (!clip) throw new Error("Missing clip");
  const budget = { remaining: 100 },
    expected = evaluatePlaybackFrame(context, clip, 15);
  expect(evaluatePlaybackFrame(context, clip, 15, undefined, budget)).toEqual(expected);
  const cost = 100 - budget.remaining;
  expect(cost).toBeGreaterThan(document.objects.length);
  budget.remaining = cost;
  evaluatePlaybackFrame(context, clip, 30, undefined, budget);
  expect(budget.remaining).toBe(0);
  expect(() => evaluatePlaybackFrame(context, clip, 30, undefined, budget)).toThrow(/orçamento/);
  for (const remaining of [NaN, Infinity, -1, 2_000_001, 1.5])
    expect(() => evaluatePlaybackFrame(context, clip, 0, undefined, { remaining })).toThrow(
      /Orçamento/,
    );
  expect(() => evaluatePlaybackStaticFrame(context, undefined, { remaining: 0 })).toThrow(
    /orçamento/,
  );
  expect(document).toEqual(before);
});
test("v3 full spatial metadata without rigs remains parse-idempotent", () => {
  const source = fixture();
  const document = parsePlaybackDocument({
    ...source,
    version: 3,
    rigScopes: [],
    objects: source.objects.map((object) => ({ ...object, tag: "g", parentId: null })),
  });
  expect(document.version).toBe(3);
  expect(document.rigScopes).toEqual([]);
  expect(parsePlaybackDocument(document)).toEqual(document);
});
test("component clocks preserve FPS, loop modes and offsets using the same evaluator", () => {
  const document = parsePlaybackDocument(fixture()),
    root = document.motion.animations[0];
  if (!root) throw new Error("Missing root animation");
  expect(evaluatePlayback(root, 15, document.drivers).get("node-expanded")?.x).toBe(50);
  expect(evaluatePlayback(root, 45, document.drivers).get("node-expanded")?.x).toBe(50);
  const faster = parsePlaybackDocument({
    ...fixture(),
    drivers: [{ id: "node-instance", animation: component, speed: 2, offsetSeconds: 0.25 }],
  });
  expect(evaluatePlayback(root, 0, faster.drivers).get("node-expanded")?.x).toBe(25);
});
test("v1 runtime documents migrate and invalid/shared clocks are rejected", () => {
  expect(
    parsePlaybackDocument({
      version: 1,
      motion: { version: 1, animations: [animation] },
      objects: [],
    }).drivers,
  ).toEqual([]);
  const raw = fixture();
  expect(() =>
    parsePlaybackDocument({ ...raw, drivers: [...raw.drivers, ...raw.drivers] }),
  ).toThrow();
  expect(() =>
    parsePlaybackDocument({
      ...raw,
      drivers: [...raw.drivers, { ...raw.drivers[0], id: "node-expanded" }],
    }),
  ).toThrow(/dois relógios/);
  expect(() =>
    parsePlaybackDocument({ ...raw, motion: { version: 1, animations: [component] } }),
  ).toThrow(/dois donos/);
  expect(() =>
    parsePlaybackDocument({ ...raw, drivers: [{ ...raw.drivers[0], speed: Infinity }] }),
  ).toThrow();
  expect(raw.drivers).toHaveLength(1);
});
test("nested clocks are topologically ordered, follow parent phase and reject cycles", () => {
  const raw = fixture();
  const inner = {
    ...raw.drivers[0],
    id: "node-expanded",
    parentId: "node-instance",
    offsetSeconds: 0.25,
    animation: {
      ...component,
      tracks: component.tracks.map((track) => ({ ...track, targetId: "node-child" })),
    },
  };
  const parsed = parsePlaybackDocument({
    ...raw,
    objects: [...raw.objects, { id: "node-child", transform: identityTransform() }],
    drivers: [inner, ...raw.drivers],
  });
  const root = parsed.motion.animations[0];
  if (!root) throw new Error("Missing root");
  expect(parsed.drivers.map((driver) => driver.id)).toEqual(["node-instance", "node-expanded"]);
  expect(evaluatePlayback(root, 45, parsed.drivers).get("node-child")?.x).toBe(75);
  expect(() =>
    parsePlaybackDocument({
      ...raw,
      objects: [...raw.objects, { id: "node-child", transform: identityTransform() }],
      drivers: [inner, { ...raw.drivers[0], parentId: "node-expanded" }],
    }),
  ).toThrow(/cíclicos/);
});
test("clock depth and authoring identity validation are independent of input order", () => {
  const drivers = Array.from({ length: 9 }, (_, index) => ({
    id: `node-clock-${index}`,
    parentId: index ? `node-clock-${index - 1}` : null,
    animation: { ...animation, id: `animation-clock-${index}` },
    speed: 1,
    offsetSeconds: 0,
  }));
  const objects = drivers.map((driver) => ({ id: driver.id, transform: identityTransform() }));
  for (const chain of [drivers, [...drivers].reverse()])
    expect(() =>
      parsePlaybackDocument({
        version: 2,
        motion: { version: 1, animations: [animation] },
        objects,
        drivers: chain,
      }),
    ).toThrow(/profundos/);
  const raw = fixture(),
    source = {
      id: "node-instance",
      objectId: "node-source",
      artboardId: "artboard-master",
      instancePath: [],
    };
  expect(() =>
    parsePlaybackDocument({ ...raw, sources: [source, { ...source, id: "node-expanded" }] }),
  ).toThrow(/Identidade de origem/);
});
