import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { type FontCharacterMap, UnsupportedCharacterMapError } from "./cmap";
import {
  type FontLayoutScripts,
  inspectFont,
  inspectFontCharacterMap,
  inspectFontLayoutScripts,
  UnsupportedLayoutTableError,
} from "./font";
import { ASSET_BASE64_CHARS, ASSET_BYTES, CATALOG_BYTES, IMAGE_PIXELS } from "./limits";
import { inspectPng, validatePngData } from "./png";
import { inspectWav } from "./wav";
import { isXmlText } from "./xmlText";

export const assetIdSchema = z.string().regex(/^asset-[0-9a-f]{64}$/);
const common = {
  id: assetIdSchema,
  name: z.string().trim().min(1).max(120),
  byteLength: z.number().int().min(1).max(ASSET_BYTES),
  data: z.string().min(4).max(ASSET_BASE64_CHARS),
};
export const imageAssetSchema = z.strictObject({
  ...common,
  kind: z.literal("image"),
  mime: z.literal("image/png"),
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
});
export const audioAssetSchema = z.strictObject({
  ...common,
  kind: z.literal("audio"),
  mime: z.literal("audio/wav"),
  channels: z.union([z.literal(1), z.literal(2)]),
  sampleRate: z.number().int().min(8000).max(48000),
  frames: z.number().int().min(1).max(1440000),
});
export const fontAssetSchema = z.strictObject({
  ...common,
  kind: z.literal("font"),
  mime: z.enum(["font/ttf", "font/otf"]),
  format: z.enum(["truetype", "opentype"]),
  family: z.string().min(1).max(120),
  unitsPerEm: z.number().int().min(16).max(16384),
  glyphs: z.number().int().min(1).max(65535),
  weight: z.number().int().min(1).max(1000),
  italic: z.boolean(),
  embedding: z.number().int().min(0).max(65535),
  rightsConfirmed: z.literal(true),
  notice: z.string().max(16000).refine(isXmlText, "Aviso deve ser texto XML válido."),
  licenseNotice: z.string().max(16000).refine(isXmlText, "Aviso deve ser texto XML válido."),
});
export const assetSchema = z.discriminatedUnion("kind", [
  imageAssetSchema,
  audioAssetSchema,
  fontAssetSchema,
]);
export type Asset = z.infer<typeof assetSchema>;
export type ImageAsset = z.infer<typeof imageAssetSchema>;
export type AudioAsset = z.infer<typeof audioAssetSchema>;
export type FontAsset = z.infer<typeof fontAssetSchema>;
// Parsing during authoring must not re-hash/decode unchanged megabyte blobs.
// Weak ownership retains no project by itself; the exact data and structural
// metadata are compared after schema validation, so mutation never bypasses it.
interface ValidatedAsset {
  data: string;
  metadata: string;
  characterMap?: FontCharacterMap;
  unsupportedCharacterMap?: UnsupportedCharacterMapError;
  layoutScripts?: FontLayoutScripts;
  unsupportedLayout?: UnsupportedLayoutTableError;
}
const validated = new WeakMap<object, ValidatedAsset>();
function metadata(asset: Asset) {
  const { data: _data, name: _name, ...fields } = asset;
  return JSON.stringify(fields);
}
export function assetId(bytes: Uint8Array) {
  return `asset-${bytesToHex(sha256(bytes))}`;
}
/** Shares the exact verified-byte entry across schema clones/renames without
 * a global hash cache that could retain discarded projects or stale mutation. */
export function fontCharacterMap(input: FontAsset): FontCharacterMap {
  const asset = parseAsset(input);
  if (asset.kind !== "font") throw new Error("Cobertura requer recurso de fonte.");
  const entry = validated.get(asset);
  if (!entry) throw new Error("Validação da fonte não disponibilizou sua identidade.");
  if (entry.unsupportedCharacterMap) throw entry.unsupportedCharacterMap;
  if (!entry.characterMap) {
    try {
      entry.characterMap = inspectFontCharacterMap(decodeAssetData(asset.data));
    } catch (error) {
      if (error instanceof UnsupportedCharacterMapError) entry.unsupportedCharacterMap = error;
      throw error;
    }
  }
  return entry.characterMap;
}
/** GSUB/GPOS scripts of the same verified bytes, cached with the cmap entry. */
export function fontLayoutScripts(input: FontAsset): FontLayoutScripts {
  const asset = parseAsset(input);
  if (asset.kind !== "font") throw new Error("Shaping requer recurso de fonte.");
  const entry = validated.get(asset);
  if (!entry) throw new Error("Validação da fonte não disponibilizou sua identidade.");
  if (entry.unsupportedLayout) throw entry.unsupportedLayout;
  if (!entry.layoutScripts) {
    try {
      entry.layoutScripts = inspectFontLayoutScripts(decodeAssetData(asset.data));
    } catch (error) {
      if (error instanceof UnsupportedLayoutTableError) entry.unsupportedLayout = error;
      throw error;
    }
  }
  return entry.layoutScripts;
}
export function decodeAssetData(data: string): Uint8Array {
  if (data.length > ASSET_BASE64_CHARS || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    throw new Error("Base64 de recurso inválido/excessivo.");
  const binary = atob(data);
  if (!binary.length || binary.length > ASSET_BYTES || btoa(binary) !== data)
    throw new Error("Base64 de recurso não canônico ou excessivo.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
export function encodeAssetData(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > ASSET_BYTES) throw new Error("Recurso vazio ou excessivo.");
  // Small blocks avoid argument-stack limits on multi-megabyte files.
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(""));
}
export function parseAsset(input: unknown): Asset {
  const asset = assetSchema.parse(input, { jitless: true }),
    signature = metadata(asset),
    cached = typeof input === "object" && input !== null ? validated.get(input) : undefined;
  if (cached?.data === asset.data && cached.metadata === signature) {
    validated.set(asset, cached);
    return asset;
  }
  const bytes = decodeAssetData(asset.data);
  if (bytes.length !== asset.byteLength || asset.id !== assetId(bytes))
    throw new Error("Integridade/tamanho do recurso não corresponde aos bytes.");
  if (asset.kind === "image") {
    const image = inspectPng(bytes, true);
    validatePngData(bytes, image);
    if (asset.width !== image.width || asset.height !== image.height)
      throw new Error("Dimensões do recurso não correspondem à imagem.");
  } else if (asset.kind === "audio") {
    const audio = inspectWav(bytes);
    if (
      asset.channels !== audio.channels ||
      asset.sampleRate !== audio.sampleRate ||
      asset.frames !== audio.frames
    )
      throw new Error("Metadados do recurso não correspondem ao áudio.");
  } else {
    const font = inspectFont(bytes);
    if (
      asset.mime !== (font.format === "truetype" ? "font/ttf" : "font/otf") ||
      Object.entries(font).some(([key, value]) => Reflect.get(asset, key) !== value)
    )
      throw new Error("Metadados da fonte não correspondem aos bytes.");
  }
  const entry = { data: asset.data, metadata: signature };
  if (typeof input === "object" && input !== null) validated.set(input, entry);
  validated.set(asset, entry);
  return asset;
}
/** Bound encoded text/bytes before recursive schema cloning or decoding. */
export function parseAssetCatalog(input: unknown): Asset[] {
  if (!Array.isArray(input) || input.length > 256)
    throw new Error("Catálogo requer até 256 recursos.");
  // Reject the declared aggregate before touching blobs or inflating any PNG.
  // Actual dimensions/samples are still checked against bytes below, so lying
  // metadata cannot bypass the authoritative post-validation budget.
  let declaredPixels = 0,
    declaredSamples = 0;
  for (const value of input) {
    if (typeof value !== "object" || value === null || !("kind" in value)) continue;
    if (
      value.kind === "image" &&
      "width" in value &&
      "height" in value &&
      typeof value.width === "number" &&
      Number.isInteger(value.width) &&
      value.width > 0 &&
      typeof value.height === "number" &&
      Number.isInteger(value.height) &&
      value.height > 0
    )
      declaredPixels += value.width * value.height;
    else if (
      value.kind === "audio" &&
      "frames" in value &&
      "channels" in value &&
      typeof value.frames === "number" &&
      Number.isInteger(value.frames) &&
      value.frames > 0 &&
      (value.channels === 1 || value.channels === 2)
    )
      declaredSamples += value.frames * value.channels;
    if (declaredPixels > IMAGE_PIXELS || declaredSamples > 2_880_000)
      throw new Error("Catálogo excede orçamento de pixels/amostras antes da decodificação.");
  }
  let encoded = 0;
  for (const value of input)
    if (
      typeof value === "object" &&
      value !== null &&
      "data" in value &&
      typeof value.data === "string"
    ) {
      encoded += value.data.length;
      if (
        value.data.length > ASSET_BASE64_CHARS ||
        encoded > Math.ceil(CATALOG_BYTES / 3) * 4 + input.length * 4
      )
        throw new Error("Catálogo excede orçamento de bytes.");
    }
  const assets: Asset[] = [],
    ids = new Set<string>();
  let bytes = 0,
    pixels = 0,
    samples = 0;
  for (const value of input) {
    const asset = parseAsset(value);
    if (ids.has(asset.id))
      throw new Error("Recurso duplicado; reutilize sua identidade de conteúdo.");
    ids.add(asset.id);
    bytes += asset.byteLength;
    if (asset.kind === "image") pixels += asset.width * asset.height;
    else if (asset.kind === "audio") samples += asset.frames * asset.channels;
    if (bytes > CATALOG_BYTES || pixels > IMAGE_PIXELS || samples > 2_880_000)
      throw new Error("Catálogo excede orçamento de bytes/pixels/amostras.");
    assets.push(asset);
  }
  return assets;
}
export function assetDataUri(asset: Asset) {
  return `data:${asset.mime};base64,${asset.data}`;
}
export function assetFontFamily(asset: Pick<FontAsset, "id">) {
  return `edi-${asset.id}`;
}
