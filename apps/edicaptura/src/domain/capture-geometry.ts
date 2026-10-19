import { z } from "zod";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const captureRectSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: z.number().finite().positive().max(100_000),
    height: z.number().finite().positive().max(100_000),
  })
  .strict();
export type CaptureRect = z.infer<typeof captureRectSchema>;
const displaySchema = z
  .object({
    id: z.string().min(1).max(100),
    bounds: captureRectSchema,
    scaleFactor: z.number().positive().max(8),
    rotation: z.number().int().min(0).max(359),
  })
  .strict();
export type CaptureDisplay = z.infer<typeof displaySchema>;
const sourceSchema = z
  .object({
    id: z.string().min(1).max(100),
    width: z.number().int().positive().max(32768),
    height: z.number().int().positive().max(32768),
  })
  .strict();
export type CaptureSourceSize = z.infer<typeof sourceSchema>;
export type CaptureBitmap = CaptureSourceSize & { pixels: Uint8Array };
export const CAPTURE_MEMORY_LIMIT = 512 * 1024 * 1024;
export const CAPTURE_PIXEL_LIMIT = 100_000_000;
export type CapturePlan = {
  topology: string;
  region: CaptureRect;
  scale: number;
  width: number;
  height: number;
  bytes: number;
  tiles: {
    id: string;
    bounds: CaptureRect;
    width: number;
    height: number;
    destination: CaptureRect;
  }[];
};
function unique<T extends { id: string }>(values: T[]): T[] {
  if (new Set(values.map((v) => v.id)).size !== values.length)
    throw new Error("Identidade duplicada.");
  return values;
}
export function topologyKey(input: unknown): string {
  return JSON.stringify(
    unique(z.array(displaySchema).min(1).max(32).parse(input)).sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  );
}
export function intersectRect(a: CaptureRect, b: CaptureRect): CaptureRect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
/** DIP layout and actual bitmap dimensions are distinct. No inferred Windows physical origin. */
export function planCapture(
  topology: unknown,
  inputSources: unknown,
  regionInput?: unknown,
  outputScale?: number,
  memoryLimit = CAPTURE_MEMORY_LIMIT,
): CapturePlan {
  const displays = unique(z.array(displaySchema).min(1).max(32).parse(topology)).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const sources = unique(z.array(sourceSchema).max(32).parse(inputSources));
  const x = Math.min(...displays.map((d) => d.bounds.x)),
    y = Math.min(...displays.map((d) => d.bounds.y));
  const union = {
    x,
    y,
    width: Math.max(...displays.map((d) => d.bounds.x + d.bounds.width)) - x,
    height: Math.max(...displays.map((d) => d.bounds.y + d.bounds.height)) - y,
  };
  const region = captureRectSchema.parse(regionInput ?? union);
  if (
    region.x < x ||
    region.y < y ||
    region.x + region.width > x + union.width ||
    region.y + region.height > y + union.height
  )
    throw new Error("Região fora da topologia atual.");
  const tiles = displays
    .filter((d) => intersectRect(d.bounds, region))
    .map((d) => {
      const source = sources.find((s) => s.id === d.id);
      if (!source) throw new Error("Fonte de monitor ausente.");
      // Native thumbnail rounding may differ by one pixel per edge, but stretching is not accepted.
      if (Math.abs(source.width - (source.height * d.bounds.width) / d.bounds.height) > 2)
        throw new Error("Proporção do bitmap não corresponde ao monitor.");
      return { id: d.id, bounds: d.bounds, width: source.width, height: source.height };
    });
  if (!tiles.length) throw new Error("Região não contém monitor.");
  if (sources.some((s) => !displays.some((d) => d.id === s.id)))
    throw new Error("Fonte fora da topologia.");
  const scale = outputScale ?? Math.max(...tiles.map((t) => t.width / t.bounds.width));
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw new Error("Escala fora do limite.");
  const width = Math.round(region.width * scale),
    height = Math.round(region.height * scale);
  if (
    width < 1 ||
    height < 1 ||
    width > 32768 ||
    height > 32768 ||
    width * height > CAPTURE_PIXEL_LIMIT
  )
    throw new Error("Imagem excede o limite de dimensões/pixels.");
  const bytes = 4 * (width * height + sources.reduce((total, s) => total + s.width * s.height, 0));
  if (
    !Number.isSafeInteger(memoryLimit) ||
    memoryLimit < 1 ||
    memoryLimit > CAPTURE_MEMORY_LIMIT ||
    bytes > memoryLimit
  )
    throw new Error("Captura excede o orçamento agregado de memória.");
  return {
    topology: topologyKey(displays),
    region,
    scale,
    width,
    height,
    bytes,
    tiles: tiles.map((t) => {
      const clipped = intersectRect(t.bounds, region);
      if (!clipped) throw new Error("Região inválida.");
      const left = Math.round((clipped.x - region.x) * scale),
        top = Math.round((clipped.y - region.y) * scale);
      return {
        ...t,
        destination: {
          x: left,
          y: top,
          width: Math.round((clipped.x + clipped.width - region.x) * scale) - left,
          height: Math.round((clipped.y + clipped.height - region.y) * scale) - top,
        },
      };
    }),
  };
}
/** Nearest physical source pixel; BGRA bytes are preserved, transparent gaps remain zero. */
export function* composeCaptureSteps(
  plan: CapturePlan,
  sources: CaptureBitmap[],
): Generator<void, Uint8Array> {
  // Plans come only from planCapture in main, never directly from renderer IPC.
  unique(sources);
  let bytes = plan.width * plan.height * 4;
  for (const source of sources) {
    sourceSchema.parse({ id: source.id, width: source.width, height: source.height });
    if (source.pixels.byteLength !== source.width * source.height * 4)
      throw new Error("Fonte com bitmap truncado.");
    bytes += source.pixels.byteLength;
  }
  if (bytes > plan.bytes || bytes > CAPTURE_MEMORY_LIMIT)
    throw new Error("Bitmaps excedem o orçamento de memória planejado.");
  for (const tile of plan.tiles) {
    const source = sources.find((s) => s.id === tile.id);
    if (
      !source ||
      source.width !== tile.width ||
      source.height !== tile.height ||
      source.pixels.byteLength !== tile.width * tile.height * 4
    )
      throw new Error("Fonte ausente ou bitmap alterado após planejamento.");
  }
  const result = new Uint8Array(plan.width * plan.height * 4);
  let work = 0;
  for (const tile of plan.tiles) {
    const source = sources.find((s) => s.id === tile.id);
    if (!source) throw new Error("Fonte ausente.");
    const d = tile.destination;
    for (let y = d.y; y < d.y + d.height; y++) {
      for (let x = d.x; x < d.x + d.width; x++) {
        const sx = Math.max(
          0,
          Math.min(
            tile.width - 1,
            Math.floor(
              ((plan.region.x + (x + 0.5) / plan.scale - tile.bounds.x) * tile.width) /
                tile.bounds.width,
            ),
          ),
        );
        const sy = Math.max(
          0,
          Math.min(
            tile.height - 1,
            Math.floor(
              ((plan.region.y + (y + 0.5) / plan.scale - tile.bounds.y) * tile.height) /
                tile.bounds.height,
            ),
          ),
        );
        const offset = (sy * tile.width + sx) * 4;
        result.set(source.pixels.subarray(offset, offset + 4), (y * plan.width + x) * 4);
      }
      work += d.width;
      if (work >= 65536) {
        work = 0;
        yield;
      }
    }
  }
  return result;
}

export function composeCapture(plan: CapturePlan, sources: CaptureBitmap[]): Uint8Array {
  const steps = composeCaptureSteps(plan, sources);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
