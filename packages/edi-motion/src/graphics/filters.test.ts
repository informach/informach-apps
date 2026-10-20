import { describe, expect, it } from "vitest";
import {
  type Filter,
  filterAttributes,
  filterDefinitions,
  filterElement,
  filterId,
  filterSchema,
} from "./filters";

const glow: Filter = {
  units: "objectBoundingBox",
  primitiveUnits: "userSpaceOnUse",
  x: -0.5,
  y: -0.5,
  width: 2,
  height: 2,
  colorInterpolation: "sRGB",
  primitives: [
    { kind: "blur", in: "SourceAlpha", stdDeviation: [4, 2], edgeMode: "none" },
    { kind: "flood", color: "#4FE3C1", opacity: 0.8 },
    { kind: "composite", in: 1, in2: 0, operator: "in" },
    { kind: "merge", inputs: [2, "SourceGraphic"] },
  ],
};

describe("typed filters", () => {
  it("writes an ordered primitive chain with explicit inputs and results", () => {
    const element = filterElement(glow);
    expect(element.attrs).toEqual({
      id: filterId(glow),
      filterUnits: "objectBoundingBox",
      primitiveUnits: "userSpaceOnUse",
      x: "-0.5",
      y: "-0.5",
      width: "2",
      height: "2",
      "color-interpolation-filters": "sRGB",
    });
    expect(
      element.children.map((child) => [child.tag, child.attrs.in ?? null, child.attrs.result]),
    ).toEqual([
      ["feGaussianBlur", "SourceAlpha", "edi-r0"],
      ["feFlood", null, "edi-r1"],
      ["feComposite", "edi-r1", "edi-r2"],
      ["feMerge", null, "edi-r3"],
    ]);
    expect(element.children[1]?.attrs["flood-color"]).toBe("#4fe3c1");
    expect(element.children[3]?.children.map((node) => node.attrs.in)).toEqual([
      "edi-r2",
      "SourceGraphic",
    ]);
    expect(filterAttributes(glow)).toEqual({ filter: `url(#${filterId(glow)})` });
    expect(filterAttributes(undefined)).toEqual({});
    const matrix = filterElement({
      ...glow,
      primitives: [
        { kind: "colorMatrix", in: "SourceGraphic", type: "luminanceToAlpha", values: [] },
      ],
    }).children[0];
    expect(matrix?.attrs.values).toBeUndefined();
  });

  it("refuses forward references, background inputs and out-of-profile values", () => {
    const blur = glow.primitives[0];
    if (!blur) throw new Error("Missing fixture primitive");
    for (const value of [
      { ...glow, primitives: [] },
      { ...glow, primitives: [{ kind: "offset", in: 0, dx: 1, dy: 1 }] },
      { ...glow, primitives: [blur, { kind: "merge", inputs: [1] }] },
      { ...glow, primitives: [{ ...blur, in: "BackgroundImage" }] },
      { ...glow, primitives: [{ ...blur, stdDeviation: [201, 1] }] },
      {
        ...glow,
        primitives: [{ kind: "colorMatrix", in: "SourceGraphic", type: "matrix", values: [1, 0] }],
      },
      {
        ...glow,
        primitives: [{ kind: "colorMatrix", in: "SourceGraphic", type: "saturate", values: [101] }],
      },
      {
        ...glow,
        primitives: [
          { kind: "composite", in: "SourceGraphic", in2: "SourceAlpha", operator: "arithmetic" },
        ],
      },
      {
        ...glow,
        primitives: [
          {
            kind: "composite",
            in: "SourceGraphic",
            in2: "SourceAlpha",
            operator: "over",
            k: [1, 0, 0, 0],
          },
        ],
      },
      { ...glow, primitives: [{ kind: "turbulence" }] },
      { ...glow, width: 0 },
      { ...glow, colorInterpolation: "auto" },
      { ...glow, primitives: Array.from({ length: 17 }, () => blur) },
    ])
      expect(() => filterSchema.parse(value)).toThrow();
  });

  it("pools identical filters and bounds the distinct ones", () => {
    expect(filterDefinitions([glow, { ...glow }, undefined])).toHaveLength(1);
    expect(() =>
      filterDefinitions(Array.from({ length: 65 }, (_, index) => ({ ...glow, width: index + 1 }))),
    ).toThrow(/64 filtros/);
  });
});
