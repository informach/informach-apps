import { type Asset, assetDataUri, assetFontFamily } from "@informach/edi-motion/assets";
import {
  createVisualSvgPlayerAsync,
  type InteractiveDocument,
} from "@informach/edi-motion/runtime";

export interface RasterFrameSource {
  readonly width: number;
  readonly height: number;
  /** Moves the shared player to `seconds` on the clip clock and draws that frame. */
  render(seconds: number): Promise<OffscreenCanvasRenderingContext2D>;
  destroy(): Promise<void>;
}

function fontFaces(assets: readonly Asset[]) {
  return assets
    .flatMap((asset) =>
      asset.kind === "font"
        ? [
            `@font-face{font-family:"${assetFontFamily(asset)}";src:url(${assetDataUri(asset)}) format("${asset.mime === "font/otf" ? "opentype" : "truetype"}");font-weight:${asset.weight};font-style:${asset.italic ? "italic" : "normal"}}`,
          ]
        : [],
    )
    .join("");
}

/** Each frame is the live SVG of the same visual player used by Testar, HTML and React,
 * serialized with its fonts embedded and decoded as an image. Chromium resolves `decode()`
 * only after data-URI fonts inside an SVG image load, so text never falls back mid-export. */
export async function createRasterFrameSource(
  document: InteractiveDocument,
  settings: { width: number; height: number; background: string },
  signal?: AbortSignal,
): Promise<RasterFrameSource> {
  const { width, height } = settings,
    host = globalThis.document.createElement("div"),
    root = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-${width + 1000}px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;contain:strict`;
  // Pixel attributes, not CSS: the serialized markup must carry its own size into the image.
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  host.append(root);
  globalThis.document.body.append(host);
  let player: Awaited<ReturnType<typeof createVisualSvgPlayerAsync>> | undefined;
  try {
    player = await createVisualSvgPlayerAsync(
      root,
      document,
      { autoplay: false, respectReducedMotion: false, pauseOffscreen: false },
      signal,
    );
  } catch (error) {
    host.remove();
    throw error;
  }
  const live = player,
    faces = fontFaces(document.assets ?? []),
    canvas = new OffscreenCanvas(width, height),
    context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    await live.destroyAsync();
    host.remove();
    throw new Error("Canvas 2D indisponível para exportar quadros.");
  }
  let clock = 0,
    destroyed = false;
  const serializer = new XMLSerializer();
  return {
    width,
    height,
    async render(seconds) {
      if (destroyed) throw new Error("A fonte de quadros foi encerrada.");
      signal?.throwIfAborted();
      if (!Number.isFinite(seconds) || seconds < clock - 1e-9)
        throw new Error("Quadros raster devem avançar no tempo.");
      // The player accepts at most ten seconds per step; long gaps are split, never skipped.
      for (let rest = seconds - clock; rest > 1e-12; rest -= Math.min(rest, 10))
        live.advance(Math.min(rest, 10));
      clock = seconds;
      root.setAttribute("width", String(width));
      root.setAttribute("height", String(height));
      let markup = serializer.serializeToString(root);
      if (faces)
        markup = markup.replace(/^<svg\b[^>]*>/, (opening) => `${opening}<style>${faces}</style>`);
      const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      try {
        const image = new Image(width, height);
        image.src = url;
        await image.decode();
        signal?.throwIfAborted();
        context.clearRect(0, 0, width, height);
        if (settings.background !== "transparent") {
          context.fillStyle = settings.background;
          context.fillRect(0, 0, width, height);
        }
        context.drawImage(image, 0, 0, width, height);
        return context;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        await live.destroyAsync();
      } finally {
        host.remove();
      }
    },
  };
}
