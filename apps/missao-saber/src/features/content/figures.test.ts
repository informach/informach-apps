import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ItemFigure } from "../learning/components/item-figure";
import { findLesson } from "./catalog";
import { cubeNets, figureSchema, functionGraphs } from "./figures";
import { itemSchema, publicItem } from "./types";

type Vec = [number, number, number];
const neg = (v: Vec): Vec => [-v[0], -v[1], -v[2]];
// Independent folding oracle: propagate an orthonormal frame across every edge.
function foldsToCube(cells: [number, number][]) {
  const first = cells[0];
  if (!first) return false;
  const occupied = new Set(cells.map((c) => c.join(",")));
  const frames = new Map<string, [Vec, Vec, Vec]>([
    [
      first.join(","),
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    ],
  ]);
  const queue = [first];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (!cell) continue;
    const frame = frames.get(cell.join(","));
    if (!frame) throw new Error("Missing frame");
    const [r, d, n] = frame;
    const neighbors: [number, number, [Vec, Vec, Vec]][] = [
      [1, 0, [neg(n), d, r]],
      [-1, 0, [n, d, neg(r)]],
      [0, 1, [r, neg(n), d]],
      [0, -1, [r, n, neg(d)]],
    ];
    for (const [dx, dy, next] of neighbors) {
      const target: [number, number] = [cell[0] + dx, cell[1] + dy];
      const key = target.join(",");
      if (!occupied.has(key)) continue;
      const prior = frames.get(key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(next)) return false;
      if (!prior) {
        frames.set(key, next);
        queue.push(target);
      }
    }
  }
  return frames.size === 6 && new Set([...frames.values()].map((f) => f[2].join(","))).size === 6;
}

it("draws eight mathematically coherent graphs with text/table alternatives and no grading in the DTO", () => {
  const lesson = findLesson("funcoes-4");
  if (!lesson) throw new Error("Missing lesson");
  expect(lesson.version).toBe(2);
  const rules = [
    [(x: number) => Math.abs(x), (x: number) => Math.abs(x) + 3],
    [(x: number) => 4 - 2 * x],
    [(x: number) => 1 - x],
    [(x: number) => Math.abs(x), (x: number) => Math.abs(x - 2)],
    [(x: number) => x * x - 4],
    [(x: number) => x + 1, (x: number) => -x - 1],
    [(x: number) => (x - 2) ** 2 - 1],
    [(x: number) => x, (x: number) => 4 - x],
  ];
  for (const [i, figure] of functionGraphs.entries()) {
    expect(figureSchema.safeParse(figure).success).toBe(true);
    if (figure.kind !== "graph") throw new Error("Expected graph");
    for (const [j, s] of figure.series.entries())
      for (const [x, y] of s.points) expect(y).toBeCloseTo(rules[i]?.[j]?.(x) ?? Number.NaN, 10);
    const item = lesson.items[i];
    if (!item) throw new Error("Missing item");
    expect(publicItem(item).figure).toEqual(figure);
    expect(publicItem(item)).not.toHaveProperty("answer");
    const html = renderToStaticMarkup(createElement(ItemFigure, { figure }));
    expect(html).toContain('role="img"');
    expect(html).toContain("<table");
    expect(html).toContain("<desc");
  }
  const old = { ...lesson.items[0], figure: undefined };
  expect(itemSchema.safeParse(old).success).toBe(true);
});

it("offers exactly one cube net, verified by three-dimensional folding", () => {
  expect(figureSchema.safeParse(cubeNets).success).toBe(true);
  if (cubeNets.kind !== "nets") throw new Error("Expected nets");
  expect(cubeNets.nets.filter((n) => foldsToCube(n.cells)).map((n) => n.label)).toEqual(["A"]);
  const item = findLesson("espaco-2")?.items[5];
  expect(item).toMatchObject({ type: "choice", answer: "A", figure: cubeNets });
  expect(findLesson("espaco-2")?.version).toBe(2);
});

it("rejects invalid scales, duplicate squares and out-of-range graph points", () => {
  const graph = functionGraphs[0];
  if (graph?.kind !== "graph" || cubeNets.kind !== "nets") throw new Error("Missing figure");
  expect(figureSchema.safeParse({ ...graph, x: { ...graph.x, step: 0 } }).success).toBe(false);
  expect(
    figureSchema.safeParse({
      ...graph,
      series: [
        {
          label: "f",
          points: [
            [0, 0],
            [100, 100],
          ],
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    figureSchema.safeParse({
      ...cubeNets,
      nets: [
        { label: "A", cells: Array(6).fill([0, 0]) },
        { label: "B", cells: cubeNets.nets[1]?.cells },
      ],
    }).success,
  ).toBe(false);
});
