import { describe, expect, it } from "vitest";
import { identityTransform } from "../model";
import { describeVisualScene, type VisualElement } from "../visual/describe";
import { effectSourcePaints } from "./effectPaint";
import {
  type PaintLayer,
  paintLayerAttributes,
  paintLayerGeometry,
  paintLayersSchema,
  writeShapePath,
} from "./paintLayers";

const stroke: PaintLayer = {
  id: "paint-a",
  kind: "stroke",
  color: "#112233",
  opacity: 0.5,
  visible: true,
  width: 4,
  linejoin: "round",
};

describe("paint layers", () => {
  it("keeps stroke settings off fills, ids unique and the list bounded", () => {
    expect(paintLayersSchema.parse([stroke])).toEqual([stroke]);
    expect(() =>
      paintLayersSchema.parse([
        { id: "paint-b", kind: "fill", color: "#000000", opacity: 1, visible: true, width: 1 },
      ]),
    ).toThrow(/só para camadas de contorno/);
    expect(() => paintLayersSchema.parse([stroke, stroke])).toThrow(/repetido/);
    expect(() => paintLayersSchema.parse([])).toThrow();
    expect(() =>
      paintLayersSchema.parse(
        Array.from({ length: 17 }, (_, i) => ({ ...stroke, id: `paint-${i}` })),
      ),
    ).toThrow();
  });

  it("draws its own paint over the shape's geometry, never the base paint", () => {
    expect(paintLayerAttributes(stroke)).toEqual({
      fill: "none",
      stroke: "#112233",
      "stroke-opacity": "0.5",
      "stroke-width": "4",
      "stroke-linejoin": "round",
    });
    expect(
      paintLayerGeometry({
        d: "M0 0 L1 1",
        transform: "scale(2)",
        "fill-rule": "evenodd",
        fill: "red",
        "stroke-dasharray": "2 2",
        filter: "url(#x)",
      }),
    ).toEqual({ d: "M0 0 L1 1", transform: "scale(2)", "fill-rule": "evenodd" });
  });

  it("places visible copies after the shape in the object's wrapper", () => {
    const svg = describeVisualScene(
      {
        viewBox: [0, 0, 100, 100],
        nodes: [
          {
            id: "node-a",
            tag: "path",
            attrs: { d: "M0 0 L10 10", stroke: "#ff0000" },
            text: "",
            transform: identityTransform(),
            visible: true,
            children: [],
            paintLayers: [stroke, { ...stroke, id: "paint-off", visible: false }],
          },
        ],
      },
      [],
      { mode: "runtime" },
    );
    const wrapper = svg.children.at(-1)?.children[0] as VisualElement;
    expect(wrapper.attrs["data-edi-object"]).toBe("node-a");
    expect(wrapper.children.map((child) => child.attrs["data-edi-paint-layer"] ?? "shape")).toEqual(
      ["shape", "paint-a"],
    );
    expect(wrapper.children[1]?.attrs.d).toBe("M0 0 L10 10");
  });

  it("refuses them on a painted mask source", () => {
    expect(() =>
      effectSourcePaints(
        [{ id: "node-source", parentId: null, attrs: { fill: "#ffffff" }, paintLayers: [stroke] }],
        new Map([
          [
            "node-target",
            { mask: { sourceId: "node-source", rule: "nonzero", opacity: 1, mode: "luminance" } },
          ],
        ]),
      ),
    ).toThrow(/camadas de pintura extras/);
  });

  it("rewrites the copies with the shape's path", () => {
    class Fake {
      attributes = new Map<string, string>();
      nextElementSibling: Fake | null = null;
      constructor(layer?: string) {
        if (layer) this.attributes.set("data-edi-paint-layer", layer);
      }
      hasAttribute(name: string) {
        return this.attributes.has(name);
      }
      getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
      }
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }
      removeAttribute(name: string) {
        this.attributes.delete(name);
      }
    }
    const shape = new Fake(),
      copy = new Fake("paint-a"),
      desc = new Fake();
    shape.nextElementSibling = copy;
    copy.nextElementSibling = desc;
    writeShapePath(shape as unknown as Element, "M1 1 L2 2");
    expect([shape, copy, desc].map((element) => element.attributes.get("d"))).toEqual([
      "M1 1 L2 2",
      "M1 1 L2 2",
      undefined,
    ]);
    // A copy with its own trim takes its own path; null removes the shape's.
    writeShapePath(shape as unknown as Element, null, (layer) =>
      layer === "paint-a" ? "M1 1" : undefined,
    );
    expect([shape, copy].map((element) => element.attributes.get("d"))).toEqual([
      undefined,
      "M1 1",
    ]);
  });
});
