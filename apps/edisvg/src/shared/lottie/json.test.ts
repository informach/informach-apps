import assert from "node:assert/strict";
import { test } from "node:test";
import { stringifyLottieJson } from "./json";

test("Lottie JSON checks exact escaped UTF-8 bytes including supplementary and unpaired surrogates before joining", () => {
  for (const value of [
    { name: 'ação 𝒜 "\\\n\u0001' },
    ["é", "中", "😀", "\ud800", "\udfff", -0, 1e30, true, null],
    {
      nested: {
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
    },
  ]) {
    const expected = JSON.stringify(value),
      size = new TextEncoder().encode(expected).length;
    assert.equal(stringifyLottieJson(value, size), expected);
    assert.throws(() => stringifyLottieJson(value, size - 1), /bytes/);
  }
});
test("Lottie JSON refuses cycles, getters, prototypes and silent JSON omissions without invoking authored code", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  let invoked = false;
  const getter = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      invoked = true;
      return 1;
    },
  });
  for (const value of [
    cyclic,
    getter,
    new Date(),
    { value: undefined },
    [undefined],
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: () => 1 },
    { [Symbol("x")]: 1 },
  ])
    assert.throws(() => stringifyLottieJson(value));
  assert.equal(invoked, false);
  const array = [1];
  Object.defineProperty(array, "0", {
    get() {
      invoked = true;
      return 1;
    },
  });
  assert.throws(() => stringifyLottieJson(array), /getters/);
  assert.equal(invoked, false);
  assert.throws(() => stringifyLottieJson(new Array(2)), /perfil|lacunas/);
});
test("Lottie JSON rejects excessive structure/bytes without creating an oversized final string", () => {
  assert.throws(() => stringifyLottieJson("\u0001".repeat(100000), 1000), /bytes/);
  let deep: unknown = 0;
  for (let index = 0; index < 130; index++) deep = [deep];
  assert.throws(() => stringifyLottieJson(deep), /estrutural/);
  assert.throws(
    () =>
      stringifyLottieJson(
        Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`key-${index}`, 0])),
      ),
    /perfil/,
  );
});
