import {
  createOcrResultSchema,
  OCR_LIMITS,
  OCR_TILED_LIMITS,
  type OcrLimits,
  type OcrResult,
  type OcrWord,
} from "./format.ts";

/** A rectangle of the source image in pixels, with the part of it this tile owns. */
export interface OcrTile {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Ownership area. Cores of all tiles partition the source exactly: overlaps are split at
   * their midpoint, so a word whose centre lies in a core is kept from that tile only.
   */
  core: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrTileOptions {
  /** Per-call engine limits each tile must respect. */
  tile?: Partial<Pick<OcrLimits, "maxSide" | "maxPixels">>;
  /** Source limits. The default follows the Chromium canvas limits. */
  source?: Partial<Pick<OcrLimits, "maxSide" | "maxPixels">>;
  /**
   * Pixels shared by neighbouring tiles. Words up to this size across the cut are read whole
   * by at least one tile. Default 256 px.
   */
  overlap?: number;
  /** Upper bound on the number of tiles. Default 256. */
  maxTiles?: number;
}

export const OCR_TILE_OVERLAP = 256;
export const OCR_MAX_TILES = 256;

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} OCR inválido.`);
  return value;
}

/** Evenly spread starts so that consecutive tiles share at least `overlap` pixels. */
function axisStarts(length: number, size: number, overlap: number): number[] {
  if (length <= size) return [0];
  const count = Math.ceil((length - overlap) / (size - overlap));
  const step = (length - size) / (count - 1);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? length - size : Math.floor(index * step),
  );
}

/** Ownership boundaries: the midpoint of each overlap, plus the source edges. */
function axisCores(starts: number[], size: number, length: number): [number, number][] {
  return starts.map((start, index) => {
    const previous = starts[index - 1];
    const next = starts[index + 1];
    const from = previous === undefined ? 0 : Math.floor((start + previous + size) / 2);
    const to = next === undefined ? length : Math.floor((next + start + size) / 2);
    return [from, to];
  });
}

/**
 * Split an image into overlapping tiles that each fit the per-call limits. Images within the
 * limits yield one tile covering everything. Row-major order (top to bottom, left to right).
 */
export function planOcrTiles(width: number, height: number, options: OcrTileOptions = {}) {
  positiveInteger(width, "Largura");
  positiveInteger(height, "Altura");
  const tile = {
    maxSide: positiveInteger(options.tile?.maxSide ?? OCR_LIMITS.maxSide, "Lado do bloco"),
    maxPixels: positiveInteger(options.tile?.maxPixels ?? OCR_LIMITS.maxPixels, "Área do bloco"),
  };
  const source = {
    maxSide: options.source?.maxSide ?? OCR_TILED_LIMITS.maxSide,
    maxPixels: options.source?.maxPixels ?? OCR_TILED_LIMITS.maxPixels,
  };
  if (width > source.maxSide || height > source.maxSide || width * height > source.maxPixels)
    throw new Error("Imagem excede o limite de OCR por blocos.");
  const overlap = options.overlap ?? OCR_TILE_OVERLAP;
  if (!Number.isSafeInteger(overlap) || overlap < 0) throw new Error("Sobreposição OCR inválida.");
  const maxTiles = positiveInteger(options.maxTiles ?? OCR_MAX_TILES, "Limite de blocos");

  if (width <= tile.maxSide && height <= tile.maxSide && width * height <= tile.maxPixels)
    return [{ x: 0, y: 0, width, height, core: { x0: 0, y0: 0, x1: width, y1: height } }];

  // Prefer full-width bands, the natural cut for tall scroll captures. When bands would be
  // too short to hold the overlap, fall back to square tiles.
  let tileWidth = Math.min(width, tile.maxSide);
  let tileHeight = Math.min(height, tile.maxSide, Math.floor(tile.maxPixels / tileWidth));
  if (tileHeight < height && tileHeight < overlap * 4) {
    const side = Math.min(tile.maxSide, Math.floor(Math.sqrt(tile.maxPixels)));
    tileWidth = Math.min(width, side);
    tileHeight = Math.min(height, side, Math.floor(tile.maxPixels / tileWidth));
  }
  if (
    (tileWidth < width && tileWidth <= overlap * 2) ||
    (tileHeight < height && tileHeight <= overlap * 2)
  )
    throw new Error("Sobreposição OCR grande demais para o tamanho do bloco.");

  const xs = axisStarts(width, tileWidth, overlap);
  const ys = axisStarts(height, tileHeight, overlap);
  if (xs.length * ys.length > maxTiles)
    throw new Error("Imagem exige blocos OCR demais. Reduza a imagem ou recorte a área.");
  const xCores = axisCores(xs, tileWidth, width);
  const yCores = axisCores(ys, tileHeight, height);
  const tiles: OcrTile[] = [];
  ys.forEach((y, row) => {
    xs.forEach((x, column) => {
      const [x0, x1] = xCores[column] ?? [x, x + tileWidth];
      const [y0, y1] = yCores[row] ?? [y, y + tileHeight];
      tiles.push({ x, y, width: tileWidth, height: tileHeight, core: { x0, y0, x1, y1 } });
    });
  });
  return tiles;
}

function overlapRatio(a: OcrWord, b: OcrWord): number {
  const width = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const height = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (width <= 0 || height <= 0) return 0;
  const intersection = width * height;
  const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
  return intersection / smaller;
}

/**
 * Merge per-tile results into source coordinates. Each word is translated by its tile origin
 * and kept only by the tile whose core holds its centre. Words that still collide across tiles
 * (mostly covering each other) are reduced to the most confident one. Line ids are renumbered
 * per tile, so a line cut by a vertical seam becomes two lines.
 */
export function mergeOcrTiles(
  width: number,
  height: number,
  parts: readonly { tile: OcrTile; result: OcrResult }[],
  limits: Partial<OcrLimits> = OCR_TILED_LIMITS,
): OcrResult {
  const words: (OcrWord & { tile: number })[] = [];
  let lineOffset = 0,
    inclinationWeight = 0,
    inclinationSum = 0,
    confidenceSum = 0;
  parts.forEach(({ tile, result }, index) => {
    if (result.width !== tile.width || result.height !== tile.height)
      throw new Error("Resultado OCR não corresponde ao bloco.");
    let lastLine = -1;
    let kept = 0;
    for (const word of result.words) {
      const cx = tile.x + (word.x0 + word.x1) / 2;
      const cy = tile.y + (word.y0 + word.y1) / 2;
      lastLine = Math.max(lastLine, word.line);
      if (cx < tile.core.x0 || cx >= tile.core.x1 || cy < tile.core.y0 || cy >= tile.core.y1)
        continue;
      kept++;
      words.push({
        text: word.text,
        confidence: word.confidence,
        x0: word.x0 + tile.x,
        y0: word.y0 + tile.y,
        x1: word.x1 + tile.x,
        y1: word.y1 + tile.y,
        line: word.line + lineOffset,
        tile: index,
      });
    }
    lineOffset += lastLine + 1;
    confidenceSum += result.confidence;
    if (result.inclination !== undefined && kept) {
      inclinationSum += result.inclination * kept;
      inclinationWeight += kept;
    }
  });
  const discarded = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    if (!a || discarded.has(i)) continue;
    for (let j = i + 1; j < words.length; j++) {
      const b = words[j];
      if (!b || discarded.has(j) || a.tile === b.tile || overlapRatio(a, b) < 0.6) continue;
      if (b.confidence > a.confidence) {
        discarded.add(i);
        break;
      }
      discarded.add(j);
    }
  }
  const merged = words
    .filter((_, index) => !discarded.has(index))
    .map(({ tile: _tile, ...word }) => word);
  const confidence = merged.length
    ? merged.reduce((sum, word) => sum + word.confidence, 0) / merged.length
    : parts.length
      ? confidenceSum / parts.length
      : 0;
  return createOcrResultSchema(limits).parse({
    width,
    height,
    confidence,
    ...(inclinationWeight ? { inclination: inclinationSum / inclinationWeight } : {}),
    words: merged,
  });
}

/**
 * Recognize tiles one at a time, so at most one engine runs and cancellation stops before
 * the next tile. `recognizeTile` receives a source rectangle and returns its own result.
 */
export async function recognizeOcrTiles(
  width: number,
  height: number,
  tiles: readonly OcrTile[],
  recognizeTile: (
    tile: OcrTile,
    signal: AbortSignal,
    progress: (value: number) => void,
  ) => Promise<OcrResult>,
  signal: AbortSignal,
  progress: (value: number, tile: number, tiles: number) => void = () => {},
  limits: Partial<OcrLimits> = OCR_TILED_LIMITS,
): Promise<OcrResult> {
  const parts: { tile: OcrTile; result: OcrResult }[] = [];
  for (const [index, tile] of tiles.entries()) {
    signal.throwIfAborted();
    const result = await recognizeTile(tile, signal, (value) =>
      progress((index + Math.max(0, Math.min(1, value))) / tiles.length, index, tiles.length),
    );
    signal.throwIfAborted();
    parts.push({ tile, result });
  }
  return mergeOcrTiles(width, height, parts, limits);
}
