import { experimentSchema } from "../../schemas";
import { geometrySchema } from "./geometry";
import { ratiosSchema } from "./ratios";

/** Import to L03.mudancas-sucessivas. Original notes belong to the execution. */
export function adaptLegacyBars(raw: unknown) {
  const previous = experimentSchema.parse(raw);
  if (previous.kind !== "bars") throw new Error("A montagem precisa ser de barras.");
  return ratiosSchema.parse({
    base: previous.initial,
    percent: 25,
    change: -previous.first,
    secondChange: -previous.second,
    partA: 2,
    partB: 3,
    factor: 2,
    workers: 3,
    work: 24,
  });
}
/** Import to L05.area-e-contorno; pad the old 5×4 board, retaining adjacency. */
export function adaptLegacyGrid(raw: unknown) {
  const previous = experimentSchema.parse(raw);
  if (previous.kind !== "grid") throw new Error("A montagem precisa ser uma malha.");
  return geometrySchema.parse({
    cells: Array.from({ length: 36 }, (_, index) => {
      const row = Math.floor(index / 6);
      const column = index % 6;
      return row < 4 && column < 5 ? (previous.cells[row * 5 + column] ?? false) : false;
    }),
    side: 1,
    shape: "triangulo",
    points: [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 2, y: 4 },
    ],
  });
}
