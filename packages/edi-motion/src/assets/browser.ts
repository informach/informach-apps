import {
  type Asset,
  type AudioAsset,
  assetFontFamily,
  decodeAssetData,
  type FontAsset,
  type ImageAsset,
  parseAsset,
  parseAssetCatalog,
} from "./model";

export interface BrowserAssets {
  readonly assets: ReadonlyMap<string, Asset>;
  readonly images: ReadonlyMap<string, ImageBitmap>;
  readonly audio: ReadonlyMap<string, AudioAsset>;
  readonly fonts: ReadonlyMap<string, FontFace>;
  destroy(): void;
}
export async function decodeImageAsset(
  asset: ImageAsset,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  signal?.throwIfAborted();
  const checked = parseAsset(asset);
  if (checked.kind !== "image") throw new Error("Recurso de imagem esperado.");
  const bytes = new Uint8Array(decodeAssetData(asset.data)),
    blob = new Blob([bytes.buffer], { type: asset.mime }),
    image = await createImageBitmap(blob);
  try {
    signal?.throwIfAborted();
    if (image.width !== asset.width || image.height !== asset.height)
      throw new Error("Imagem decodificada não corresponde às dimensões validadas.");
    return image;
  } catch (error) {
    image.close();
    throw error;
  }
}
/** Shared root ownership: components reuse decoded images, never decode their
 * own copies. All in-flight jobs settle before error cleanup, avoiding leaks. */
export async function loadBrowserAssets(
  input: unknown,
  signal?: AbortSignal,
  fontSet: FontFaceSet = document.fonts,
): Promise<BrowserAssets> {
  const parsed = parseAssetCatalog(input),
    assets = new Map(parsed.map((asset) => [asset.id, asset])),
    images = new Map<string, ImageBitmap>(),
    audio = new Map<string, AudioAsset>(),
    fonts = new Map<string, FontFace>(),
    owner = new AbortController();
  const abort = () => owner.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  let cursor = 0,
    destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    owner.abort();
    for (const image of images.values()) image.close();
    images.clear();
    for (const font of fonts.values()) fontSet.delete(font);
    fonts.clear();
    audio.clear();
    assets.clear();
  };
  try {
    const tasks = Array.from({ length: Math.min(4, parsed.length) }, async () => {
      while (cursor < parsed.length) {
        owner.signal.throwIfAborted();
        const asset = parsed[cursor++];
        if (!asset) throw new Error("Recurso desapareceu durante a carga.");
        try {
          if (asset.kind === "image")
            images.set(asset.id, await decodeImageAsset(asset, owner.signal));
          else if (asset.kind === "audio") audio.set(asset.id, asset);
          else {
            const face = await decodeFontAsset(asset, owner.signal);
            fonts.set(asset.id, face);
          }
        } catch (error) {
          owner.abort(error);
          throw error;
        }
      }
    });
    const results = await Promise.allSettled(tasks),
      failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    owner.signal.throwIfAborted();
    for (const font of fonts.values()) fontSet.add(font);
    return { assets, images, audio, fonts, destroy };
  } catch (error) {
    destroy();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
export async function decodeFontAsset(input: FontAsset, signal?: AbortSignal): Promise<FontFace> {
  signal?.throwIfAborted();
  const asset = parseAsset(input);
  if (asset.kind !== "font") throw new Error("Recurso de fonte esperado.");
  const font = new FontFace(
    assetFontFamily(asset),
    new Uint8Array(decodeAssetData(asset.data)).buffer,
    { weight: String(asset.weight), style: asset.italic ? "italic" : "normal" },
  );
  await font.load();
  signal?.throwIfAborted();
  return font;
}
