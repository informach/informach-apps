import { describe, expect, it } from "vitest";
import { identityMatrix, multiply, transformMatrix, transformPoint } from "../affine";
import type { Geometry } from "../geometry";
import { identityTransform } from "../model";
import {
  createVectorEffectContext,
  type EffectObject,
  evaluateVectorEffects,
  remapVectorEffects,
  vectorEffectAttributes,
  vectorEffectElement,
  vectorEffectsSchema,
} from "./vectorEffects";

const square: Geometry = [
  {
    closed: true,
    points: [
      { x: 0, y: 0, in: null, out: null },
      { x: 20, y: 0, in: null, out: null },
      { x: 20, y: 20, in: null, out: null },
      { x: 0, y: 20, in: null, out: null },
    ],
  },
];
function fixture() {
  return new Map<string, EffectObject>([
    [
      "node-group",
      { tag: "g", parentId: null, transform: { ...identityTransform(), x: 100, rotation: 20 } },
    ],
    [
      "node-source",
      {
        tag: "path",
        parentId: "node-group",
        transform: { ...identityTransform(), x: 30, y: 20, opacity: 40 },
        geometry: square,
      },
    ],
    [
      "node-target",
      {
        tag: "rect",
        parentId: "node-group",
        transform: { ...identityTransform(), x: 10, y: 5 },
        effects: {
          clip: { sourceId: "node-source", rule: "evenodd" },
          mask: { sourceId: "node-source", rule: "nonzero", opacity: 0.5 },
        },
      },
    ],
  ]);
}
describe("typed live clipping and alpha silhouette masks", () => {
  it("accepts an explicitly empty transient path, restores the next frame and still refuses empty authored sources", () => {
    const input = fixture(),
      before = structuredClone(input),
      context = createVectorEffectContext(input),
      empty = evaluateVectorEffects(context, new Map(), new Map([["node-source", []]]));
    expect(empty).toHaveLength(2);
    for (const effect of empty) {
      expect(effect.d).toBe("");
      expect(effect.opacity).toBe(0);
      expect(effect.region).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    }
    const restored = evaluateVectorEffects(context, new Map());
    expect(restored[0]?.d).not.toBe("");
    expect(restored[1]?.opacity).toBe(0.2);
    expect(input).toEqual(before);
    expect(() =>
      evaluateVectorEffects(context, new Map(), new Map([["node-source", []]]), undefined, {
        remaining: 1000,
      }),
    ).toThrow(/orçamento/);
    const source = input.get("node-source");
    if (!source) throw new Error("Missing authored source");
    source.geometry = [];
    expect(() => createVectorEffectContext(input)).toThrow();
  });
  it("does not reuse a collapsed path's cheap cost for a later expanded target", () => {
    const input = fixture(),
      source = input.get("node-source"),
      first = input.get("node-target");
    if (!source || !first) throw new Error("Missing source/target");
    source.geometry = [
      {
        closed: true,
        points: Array.from({ length: 300 }, (_, index) => ({
          x: index / 3,
          y: Math.sin(index),
          in: null,
          out: null,
        })),
      },
    ];
    first.effects = { clip: { sourceId: "node-source", rule: "nonzero" } };
    first.transform = { ...identityTransform(), sx: 0 };
    input.set("node-expanded", {
      tag: "rect",
      parentId: "node-group",
      transform: identityTransform(),
      effects: { clip: { sourceId: "node-source", rule: "nonzero" } },
    });
    const context = createVectorEffectContext(input);
    expect(() =>
      evaluateVectorEffects(context, new Map(), new Map(), undefined, {
        remaining: 4000,
      }),
    ).toThrow(/expansão\/bytes/);
  });
  it("bounds expanded definition bytes for repeated large sources before SVG/hash/DOM expansion", () => {
    const input = fixture(),
      source = input.get("node-source");
    if (!source) throw new Error("Missing source");
    source.tag = "polygon";
    delete source.geometry;
    source.nativeShape = {
      kind: "polygon",
      points: Array.from({ length: 4000 }, (_, index): [number, number] => [
        index / 3,
        Math.sin(index),
      ]),
    };
    input.delete("node-target");
    for (let index = 0; index < 200; index++)
      input.set(`node-copy-${index}`, {
        tag: "rect",
        parentId: "node-group",
        transform: identityTransform(),
        effects: { clip: { sourceId: "node-source", rule: "nonzero" } },
      });
    const before = structuredClone(input),
      context = createVectorEffectContext(input);
    expect(() => evaluateVectorEffects(context, new Map())).toThrow(/expansão\/bytes/);
    expect(input).toEqual(before);
  });
  it("preserves native source primitives, immutable frame ownership and collapsed targets without changing input", () => {
    const input = fixture(),
      source = input.get("node-source");
    if (!source) throw new Error("Missing source");
    source.tag = "circle";
    delete source.geometry;
    source.nativeShape = { kind: "circle", cx: 10, cy: 20, r: 25 };
    const before = structuredClone(input),
      context = createVectorEffectContext(input),
      frames = evaluateVectorEffects(context, new Map());
    const first = frames[0];
    if (!first) throw new Error("Missing native effect frame");
    expect(vectorEffectElement(first).children[0]).toMatchObject({
      tag: "circle",
      attrs: { cx: "10", cy: "20", r: "25", stroke: "none" },
    });
    const native = frames[0]?.nativeShape;
    if (!native) throw new Error("Missing native shape");
    expect(() => Object.defineProperty(native, "r", { value: 1 })).toThrow();
    const collapsed = evaluateVectorEffects(
      context,
      new Map([["node-target", { ...identityTransform(), sx: 0 }]]),
    );
    expect(collapsed[0]?.d).toBe("");
    const collapsedFrame = collapsed[0];
    if (!collapsedFrame) throw new Error("Missing collapsed frame");
    expect(vectorEffectElement(collapsedFrame).children[0]?.tag).toBe("circle");
    expect(() =>
      evaluateVectorEffects(context, new Map(), new Map([["node-source", square]])),
    ).toThrow(/converta explicitamente/);
    expect(input).toEqual(before);
  });
  it("shares ancestor transforms, resolves target-local geometry and emits safe definitions", () => {
    const objects = fixture(),
      context = createVectorEffectContext(objects),
      frames = evaluateVectorEffects(context, new Map());
    expect(frames).toHaveLength(2);
    const clip = frames[0],
      mask = frames[1];
    if (!clip || !mask) throw new Error("Missing prepared frames");
    const point = transformPoint(clip.matrix, 0, 0);
    expect(point.x).toBeCloseTo(20, 10);
    expect(point.y).toBeCloseTo(15, 10);
    expect(mask.opacity).toBeCloseTo(0.2, 10);
    expect(clip.opacity).toBe(1);
    expect(vectorEffectElement(clip).tag).toBe("clipPath");
    expect(vectorEffectElement(mask).attrs["mask-type"]).toBe("alpha");
    expect(vectorEffectElement(mask).children[0]?.attrs.fill).toBe("#ffffff");
    const attrs = vectorEffectAttributes(frames).get("node-target");
    expect(attrs?.["clip-path"]).toMatch(/^url\(#edi-effect-[a-f0-9]{64}\)$/);
    expect(attrs?.mask).not.toBe(attrs?.["clip-path"]);
    expect(
      remapVectorEffects(
        { clip: { sourceId: "node-source", rule: "evenodd" } },
        (id) => `${id}-copy`,
      ).clip?.sourceId,
    ).toBe("node-source-copy");
    expect(objects.get("node-source")?.transform.x).toBe(30);
  });
  it("follows animated bases, layout prefixes, signed scale/pivot/skew and deformed curves without mutating the document", () => {
    const objects = fixture(),
      source = objects.get("node-source"),
      target = objects.get("node-target");
    if (!source || !target) throw new Error("Missing source/target");
    target.basis = [1, 0.2, 0.1, 1, 6, 7];
    source.attributeMatrix = [1, 0, 0, 1, 3, 4];
    const context = createVectorEffectContext(objects),
      pose = { ...source.transform, x: 70, sx: -2, sy: 3, px: 10, py: 4, skewX: 15 },
      deformation: Geometry = [
        {
          closed: false,
          points: [
            { x: 0, y: 0, in: null, out: { x: -100, y: -200 } },
            { x: 20, y: 20, in: { x: 100, y: 200 }, out: null },
          ],
        },
      ],
      prefix = [1, 0, 0, 1, 11, 12] satisfies import("../affine").Affine,
      frames = evaluateVectorEffects(
        context,
        new Map([["node-source", pose]]),
        new Map([["node-source", deformation]]),
        new Map([["node-source", prefix]]),
      ),
      frame = frames[0];
    if (!frame) throw new Error("Missing frame");
    const targetWorld = multiply(target.basis, transformMatrix(target.transform)),
      actualWorld = multiply(targetWorld, frame.matrix),
      expectedWorld = multiply(multiply(prefix, transformMatrix(pose)), source.attributeMatrix);
    for (const [index, value] of actualWorld.entries())
      expect(value).toBeCloseTo(expectedWorld[index] ?? NaN, 8);
    expect(frame.d).toContain("C-100 -200 100 200");
    for (const point of [
      { x: -100, y: -200 },
      { x: 100, y: 200 },
    ]) {
      const mapped = transformPoint(frame.matrix, point.x, point.y);
      expect(mapped.x).toBeGreaterThan(frame.region.x);
      expect(mapped.x).toBeLessThan(frame.region.x + frame.region.width);
      expect(mapped.y).toBeGreaterThan(frame.region.y);
      expect(mapped.y).toBeLessThan(frame.region.y + frame.region.height);
    }
    expect(source.geometry).toBe(square);
  });
  it("handles collapsed targets reversibly and enforces the evaluation budget", () => {
    const objects = fixture(),
      target = objects.get("node-target");
    if (!target) throw new Error("Missing target");
    const context = createVectorEffectContext(objects),
      collapsed = evaluateVectorEffects(
        context,
        new Map([["node-target", { ...target.transform, sx: 0 }]]),
      );
    expect(
      collapsed.every(
        (frame) =>
          frame.d === "" && frame.opacity === 0 && frame.matrix.join() === identityMatrix().join(),
      ),
    ).toBe(true);
    expect(evaluateVectorEffects(context, new Map())[0]?.d).not.toBe("");
    expect(() =>
      evaluateVectorEffects(context, new Map(), new Map(), undefined, { remaining: 0 }),
    ).toThrow(/orçamento/);
  });
  it("keeps definition identity exact when a rotated/scaled viewport becomes an independent scope", () => {
    const objects = fixture(),
      group = objects.get("node-group");
    if (!group) throw new Error("Missing group");
    group.parentId = "node-viewport";
    objects.set("node-viewport", {
      tag: "svg",
      parentId: "node-instance",
      transform: identityTransform(),
    });
    objects.set("node-instance", {
      tag: "g",
      parentId: null,
      transform: { ...identityTransform(), x: 137, rotation: 13, sx: 1.3, sy: 0.9 },
    });
    const full = evaluateVectorEffects(createVectorEffectContext(objects), new Map());
    const scoped = fixture();
    expect(evaluateVectorEffects(createVectorEffectContext(scoped), new Map())).toEqual(full);
  });
  it("detects full hierarchy cycles through viewport boundaries and depth regardless of map order", () => {
    const cycle = fixture();
    cycle.set("node-group", {
      tag: "g",
      parentId: "node-viewport",
      transform: identityTransform(),
    });
    cycle.set("node-viewport", {
      tag: "svg",
      parentId: "node-group",
      transform: identityTransform(),
    });
    expect(() => createVectorEffectContext(cycle)).toThrow(/Hierarquia/);
    const chain = new Map<string, EffectObject>();
    for (let index = 0; index < 34; index++)
      chain.set(`node-${index}`, {
        tag: "g",
        parentId: index === 0 ? null : `node-${index - 1}`,
        transform: identityTransform(),
      });
    expect(() => createVectorEffectContext(chain)).toThrow(/profunda/);
    expect(() => createVectorEffectContext(new Map([...chain].reverse()))).toThrow(/Hierarquia/);
  });
  it("rejects unsafe references, effects on sources, viewport crossing, hierarchy cycles and empty/unknown data", () => {
    for (const value of [
      {},
      { clip: { sourceId: "https://unsafe.test", rule: "nonzero" } },
      { mask: { sourceId: "node-source", rule: "nonzero", opacity: 2 } },
      { href: "#node-source" },
    ])
      expect(() => vectorEffectsSchema.parse(value)).toThrow();
    for (const change of [
      (objects: Map<string, EffectObject>) => objects.delete("node-source"),
      (objects: Map<string, EffectObject>) => {
        const source = objects.get("node-source");
        if (source) source.tag = "image";
      },
      (objects: Map<string, EffectObject>) => {
        const source = objects.get("node-source");
        if (source) source.geometry = [];
      },
      (objects: Map<string, EffectObject>) => {
        const source = objects.get("node-source");
        if (source) source.effects = { clip: { sourceId: "node-target", rule: "nonzero" } };
      },
      (objects: Map<string, EffectObject>) => {
        const group = objects.get("node-group");
        if (group) group.parentId = "node-group";
      },
      (objects: Map<string, EffectObject>) => {
        const target = objects.get("node-target");
        if (target) target.parentId = "node-viewport";
        objects.set("node-viewport", {
          tag: "svg",
          parentId: null,
          transform: identityTransform(),
        });
      },
    ]) {
      const objects = fixture();
      change(objects);
      expect(() => createVectorEffectContext(objects)).toThrow();
    }
    const objects = fixture(),
      target = objects.get("node-target");
    if (!target) throw new Error("Missing target");
    target.effects = { clip: { sourceId: "node-target", rule: "nonzero" } };
    expect(() => createVectorEffectContext(objects)).toThrow();
  });
});
