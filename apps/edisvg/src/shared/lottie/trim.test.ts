import assert from "node:assert/strict";
import { test } from "node:test";
import { trimFixture } from "../../../tests/trimFixture";
import { compileLottie } from "./compile";
import { shapeLayers } from "./model";
import { inspectLottieCompatibility } from "./prepare";

const options = (fixture: ReturnType<typeof trimFixture>) => ({
  artboardId: fixture.boardId,
  animationId: fixture.animationId,
  alt: "Trim",
  confirmSampling: true,
  confirmRendererPrecision: true,
});
function shapes(items: unknown[]): { ks: { a: number; k: unknown } }[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as { ty?: string; it?: unknown[]; ks?: { a: number; k: unknown } };
    if (value.ty === "gr" && value.it) return shapes(value.it);
    return value.ty === "sh" && value.ks ? [{ ks: value.ks }] : [];
  });
}

test("trimmed Lottie paths use hold keys with a constant vertex count per slot", () => {
  const fixture = trimFixture(),
    exported = compileLottie(fixture.project(), options(fixture)),
    slots = shapes(shapeLayers(exported.document)[0]?.shapes ?? []);
  assert.equal(slots.length, 2);
  const sizes = new Set<number | undefined>();
  for (const slot of slots) {
    if (slot.ks.a === 0) {
      // A slot that never receives a piece stays a static, zero-length placeholder.
      sizes.add((slot.ks.k as { v: unknown[] }).v.length);
      continue;
    }
    const keys = slot.ks.k as { h?: number; s: { v: unknown[] }[] }[];
    assert.ok(keys.every((key) => key.h === 1));
    for (const key of keys) sizes.add(key.s[0]?.v.length);
  }
  assert.equal(slots[0]?.ks.a, 1);
  assert.equal(sizes.size, 1);
});

test("Lottie refuses trim on closed contours instead of changing their closure", () => {
  const fixture = trimFixture();
  fixture.run([
    {
      type: "scene",
      operation: "attrs",
      targetId: fixture.shapeId,
      value: { d: "M20 80C20 20 220 20 220 80C220 140 20 140 20 80Z" },
    },
  ]);
  const report = inspectLottieCompatibility(fixture.project(), options(fixture));
  assert.equal(report.supported, false);
  assert.ok(report.issues.some((issue) => /caminhos abertos/.test(issue.message)));
});

test("round-capped trim exports even while the path is scaled almost to nothing", () => {
  const fixture = trimFixture();
  fixture.run([
    {
      type: "scene",
      operation: "attrs",
      targetId: fixture.shapeId,
      value: { "stroke-linecap": "round" },
    },
    ...(["sx", "sy"] as const).flatMap((property) =>
      [
        [0, 0.02],
        [10, 1],
      ].map(([frame, value]) => ({
        type: "motion",
        command: {
          type: "set-key",
          animationId: fixture.animationId,
          targetId: fixture.shapeId,
          property,
          frame,
          value,
        },
      })),
    ),
  ]);
  const exported = compileLottie(fixture.project(), options(fixture));
  assert.ok(shapes(shapeLayers(exported.document)[0]?.shapes ?? []).length >= 2);
});
