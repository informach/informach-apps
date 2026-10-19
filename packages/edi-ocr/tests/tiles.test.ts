import { describe, expect, it } from "vitest";
import {
  mergeOcrTiles,
  OCR_LIMITS,
  type OcrResult,
  type OcrTile,
  type OcrWord,
  planOcrTiles,
  recognizeOcrTiles,
} from "../src/index.ts";

function covered(tiles: OcrTile[], width: number, height: number) {
  // Every source pixel row/column is owned by exactly one core and lies inside its tile.
  for (const [length, start, size, from, to] of [
    [width, "x", "width", "x0", "x1"],
    [height, "y", "height", "y0", "y1"],
  ] as const) {
    const cores = [...new Map(tiles.map((tile) => [tile.core[from], tile])).values()].sort(
      (a, b) => a.core[from] - b.core[from],
    );
    expect(cores[0]?.core[from]).toBe(0);
    expect(cores.at(-1)?.core[to]).toBe(length);
    for (const [index, tile] of cores.entries()) {
      const next = cores[index + 1];
      if (next) expect(next.core[from]).toBe(tile.core[to]);
      expect(tile.core[from]).toBeGreaterThanOrEqual(tile[start]);
      expect(tile.core[to]).toBeLessThanOrEqual(tile[start] + tile[size]);
    }
  }
}

describe("planOcrTiles", () => {
  it("keeps images within the per-call limit in a single tile", () => {
    expect(planOcrTiles(2480, 3508)).toEqual([
      { x: 0, y: 0, width: 2480, height: 3508, core: { x0: 0, y0: 0, x1: 2480, y1: 3508 } },
    ]);
  });

  it("cuts a 30000 px scroll capture into full-width overlapping bands within 8192 px and 24 MP", () => {
    const tiles = planOcrTiles(1920, 30000);
    expect(tiles.length).toBe(4);
    for (const tile of tiles) {
      expect(tile.width).toBe(1920);
      expect(tile.height).toBeLessThanOrEqual(OCR_LIMITS.maxSide);
      expect(tile.width * tile.height).toBeLessThanOrEqual(OCR_LIMITS.maxPixels);
      expect(tile.y + tile.height).toBeLessThanOrEqual(30000);
    }
    for (const [index, tile] of tiles.entries()) {
      const next = tiles[index + 1];
      if (next) expect(tile.y + tile.height - next.y).toBeGreaterThanOrEqual(256);
    }
    expect(tiles.at(-1)?.y).toBe(30000 - (tiles.at(-1)?.height ?? 0));
    covered(tiles, 1920, 30000);
  });

  it("respects the area limit for wide sources and falls back to square tiles", () => {
    const wide = planOcrTiles(7680, 30000);
    for (const tile of wide) {
      expect(tile.width * tile.height).toBeLessThanOrEqual(OCR_LIMITS.maxPixels);
      expect(tile.height).toBeGreaterThan(1024);
    }
    covered(wide, 7680, 30000);
    const panorama = planOcrTiles(30000, 4000);
    expect(new Set(panorama.map((tile) => tile.x)).size).toBeGreaterThan(1);
    for (const tile of panorama) {
      expect(tile.width).toBeLessThanOrEqual(OCR_LIMITS.maxSide);
      expect(tile.width * tile.height).toBeLessThanOrEqual(OCR_LIMITS.maxPixels);
    }
    covered(panorama, 30000, 4000);
  });

  it("rejects sources beyond the canvas limit, invalid sizes and too many tiles", () => {
    expect(() => planOcrTiles(40000, 100)).toThrow(/limite de OCR por blocos/);
    expect(() => planOcrTiles(0, 100)).toThrow(/Largura/);
    expect(() => planOcrTiles(1920, 30000, { maxTiles: 2 })).toThrow(/blocos OCR demais/);
    expect(() => planOcrTiles(1920, 30000, { tile: { maxSide: 400 }, overlap: 256 })).toThrow(
      /Sobreposição/,
    );
  });
});

const word = (text: string, x0: number, y0: number, x1: number, y1: number, line = 0) => ({
  text,
  confidence: 90,
  x0,
  y0,
  x1,
  y1,
  line,
});
const tileResult = (tile: OcrTile, words: OcrWord[]): OcrResult => ({
  width: tile.width,
  height: tile.height,
  confidence: 90,
  inclination: 0,
  words,
});

describe("mergeOcrTiles", () => {
  const tiles = planOcrTiles(1000, 3000, { tile: { maxSide: 1200 }, overlap: 200 });
  const [top, middle] = tiles;

  it("translates words to source pixels and keeps a word seen by two tiles once", () => {
    if (!top || !middle) throw new Error("expected tiles");
    expect(tiles.length).toBe(3);
    // A line inside the top/middle overlap is read by both tiles.
    const sourceY = middle.y + 40;
    const merged = mergeOcrTiles(1000, 3000, [
      {
        tile: top,
        result: tileResult(top, [
          word("Primeira", 10, 10, 120, 40),
          word("Sobreposta", 10, sourceY - top.y, 160, sourceY - top.y + 30, 1),
        ]),
      },
      {
        tile: middle,
        result: tileResult(middle, [
          word("Sobreposta", 10, 40, 160, 70),
          word("Meio", 10, 500, 90, 530, 1),
        ]),
      },
      { tile: tiles[2] ?? middle, result: tileResult(tiles[2] ?? middle, []) },
    ]);
    expect(merged.width).toBe(1000);
    expect(merged.height).toBe(3000);
    expect(merged.words.map((item) => item.text)).toEqual(["Primeira", "Sobreposta", "Meio"]);
    const overlap = merged.words[1];
    expect(overlap?.y0).toBe(sourceY);
    expect(overlap?.y1).toBe(sourceY + 30);
    expect(merged.words[2]?.y0).toBe(middle.y + 500);
    expect(new Set(merged.words.map((item) => item.line)).size).toBe(3);
  });

  it("drops a cut fragment at a tile edge and keeps the whole word from the neighbour", () => {
    if (!top || !middle) throw new Error("expected tiles");
    // The word straddles the bottom edge of the top tile: the top tile sees only a fragment.
    const y0 = top.y + top.height - 12;
    const merged = mergeOcrTiles(1000, 3000, [
      {
        tile: top,
        result: tileResult(top, [word("Cor", 300, y0 - top.y, 360, top.height)]),
      },
      {
        tile: middle,
        result: tileResult(middle, [word("Cortada", 300, y0 - middle.y, 420, y0 - middle.y + 30)]),
      },
    ]);
    expect(merged.words.map((item) => item.text)).toEqual(["Cortada"]);
  });

  it("reduces colliding duplicates from different tiles to the most confident word", () => {
    if (!top || !middle) throw new Error("expected tiles");
    const core = top.core.y1;
    // Centres fall on opposite sides of the ownership seam, boxes cover each other.
    const merged = mergeOcrTiles(1000, 3000, [
      {
        tile: top,
        result: tileResult(top, [
          { ...word("Dupla", 500, core - 20 - top.y, 600, core + 18 - top.y), confidence: 70 },
        ]),
      },
      {
        tile: middle,
        result: tileResult(middle, [
          {
            ...word("Dupla", 500, core - 18 - middle.y, 600, core + 22 - middle.y),
            confidence: 95,
          },
        ]),
      },
    ]);
    expect(merged.words).toHaveLength(1);
    expect(merged.words[0]?.confidence).toBe(95);
  });

  it("rejects a result whose size does not match its tile", () => {
    if (!top) throw new Error("expected tiles");
    expect(() =>
      mergeOcrTiles(1000, 3000, [{ tile: top, result: { ...tileResult(top, []), width: 10 } }]),
    ).toThrow(/não corresponde/);
  });
});

describe("recognizeOcrTiles", () => {
  it("runs tiles one at a time, reports progress and stops on cancellation", async () => {
    const tiles = planOcrTiles(1920, 30000);
    const controller = new AbortController();
    const seen: number[] = [];
    let running = 0;
    const progress: number[] = [];
    await expect(
      recognizeOcrTiles(
        1920,
        30000,
        tiles,
        async (tile, signal, report) => {
          running++;
          expect(running).toBe(1);
          seen.push(tile.y);
          report(0.5);
          await Promise.resolve();
          running--;
          if (seen.length === 2) controller.abort();
          signal.throwIfAborted();
          return tileResult(tile, []);
        },
        controller.signal,
        (value) => progress.push(value),
      ),
    ).rejects.toThrow();
    expect(seen.length).toBe(2);
    expect(progress[0]).toBeCloseTo(0.5 / tiles.length);
  });

  it("merges every tile result into one source result", async () => {
    const tiles = planOcrTiles(1920, 30000);
    const merged = await recognizeOcrTiles(
      1920,
      30000,
      tiles,
      async (tile) =>
        tileResult(tile, [
          word(`y${tile.y}`, 100, tile.core.y0 - tile.y + 10, 300, tile.core.y0 - tile.y + 40),
        ]),
      new AbortController().signal,
    );
    expect(merged.words.map((item) => item.y0)).toEqual(tiles.map((tile) => tile.core.y0 + 10));
  });
});
