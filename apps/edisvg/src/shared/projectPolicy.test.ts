import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeProject } from "./projectPolicy";

test("file and transaction serialization use a UTF-8 budget including pretty-print overhead", () => {
  assert.equal(serializeProject({ a: "á" }), '{\n  "a": "á"\n}');
  assert.throws(() => serializeProject({ value: "😀".repeat(2_000_000) }), /muito grande/);
});
test("serialization rejects repeated oversized content before constructing full JSON, and does not mistake shared values for cycles", () => {
  assert.throws(
    () =>
      serializeProject({
        boards: Array.from({ length: 100 }, () => ({ source: "x".repeat(100000) })),
      }),
    /grande/,
  );
  const shared = { value: "pequeno" };
  assert.equal(
    serializeProject({ a: shared, b: shared }),
    JSON.stringify({ a: shared, b: shared }, null, 2),
  );
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => serializeProject(cyclic), /circular/);
});
