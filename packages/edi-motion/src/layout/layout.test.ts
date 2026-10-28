import { expect, test } from "vitest";
import {
  defaultLayoutContainer,
  defaultLayoutItem,
  type LayoutDocument,
  type LayoutObject,
  parseLayout,
} from "./model";
import { createLayoutEngine } from "./yoga";

const objects = new Map<string, LayoutObject>(
  ["node-a", "node-b", "node-c"].map((id) => [id, { tag: "rect", parentId: null }]),
);
const intrinsic = new Map(
  [...objects.keys()].map((id) => [id, { x: 0, y: 0, width: 20, height: 10 }]),
);
function layout(): LayoutDocument {
  return { version: 1, root: defaultLayoutContainer(), containers: [], items: [] };
}
test("Yoga layout uses real padding, gaps, weighted fill, clipping and explicit fractional sizes without mutation", async () => {
  const engine = await createLayoutEngine(),
    document = layout();
  document.root.padding = [10, 10, 10, 10];
  document.root.gap = [10, 10];
  document.items = [...objects.keys()].map((id) => ({
    ...defaultLayoutItem(id),
    width: { kind: "fill", weight: 1 },
  }));
  const before = structuredClone(document),
    result = engine.compute(document, { width: 120, height: 50 }, objects, intrinsic);
  expect(result.boxes.get("node-a")?.x).toBe(10);
  expect(result.boxes.get("node-b")?.x).toBeCloseTo(46.666666, 4);
  expect(result.boxes.get("node-a")?.width).toBeCloseTo(26.666666, 4);
  expect(result.containers.get(null)?.overflow).toBe(false);
  expect(document).toEqual(before);
  document.root.padding = [0, 0, 0, 0];
  document.root.gap = [0, 0];
  document.items = ["node-a", "node-b"].map((id, index) => ({
    ...defaultLayoutItem(id),
    width: { kind: "fill", weight: index + 1 },
  }));
  const two = new Map([...objects].filter(([id]) => id !== "node-c")),
    fractional = engine.compute(document, { width: 100.1, height: 50 }, two, intrinsic);
  expect(fractional.boxes.get("node-a")?.width).toBeCloseTo(100.1 / 3, 4);
  expect(fractional.boxes.get("node-b")?.width).toBeCloseTo(200.2 / 3, 4);
});
test("wrapping and uniform auto-fit grids actually reflow at different viewports, not merely scale viewBox", async () => {
  const engine = await createLayoutEngine(),
    document = layout();
  document.root.wrap = true;
  document.root.gap = [10, 10];
  document.items = [...objects.keys()].map((id) => ({
    ...defaultLayoutItem(id),
    width: { kind: "fixed", value: 60 },
  }));
  const wide = engine.compute(document, { width: 220, height: 100 }, objects, intrinsic),
    narrow = engine.compute(document, { width: 100, height: 100 }, objects, intrinsic);
  expect(wide.boxes.get("node-b")?.x).toBe(70);
  expect(narrow.boxes.get("node-b")?.x).toBe(0);
  expect(narrow.boxes.get("node-b")?.y).toBe(20);
  document.root.flow = "grid";
  document.root.columns = { kind: "auto-fit", minWidth: 100 };
  document.items = [...objects.keys()].map(defaultLayoutItem);
  const gridWide = engine.compute(document, { width: 330, height: 200 }, objects, intrinsic),
    gridNarrow = engine.compute(document, { width: 200, height: 200 }, objects, intrinsic);
  expect(gridWide.boxes.get("node-c")?.y).toBe(0);
  expect(gridWide.boxes.get("node-b")?.x).toBeGreaterThan(100);
  expect(gridNarrow.boxes.get("node-b")?.x).toBe(0);
  expect(gridNarrow.boxes.get("node-b")?.y).toBe(70);
});
test("nested layouts preserve parent-local coordinates, anchors and RTL semantics", async () => {
  const engine = await createLayoutEngine(),
    document = layout(),
    nested = new Map<string, LayoutObject>([
      ["node-group", { tag: "g", parentId: null }],
      ["node-child", { tag: "rect", parentId: "node-group" }],
    ]);
  document.root.padding = [10, 10, 10, 10];
  document.containers = [
    {
      targetId: "node-group",
      config: { ...defaultLayoutContainer(), flow: "column", padding: [5, 5, 5, 5] },
    },
  ];
  document.items = [
    {
      ...defaultLayoutItem("node-group"),
      width: { kind: "fixed", value: 80 },
      height: { kind: "fixed", value: 50 },
    },
  ];
  const result = engine.compute(
    document,
    { width: 200, height: 100 },
    nested,
    new Map([["node-child", { x: 0, y: 0, width: 10, height: 10 }]]),
  );
  expect(result.boxes.get("node-group")).toEqual({ x: 10, y: 10, width: 80, height: 50 });
  expect(result.boxes.get("node-child")?.x).toBe(5);
  expect(result.boxes.get("node-child")?.y).toBe(5);
  const anchored = layout();
  anchored.items = [
    {
      ...defaultLayoutItem("node-a"),
      width: { kind: "fill", weight: 1 },
      height: { kind: "fixed", value: 10 },
      position: { kind: "absolute", left: 10, right: 20, top: null, bottom: 10 },
    },
  ];
  const one = new Map([["node-a", { tag: "rect", parentId: null }]]),
    anchor = engine.compute(anchored, { width: 100, height: 50 }, one, intrinsic);
  expect(anchor.boxes.get("node-a")).toEqual({ x: 10, y: 30, width: 70, height: 10 });
  anchored.items = [];
  anchored.root.direction = "rtl";
  expect(
    engine.compute(anchored, { width: 100, height: 50 }, one, intrinsic).boxes.get("node-a")?.x,
  ).toBe(80);
});
test("orphan/circular/ambiguous/oversized layouts reject before publication; failed measurement frees the partial native tree", async () => {
  const engine = await createLayoutEngine(),
    document = layout();
  expect(() => parseLayout({ ...document, items: Array(2001).fill(null) }, objects)).toThrow(
    /Orçamento/,
  );
  expect(() =>
    parseLayout({ ...document, items: [defaultLayoutItem("node-orphan")] }, objects),
  ).toThrow(/pertence/);
  const nested = new Map<string, LayoutObject>([
    ["node-group", { tag: "g", parentId: null }],
    ["node-child", { tag: "rect", parentId: "node-group" }],
  ]);
  const circular = {
    ...document,
    containers: [{ targetId: "node-group", config: defaultLayoutContainer() }],
    items: [{ ...defaultLayoutItem("node-child"), width: { kind: "fill", weight: 1 } }],
  };
  expect(() => parseLayout(circular, nested)).toThrow(/circular/);
  expect(() => engine.compute(document, { width: 100, height: 50 }, objects, new Map())).toThrow(
    /intrínseca/,
  );
  for (let iteration = 0; iteration < 50; iteration++)
    expect(
      engine.compute(document, { width: 100, height: 50 }, objects, intrinsic).boxes.size,
    ).toBe(3);
});
test("rootSize sizes the artboard per axis from its design size, its children or the viewport", async () => {
  const engine = await createLayoutEngine(),
    document = layout();
  document.root.padding = [5, 5, 5, 5];
  document.root.gap = [10, 10];
  const viewport = { width: 300, height: 200 },
    design = { width: 120, height: 80 },
    root = (value: LayoutDocument) =>
      engine.compute(value, viewport, objects, intrinsic, design).containers.get(null);
  expect(root(document)).toMatchObject({ width: 300, height: 200 });
  document.rootSize = { width: "fixed", height: "fixed" };
  expect(root(document)).toMatchObject({ width: 120, height: 80 });
  document.rootSize = { width: "hug", height: "hug" };
  // Three 20×10 children in a row, 10 px gaps and 5 px padding on each side.
  expect(root(document)).toMatchObject({ width: 90, height: 20 });
  document.rootSize = { width: "fill", height: "hug" };
  expect(root(document)).toMatchObject({ width: 300, height: 20 });
});
test("a hugging artboard refuses children that depend on its size on the same axis", () => {
  const document = layout();
  document.rootSize = { width: "hug", height: "fixed" };
  document.items = [{ ...defaultLayoutItem("node-a"), width: { kind: "fill", weight: 1 } }];
  expect(() => parseLayout(document, objects)).toThrow(/dependência circular/);
  document.items = [{ ...defaultLayoutItem("node-a"), height: { kind: "percent", value: 0.5 } }];
  expect(parseLayout(document, objects).rootSize).toEqual({ width: "hug", height: "fixed" });
  document.root = { ...document.root, flow: "grid", columns: { kind: "auto-fit", minWidth: 20 } };
  document.items = [];
  expect(() => parseLayout(document, objects)).toThrow(/auto-fit com largura hug/);
});
test("a hugging root grid sizes each row by its own cells and ignores absolute children", async () => {
  const engine = await createLayoutEngine(),
    four = new Map<string, LayoutObject>(
      ["node-a", "node-b", "node-c", "node-d"].map((id) => [id, { tag: "rect", parentId: null }]),
    ),
    heights: Record<string, number> = { "node-a": 10, "node-b": 10, "node-c": 100, "node-d": 100 },
    sizes = new Map(
      [...four.keys()].map((id) => [id, { x: 0, y: 0, width: 20, height: heights[id] ?? 0 }]),
    ),
    document = layout();
  document.root = {
    ...document.root,
    flow: "grid",
    columns: { kind: "fixed", count: 2 },
    gap: [0, 10],
  };
  document.rootSize = { width: "fixed", height: "hug" };
  const root = engine
    .compute(document, { width: 300, height: 300 }, four, sizes, { width: 100, height: 300 })
    .containers.get(null);
  expect(root?.height).toBe(120);

  const hugging = layout();
  hugging.rootSize = { width: "hug", height: "hug" };
  hugging.items = [
    {
      ...defaultLayoutItem("node-c"),
      width: { kind: "fill", weight: 1 },
      position: { kind: "absolute", left: 0, right: 0, top: 0, bottom: null },
    },
  ];
  expect(parseLayout(hugging, objects).rootSize).toEqual({ width: "hug", height: "hug" });
  hugging.items = [{ ...defaultLayoutItem("node-c"), width: { kind: "fill", weight: 1 } }];
  expect(() => parseLayout(hugging, objects)).toThrow(/dependência circular/);
});
