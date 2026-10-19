import { describe, expect, it } from "vitest";
import {
  type Gradient,
  gradientAttributes,
  gradientDefinitions,
  gradientElement,
  gradientId,
  gradientSchema,
} from "./gradients";

const linear: Gradient = {
  kind: "linear",
  units: "objectBoundingBox",
  spread: "pad",
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 0,
  stops: [
    { offset: 0, color: "#ff0000", opacity: 1 },
    { offset: 1, color: "#0000ff", opacity: 1 },
  ],
};
describe("typed gradients", () => {
  it("canonicalizes identity by content, pools definitions and supports fill/stroke without arbitrary URLs", () => {
    const alternateOrder = {
      stops: linear.stops,
      x2: 1,
      y2: 0,
      x1: 0,
      y1: 0,
      spread: "pad",
      units: "objectBoundingBox",
      kind: "linear",
    };
    expect(gradientId(gradientSchema.parse(alternateOrder))).toBe(gradientId(linear));
    expect(
      gradientId({
        ...linear,
        stops: [
          { offset: 0, color: "#FF0000", opacity: 1 },
          { offset: 1, color: "#0000FF", opacity: 1 },
        ],
      }),
    ).toBe(gradientId(linear));
    expect(gradientId({ ...linear, spread: "repeat" })).not.toBe(gradientId(linear));
    expect(gradientDefinitions([{ fill: linear }, { fill: linear, stroke: linear }])).toHaveLength(
      1,
    );
    expect(gradientAttributes({ fill: linear }).fill).toMatch(
      /^url\(#edi-gradient-[a-f0-9]{64}\)$/,
    );
    expect(gradientElement(linear).children[0]?.attrs["stop-color"]).toBe("#ff0000");
    const radial = gradientSchema.parse({
      kind: "radial",
      units: "userSpaceOnUse",
      spread: "reflect",
      cx: 50,
      cy: 50,
      fx: 40,
      fy: 40,
      r: 30,
      stops: linear.stops,
    });
    expect(gradientElement(radial).tag).toBe("radialGradient");
  });
  it("rejects nonfinite/degenerate/singular/unsorted/oversized input and permits explicit hard stops", () => {
    for (const value of [
      { ...linear, x2: 0 },
      { ...linear, x2: Infinity },
      { ...linear, transform: [0, 0, 0, 0, 0, 0] },
      { ...linear, stops: [...linear.stops].reverse() },
      { ...linear, stops: Array.from({ length: 33 }, () => linear.stops[0]) },
      { ...linear, href: "https://unsafe.test" },
      {
        ...linear,
        stops: [{ offset: 0, color: "url(https://unsafe.test)", opacity: 1 }, linear.stops[1]],
      },
    ])
      expect(() => gradientSchema.parse(value)).toThrow();
    expect(
      gradientSchema.parse({
        ...linear,
        stops: [
          { offset: 0.5, color: "#ff0000", opacity: 1 },
          { offset: 0.5, color: "#0000ff", opacity: 1 },
        ],
      }).stops,
    ).toHaveLength(2);
    expect(() =>
      gradientDefinitions(
        Array.from({ length: 257 }, (_, index) => ({ fill: { ...linear, x2: index + 1 } })),
      ),
    ).toThrow(/256/);
    const oversized = new Array(1000000);
    Object.defineProperty(oversized, "0", {
      get() {
        throw new Error("Stop validation ran before the length budget");
      },
    });
    expect(() => gradientSchema.parse({ ...linear, stops: oversized })).toThrow(/2–32 paradas/);
  });
});
