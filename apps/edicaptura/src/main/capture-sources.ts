import {
  assertNativeTarget,
  type NativeWindow,
  nativeHandleSchema,
  nativeWindowSchema,
} from "@informach/edi-desktop/windows-capture";
import type { DesktopCapturer, NativeImage } from "electron";
import { z } from "zod";
import {
  CAPTURE_MEMORY_LIMIT,
  CAPTURE_PIXEL_LIMIT,
  type CaptureDisplay,
  topologyKey,
} from "../domain/capture-geometry.ts";

export function windowHandle(sourceId: string): string {
  // Chromium DesktopMediaID serializes native HWND and Aura registry ID, not a
  // boolean current-process flag. Own Electron windows can have Aura IDs > 1.
  // Keep native-picker/session IDs and unset HWNDs outside this Win32 contract.
  const match = /^window:([1-9]\d{0,18}):(0|[1-9]\d{0,18})$/.exec(sourceId);
  if (!match?.[1] || !match[2] || BigInt(match[2]) > 9223372036854775807n)
    throw new Error("Identidade de janela inválida.");
  return nativeHandleSchema.parse(match[1]);
}
export type CaptureSource = {
  id: string;
  name: string;
  displayId: string;
  preview: NativeImage | null;
};
type SourcesApi = Pick<DesktopCapturer, "getSources">;
function validateBitmapBudget(images: NativeImage[]): void {
  let bytes = 0;
  for (const image of images) {
    const size = z
      .object({
        width: z.number().int().min(0).max(32768),
        height: z.number().int().min(0).max(32768),
      })
      .parse(image.getSize());
    if ((size.width === 0) !== (size.height === 0))
      throw new Error("Dimensões de bitmap inválidas.");
    bytes += size.width * size.height * 4;
    if (size.width * size.height > CAPTURE_PIXEL_LIMIT || bytes > CAPTURE_MEMORY_LIMIT / 2)
      throw new Error("Limite agregado de bitmaps excedido.");
  }
}
export async function listCaptureSources(
  api: SourcesApi,
  kind: "screen" | "window",
  options: { preview?: boolean; signal?: AbortSignal } = {},
): Promise<CaptureSource[]> {
  options.signal?.throwIfAborted();
  const before = options.preview
    ? await listCaptureSources(api, kind, { signal: options.signal })
    : null;
  if (before && before.length * 320 * 200 * 4 > CAPTURE_MEMORY_LIMIT / 2)
    throw new Error("Limite agregado de previews excedido.");
  options.signal?.throwIfAborted();
  const sources = await api.getSources({
    types: [kind],
    thumbnailSize: options.preview ? { width: 320, height: 200 } : { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  options.signal?.throwIfAborted();
  if (sources.length > 256) throw new Error("Limite de fontes excedido.");
  if (
    before &&
    (sources.length !== before.length || sources.some((s) => !before.some((b) => b.id === s.id)))
  )
    throw new Error("Fontes alteradas durante a prévia.");
  if (options.preview) validateBitmapBudget(sources.map((s) => s.thumbnail));
  const seen = new Set<string>();
  return sources.map((source) => {
    if (kind === "window") windowHandle(source.id);
    else if (!/^screen:\d+:0$/.test(source.id)) throw new Error("Identidade de monitor inválida.");
    if (seen.has(source.id)) throw new Error("Fonte duplicada.");
    seen.add(source.id);
    return {
      id: source.id,
      name: source.name.slice(0, 512),
      displayId: source.display_id,
      preview: options.preview ? source.thumbnail : null,
    };
  });
}
export type AcquiredScreen = {
  id: string;
  sourceId: string;
  image: NativeImage;
  width: number;
  height: number;
};
export async function acquireScreens(
  api: SourcesApi,
  displays: CaptureDisplay[],
  options: {
    signal?: AbortSignal;
    currentTopology: () => CaptureDisplay[];
    thumbnailSize?: { width: number; height: number };
    admit?: (sizes: { id: string; width: number; height: number }[]) => void;
  },
): Promise<AcquiredScreen[]> {
  const initial = topologyKey(displays);
  options.signal?.throwIfAborted();
  if (topologyKey(options.currentTopology()) !== initial) throw new Error("Topologia alterada.");
  const { width, height } = z
    .object({
      width: z.number().int().positive().max(32768),
      height: z.number().int().positive().max(32768),
    })
    .parse(
      options.thumbnailSize ?? {
        width: Math.ceil(Math.max(...displays.map((d) => d.bounds.width * d.scaleFactor))),
        height: Math.ceil(Math.max(...displays.map((d) => d.bounds.height * d.scaleFactor))),
      },
    );
  // Conservative request bound, before Electron allocates its per-source thumbnails.
  if (
    width > 32768 ||
    height > 32768 ||
    width * height * displays.length * 4 > CAPTURE_MEMORY_LIMIT / 2
  )
    throw new Error("Limite agregado de captura excedido.");
  options.admit?.(displays.map((d) => ({ id: d.id, width, height })));
  const sources = await api.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  options.signal?.throwIfAborted();
  if (topologyKey(options.currentTopology()) !== initial)
    throw new Error("Topologia alterada durante a captura.");
  if (
    sources.length !== displays.length ||
    sources.some((s) => !displays.some((d) => d.id === s.display_id)) ||
    new Set(sources.map((s) => s.id)).size !== sources.length
  )
    throw new Error("Fontes fora da topologia de captura.");
  validateBitmapBudget(sources.map((s) => s.thumbnail));
  let bytes = 0;
  const acquired = displays.map((display) => {
    const candidates = sources.filter((s) => s.display_id === display.id);
    // Empty display_id is deliberately not guessed from source order or name.
    if (candidates.length !== 1) throw new Error("Fonte de monitor indisponível ou ambígua.");
    const source = candidates[0];
    if (!source || !/^screen:\d+:0$/.test(source.id) || source.thumbnail.isEmpty())
      throw new Error("Bitmap de monitor indisponível.");
    const size = source.thumbnail.getSize();
    z.object({
      width: z.number().int().positive().max(32768),
      height: z.number().int().positive().max(32768),
    }).parse(size);
    bytes += size.width * size.height * 4;
    if (size.width * size.height > CAPTURE_PIXEL_LIMIT || bytes > CAPTURE_MEMORY_LIMIT / 2)
      throw new Error("Limite agregado de bitmaps excedido.");
    return { id: display.id, sourceId: source.id, image: source.thumbnail, ...size };
  });
  options.admit?.(acquired.map(({ id, width, height }) => ({ id, width, height })));
  return acquired;
}
export async function acquireWindow(
  api: SourcesApi,
  target: NativeWindow,
  options: {
    signal?: AbortSignal;
    readTarget: (handle: string, signal?: AbortSignal) => Promise<NativeWindow>;
  },
): Promise<NativeImage> {
  target = nativeWindowSchema.parse(target);
  options.signal?.throwIfAborted();
  assertNativeTarget(target, await options.readTarget(target.handle, options.signal));
  const { width, height } = target.bounds;
  if (
    width > 32768 ||
    height > 32768 ||
    width * height > CAPTURE_PIXEL_LIMIT ||
    width * height * 4 > CAPTURE_MEMORY_LIMIT / 2
  )
    throw new Error("Limite de janela excedido.");
  // Electron captures all window thumbnails in this API; reserve for every enumerated source.
  const candidates = await listCaptureSources(api, "window", { signal: options.signal });
  if (!candidates.some((s) => windowHandle(s.id) === target.handle))
    throw new Error("Janela não disponível para captura.");
  if (candidates.length * width * height * 4 > CAPTURE_MEMORY_LIMIT / 2)
    throw new Error("Limite agregado de janelas excedido.");
  options.signal?.throwIfAborted();
  const sources = await api.getSources({
    types: ["window"],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  options.signal?.throwIfAborted();
  if (
    sources.length !== candidates.length ||
    sources.some((s) => !candidates.some((c) => c.id === s.id))
  )
    throw new Error("Fontes de janela alteradas durante a captura.");
  validateBitmapBudget(sources.map((s) => s.thumbnail));
  assertNativeTarget(target, await options.readTarget(target.handle, options.signal));
  options.signal?.throwIfAborted();
  const matches = sources.filter((s) => windowHandle(s.id) === target.handle);
  const source = matches[0];
  if (matches.length !== 1 || !source || source.thumbnail.isEmpty())
    throw new Error("Janela não disponível para captura.");
  const size = source.thumbnail.getSize();
  if (
    size.width < 1 ||
    size.height < 1 ||
    size.width > 32768 ||
    size.height > 32768 ||
    size.width * size.height > CAPTURE_PIXEL_LIMIT ||
    size.width * size.height * 4 > CAPTURE_MEMORY_LIMIT / 2
  )
    throw new Error("Bitmap de janela excede o limite.");
  return source.thumbnail;
}
