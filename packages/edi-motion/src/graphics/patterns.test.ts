import { describe, expect, it } from "vitest";
import {
  type Gradient,
  gradientAttributes,
  gradientDefinitions,
  gradientPaintsSchema,
  hasPattern,
  paintServerId,
} from "./gradients";
import { type Pattern, patternElement, patternId, patternSchema } from "./patterns";

const stripe: Pattern = {
  kind: "pattern",
  units: "userSpaceOnUse",
  contentUnits: "userSpaceOnUse",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  transform: [0.8, 0.6, -0.6, 0.8, 0, 0],
  shapes: [
    {
      d: "M0 0H5V10H0Z",
      fill: "#E33A60",
      fillOpacity: 1,
      fillRule: "nonzero",
      stroke: "none",
      strokeOpacity: 1,
      strokeWidth: 0,
      strokeLinecap: "butt",
      strokeLinejoin: "miter",
      opacity: 1,
    },
  ],
};
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

describe("typed patterns", () => {
  it("normalises colours, derives identity from content and writes a static tile", () => {
    const parsed = patternSchema.parse(stripe);
    expect(parsed.shapes[0]?.fill).toBe("#e33a60");
    expect(patternId(stripe)).toBe(patternId(parsed));
    expect(patternId(stripe)).toMatch(/^edi-pattern-[\da-f]{64}$/);
    expect(patternId({ ...stripe, width: 11 })).not.toBe(patternId(stripe));
    const element = patternElement(stripe);
    expect(element).toEqual({
      tag: "pattern",
      attrs: {
        id: patternId(stripe),
        patternUnits: "userSpaceOnUse",
        patternContentUnits: "userSpaceOnUse",
        x: "0",
        y: "0",
        width: "10",
        height: "10",
        patternTransform: "matrix(0.8 0.6 -0.6 0.8 0 0)",
      },
      children: [
        {
          tag: "path",
          attrs: {
            d: "M0 0H5V10H0Z",
            fill: "#e33a60",
            "fill-opacity": "1",
            "fill-rule": "nonzero",
            stroke: "none",
            "stroke-opacity": "1",
            "stroke-width": "0",
            "stroke-linecap": "butt",
            "stroke-linejoin": "miter",
            opacity: "1",
          },
          children: [],
        },
      ],
    });
  });

  it("refuses tiles that cannot render the same everywhere", () => {
    const shape = stripe.shapes[0];
    if (!shape) throw new Error("Missing fixture shape");
    for (const value of [
      { ...stripe, width: 0 },
      { ...stripe, transform: [1, 2, 2, 4, 0, 0] },
      { ...stripe, preserveAspectRatio: "xMidYMid meet" },
      { ...stripe, viewBox: [0, 0, 1, 1], contentUnits: "objectBoundingBox" },
      { ...stripe, shapes: [] },
      { ...stripe, shapes: Array.from({ length: 65 }, () => shape) },
      { ...stripe, shapes: [{ ...shape, fill: "url(#other)" }] },
      { ...stripe, shapes: [{ ...shape, fill: "none", stroke: "none" }] },
      { ...stripe, shapes: [{ ...shape, d: "M0 0 Q" }] },
      { ...stripe, shapes: [{ ...shape, d: `M0 0${" L1 1".repeat(4001)}` }] },
      { ...stripe, shapes: [{ ...shape, href: "#x" }] },
      { ...stripe, script: "x" },
    ])
      expect(() => patternSchema.parse(value)).toThrow();
  });

  it("shares the paint channel and the 256-server pool with gradients", () => {
    const paints = gradientPaintsSchema.parse({ fill: stripe, stroke: linear });
    expect(hasPattern(paints)).toBe(true);
    expect(hasPattern({ fill: linear })).toBe(false);
    expect(gradientAttributes(paints)).toEqual({
      fill: `url(#${patternId(stripe)})`,
      stroke: `url(#${paintServerId(linear)})`,
    });
    const definitions = gradientDefinitions([paints, { fill: stripe }]);
    expect(definitions.map((element) => element.tag).sort()).toEqual(["linearGradient", "pattern"]);
    expect(() =>
      gradientDefinitions(
        Array.from({ length: 257 }, (_, index) => ({ fill: { ...stripe, width: index + 1 } })),
      ),
    ).toThrow(/256 gradientes\/padrões/);
    const base = stripe.shapes[0];
    if (!base) throw new Error("Missing fixture shape");
    const dense: Pattern = { ...stripe, shapes: [{ ...base, d: `M0 0${" L1 1".repeat(3999)}` }] };
    expect(() =>
      gradientDefinitions(
        Array.from({ length: 26 }, (_, index) => ({ fill: { ...dense, width: index + 1 } })),
      ),
    ).toThrow(/100000 vértices/);
    expect(gradientDefinitions(Array.from({ length: 40 }, () => ({ fill: dense })))).toHaveLength(
      1,
    );
  });
});
