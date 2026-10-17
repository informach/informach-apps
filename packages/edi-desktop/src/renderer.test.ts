import { describe, expect, it } from "vitest";
import { withRenderKeys } from "./renderer";

describe("derived fragment identities", () => {
  it("preserves identities across unrelated insertion/reorder and distinguishes duplicate text", () => {
    const first = withRenderKeys(["first", "same", "same", "last"], (value) => value);
    const updated = withRenderKeys(["new", "last", "same", "same", "first"], (value) => value);
    expect(new Set(first.map((item) => item.key)).size).toBe(4);
    for (const item of first) expect(updated).toContainEqual(item);
  });
});
