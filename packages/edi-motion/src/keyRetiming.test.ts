import { expect, test } from "vitest";
import { retimeKeyframes } from "./keyRetiming";
import type { Track } from "./model";

const keys: Track["keys"] = [0, 10, 20].map((frame) => ({
  id: `key-${frame}`,
  frame,
  value: frame,
  easing: { kind: "cubic-bezier", points: [0.42, 0, 0.58, 1] },
}));
test("shared retiming preserves identity/value/easing and owns all returned records", () => {
  const before = structuredClone(keys),
    result = retimeKeyframes(
      keys,
      new Set(["key-10", "key-20"]),
      100,
      { deltaFrames: 1, scale: 0.5, anchorFrame: 0 },
      false,
    );
  expect(result.map((key) => key.frame)).toEqual([0, 6, 11]);
  expect(result.map((key) => key.id)).toEqual(keys.map((key) => key.id));
  expect(keys).toEqual(before);
  for (const [index, key] of result.entries()) {
    expect(key).not.toBe(keys[index]);
    expect(key.easing).not.toBe(keys[index]?.easing);
  }
});
test("shared copying renews IDs, preserves originals and refuses collisions/range/limits without mutation", () => {
  const before = structuredClone(keys),
    result = retimeKeyframes(
      keys,
      new Set(["key-10"]),
      100,
      { deltaFrames: 30, scale: 1, anchorFrame: 0 },
      true,
    );
  expect(result.map((key) => key.frame)).toEqual([0, 10, 20, 40]);
  expect(result[3]?.id).not.toBe("key-10");
  const cases: readonly (readonly [number, number])[] = [
    [10, 1],
    [-20, 1],
    [0, 0],
    [Number.NaN, 1],
  ];
  for (const [deltaFrames, scale] of cases)
    expect(() =>
      retimeKeyframes(
        keys,
        new Set(["key-10"]),
        100,
        { deltaFrames, scale, anchorFrame: 0 },
        false,
      ),
    ).toThrow();
  expect(() =>
    retimeKeyframes(
      keys,
      new Set(["key-10"]),
      100,
      { deltaFrames: 0, scale: 1, anchorFrame: 0 },
      true,
    ),
  ).toThrow(/colisão/);
  const full: Track["keys"] = Array.from({ length: 10000 }, (_, index) => ({
    id: `key-${index}`,
    frame: index,
    value: 0,
    easing: "hold",
  }));
  expect(() =>
    retimeKeyframes(
      full,
      new Set(["key-0"]),
      20000,
      { deltaFrames: 10000, scale: 1, anchorFrame: 0 },
      true,
    ),
  ).toThrow(/Orçamento/);
  expect(keys).toEqual(before);
});
