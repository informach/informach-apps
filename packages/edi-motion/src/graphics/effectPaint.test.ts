import { describe, expect, it } from "vitest";
import { identityTransform } from "../model";
import { effectSourcePaints, isPaintedMask } from "./effectPaint";
import { type Gradient, type GradientPaints, paintServerId } from "./gradients";
import {
  createVectorEffectContext,
  type EffectObject,
  evaluateVectorEffects,
  vectorEffectElement,
} from "./vectorEffects";

const fade: Gradient = {
  kind: "linear",
  units: "objectBoundingBox",
  spread: "pad",
  x1: 0,
  y1: 0,
  x2: 1,
  y2: 0,
  stops: [
    { offset: 0, color: "#ffffff", opacity: 1 },
    { offset: 1, color: "#000000", opacity: 1 },
  ],
};
const mask = (mode?: "silhouette" | "alpha" | "luminance") => ({
  mask: {
    sourceId: "node-source",
    rule: "nonzero" as const,
    opacity: 1,
    ...(mode ? { mode } : {}),
  },
});

type Node = {
  id: string;
  parentId: string | null;
  attrs: Record<string, string>;
  gradients?: GradientPaints;
  filter?: unknown;
};
describe("painted mask sources", () => {
  it("resolve the effective paint through groups with the authoring channel rule", () => {
    const nodes: Node[] = [
      {
        id: "node-group",
        parentId: null,
        attrs: { "fill-opacity": "0.5", stroke: "#ff0000" },
        gradients: { fill: fade },
      },
      { id: "node-source", parentId: "node-group", attrs: { "stroke-width": "4" } },
      { id: "node-target", parentId: null, attrs: {} },
    ];
    const effects = new Map([["node-target", mask("luminance")]]);
    expect(isPaintedMask(mask("luminance"))).toBe(true);
    expect(isPaintedMask(mask("silhouette"))).toBe(false);
    expect(isPaintedMask(mask())).toBe(false);
    expect(effectSourcePaints(nodes, effects).get("node-source")).toEqual({
      fill: `url(#${paintServerId(fade)})`,
      "fill-opacity": "0.5",
      stroke: "#ff0000",
      "stroke-width": "4",
    });
    const solid: Node[] = [
      nodes[0],
      { id: "node-source", parentId: "node-group", attrs: { fill: "#808080", stroke: "inherit" } },
      nodes[2],
    ].flatMap((node) => (node ? [node] : []));
    expect(effectSourcePaints(solid, effects).get("node-source")?.fill).toBe("#808080");
    expect(effectSourcePaints(nodes, new Map([["node-target", mask("silhouette")]])).size).toBe(0);
    expect(() =>
      effectSourcePaints(
        nodes.map((node): Node => (node.id === "node-source" ? { ...node, filter: {} } : node)),
        effects,
      ),
    ).toThrow(/filtro/);
  });

  it("draw the source with its paint, the mask type of the mode and room for the stroke", () => {
    const objects = new Map<string, EffectObject>([
      [
        "node-target",
        { tag: "rect", parentId: null, transform: identityTransform(), effects: mask("luminance") },
      ],
      [
        "node-source",
        {
          tag: "path",
          parentId: null,
          transform: { ...identityTransform(), x: 10 },
          geometry: [
            {
              closed: true,
              points: [
                { x: 0, y: 0, in: null, out: null },
                { x: 20, y: 0, in: null, out: null },
                { x: 20, y: 20, in: null, out: null },
              ],
            },
          ],
          pathData: "M0 0L20 0L20 20Z",
          paint: { fill: "#808080", stroke: "#ffffff", "stroke-width": "3" },
        },
      ],
    ]);
    const [frame] = evaluateVectorEffects(createVectorEffectContext(objects), new Map());
    expect(frame?.mode).toBe("luminance");
    // Silhouette padding of 1 plus half the stroke at the default miter limit (3 × 2).
    expect(frame?.region).toEqual({ x: 3, y: -7, width: 34, height: 34 });
    const element = vectorEffectElement(frame ?? expect.fail("Missing frame"));
    expect(element.attrs["mask-type"]).toBe("luminance");
    expect(element.children[0]?.attrs).toMatchObject({
      fill: "#808080",
      stroke: "#ffffff",
      "stroke-width": "3",
    });
    const silhouette = new Map(objects);
    silhouette.set("node-target", {
      tag: "rect",
      parentId: null,
      transform: identityTransform(),
      effects: mask(),
    });
    const [plain] = evaluateVectorEffects(createVectorEffectContext(silhouette), new Map());
    expect(plain?.mode).toBeUndefined();
    expect(vectorEffectElement(plain ?? expect.fail("Missing frame")).children[0]?.attrs.fill).toBe(
      "#ffffff",
    );
    const unpainted = new Map(objects);
    const source = objects.get("node-source");
    if (!source) throw new Error("Missing source");
    unpainted.set("node-source", { ...source, paint: undefined });
    expect(() => createVectorEffectContext(unpainted)).toThrow(/pintura efetiva/);
  });
});
