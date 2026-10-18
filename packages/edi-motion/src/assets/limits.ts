export const ASSET_BYTES = 4_000_000;
export const CATALOG_BYTES = 4_000_000;
export const ASSET_BASE64_CHARS = Math.ceil(ASSET_BYTES / 3) * 4;
export const IMAGE_PIXELS = 16_000_000;
export const FONT_TABLE_BYTES = 16_000_000;
export const AUDIO_SECONDS = 30;
export function assertAssetBytes(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > ASSET_BYTES)
    throw new Error("Recurso vazio ou maior que 4 MB.");
}
