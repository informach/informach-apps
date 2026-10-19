import {
  PDFArray,
  PDFBool,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from "pdf-lib";
import { decodeBoundedPdfStream } from "./bounded-pdf-stream.ts";
import { loadPdf } from "./build.ts";
import { imagePixelBudgets } from "./image-usage.ts";

/** An image pulled out of the PDF, ready to be re-encoded by the host (canvas in the app). */
export type SourceImage =
  | { kind: "jpeg"; bytes: Uint8Array; width: number; height: number }
  | { kind: "pixels"; data: Uint8Array; width: number; height: number; channels: 1 | 3 };

export interface Encoded {
  /** JPEG bytes (RGB). */
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Downscales so the longest side is at most `maxSide` pixels and encodes as JPEG at `quality` (0–1). */
export type Reencode = (
  img: SourceImage,
  maxSide: number,
  quality: number,
) => Promise<Encoded | null>;

export type CompressLevel = "light" | "balanced" | "strong";
export interface CompressProfile {
  dpi: number;
  quality: number;
}

/** DPI uses each image's largest physical placement, including nested forms and shared uses. */
export const COMPRESS_LEVELS: Record<
  CompressLevel,
  { label: string; hint: string; dpi: number; quality: number }
> = {
  light: { label: "Leve", hint: "Qualidade alta · imagens até 200 dpi", dpi: 200, quality: 0.85 },
  balanced: {
    label: "Equilibrada",
    hint: "Bom para e-mail · imagens até 150 dpi",
    dpi: 150,
    quality: 0.72,
  },
  strong: { label: "Forte", hint: "Menor arquivo · imagens até 100 dpi", dpi: 100, quality: 0.55 },
};

/**
 * Removes objects that nothing points to any more (deleted pages, replaced images, old
 * cross-reference streams). Pending fonts and images must be flushed before calling this.
 */
export function pruneUnreachable(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Set<PDFRef>();
  const stack: PDFObject[] = [
    ctx.trailerInfo.Root,
    ctx.trailerInfo.Info,
    ctx.trailerInfo.Encrypt,
  ].filter((o): o is PDFObject => !!o);
  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      if (seen.has(o)) continue;
      seen.add(o);
      const target = ctx.lookup(o);
      if (target) stack.push(target);
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref)) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}

/** Reverses PNG row filters (PDF /Predictor 10–15) for 8-bit samples. */
export function unpng(data: Uint8Array, colors: number, columns: number): Uint8Array {
  const bpp = colors;
  const rowLen = colors * columns;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const dst = r * rowLen;
    const prev = dst - rowLen;
    for (let i = 0; i < rowLen; i++) {
      const raw = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[prev + i] : 0;
      const c = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v: number;
      switch (type) {
        case 1:
          v = raw + a;
          break;
        case 2:
          v = raw + b;
          break;
        case 3:
          v = raw + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = raw;
      }
      out[dst + i] = v & 255;
    }
  }
  return out;
}

const num = (o: PDFObject | undefined): number | undefined =>
  o instanceof PDFNumber ? o.asNumber() : undefined;

/** Number of colour channels for colour spaces we can safely re-encode as RGB JPEG. */
function channelsOf(doc: PDFDocument, cs: PDFObject | undefined): 1 | 3 | null {
  const v = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  if (v === PDFName.of("DeviceRGB")) return 3;
  if (v === PDFName.of("DeviceGray")) return 1;
  return null;
}

const filterNames = (f: PDFObject | undefined): string[] | null => {
  if (!f) return [];
  if (f instanceof PDFName) return [f.asString()];
  if (f instanceof PDFArray) {
    const out: string[] = [];
    for (let i = 0; i < f.size(); i++) {
      const n = f.get(i);
      if (!(n instanceof PDFName)) return null;
      out.push(n.asString());
    }
    return out;
  }
  return null;
};

const DECODABLE = new Set([
  "/FlateDecode",
  "/LZWDecode",
  "/ASCII85Decode",
  "/ASCIIHexDecode",
  "/RunLengthDecode",
]);

/** Pulls an image out of its stream, or returns null when it is a kind we leave untouched. */
function extract(doc: PDFDocument, stream: PDFRawStream): SourceImage | null {
  const d = stream.dict;
  const get = (k: string) => d.get(PDFName.of(k));
  const width = num(get("Width"));
  const height = num(get("Height"));
  if (!width || !height || num(get("BitsPerComponent")) !== 8) return null;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 32_000_000 ||
    Math.max(width, height) > 16384
  )
    return null;
  if (get("ImageMask") === PDFBool.True || get("Mask") || get("Decode") || get("SMaskInData"))
    return null;
  const channels = channelsOf(doc, get("ColorSpace"));
  if (!channels) return null;
  const filters = filterNames(get("Filter"));
  if (!filters) return null;
  if (filters.length === 1 && filters[0] === "/DCTDecode") {
    if (get("DecodeParms")) return null;
    return { kind: "jpeg", bytes: stream.contents, width, height };
  }
  if (!filters.every((f) => DECODABLE.has(f))) return null;
  // Small graphics (icons, logos) are not worth the JPEG artefacts.
  if (width * height < 160 * 160) return null;
  let data: Uint8Array;
  try {
    data = decodeBoundedPdfStream(stream, width * height * channels + height);
  } catch {
    return null;
  }
  const parmsRaw = get("DecodeParms");
  const parms =
    parmsRaw instanceof PDFArray
      ? parmsRaw.lookup(parmsRaw.size() - 1)
      : parmsRaw instanceof PDFRef
        ? doc.context.lookup(parmsRaw)
        : parmsRaw;
  if (parms instanceof PDFDict) {
    const predictor = num(parms.get(PDFName.of("Predictor"))) ?? 1;
    if (
      (num(parms.get(PDFName.of("Colors"))) ?? channels) !== channels ||
      (num(parms.get(PDFName.of("Columns"))) ?? width) !== width ||
      (num(parms.get(PDFName.of("BitsPerComponent"))) ?? 8) !== 8
    )
      return null;
    if (predictor >= 10)
      data = unpng(
        data,
        num(parms.get(PDFName.of("Colors"))) ?? channels,
        num(parms.get(PDFName.of("Columns"))) ?? width,
      );
    else if (predictor !== 1) return null;
  }
  if (data.length < width * height * channels) return null;
  return { kind: "pixels", data, width, height, channels };
}

export interface CompressResult {
  pages: number;
  bytes: Uint8Array;
  images: number;
  recompressed: number;
  warnings: string[];
}

export async function compressPdf(
  bytes: Uint8Array,
  level: CompressLevel | CompressProfile,
  reencode: Reencode,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressResult> {
  const doc = await loadPdf(bytes);
  if (!doc.getPageCount()) throw new Error("O PDF não contém páginas para compactar.");
  const ctx = doc.context;
  const { dpi, quality } = typeof level === "string" ? COMPRESS_LEVELS[level] : level;
  if (
    !Number.isFinite(dpi) ||
    dpi < 72 ||
    dpi > 600 ||
    !Number.isFinite(quality) ||
    quality < 0.35 ||
    quality > 1
  )
    throw new Error("Perfil de compactação inválido.");
  const usage = imagePixelBudgets(doc, dpi);

  const images: [PDFRef, PDFRawStream][] = [];
  const softMasks = new Set<PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (
      !(obj instanceof PDFRawStream) ||
      obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")
    )
      continue;
    images.push([ref, obj]);
    const sm = obj.dict.get(PDFName.of("SMask"));
    if (sm instanceof PDFRef) softMasks.add(sm);
  }

  let recompressed = 0,
    transparent = 0,
    unsupported = 0;
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i, images.length);
    const [ref, stream] = images[i];
    // Soft masks must stay single-channel; the JPEG encoder only writes RGB.
    if (softMasks.has(ref) || stream.dict.has(PDFName.of("SMask"))) {
      transparent++;
      continue;
    }
    const budget = usage.budgets.get(ref);
    if (budget === undefined) {
      unsupported++;
      continue;
    }
    const maxSide = Math.max(1, Math.round(budget));
    const src = extract(doc, stream);
    if (!src) {
      unsupported++;
      continue;
    }
    const needsResize = Math.max(src.width, src.height) > maxSide;
    // A JPEG already within the size limit is only redone if it is generously encoded.
    if (
      src.kind === "jpeg" &&
      !needsResize &&
      stream.contents.length < src.width * src.height * 0.35
    )
      continue;
    const out = await reencode(src, maxSide, quality);
    if (!out || out.bytes.length >= stream.contents.length * 0.9) continue;
    const d = stream.dict;
    const keep: Record<string, PDFObject> = {};
    for (const k of ["SMask", "Interpolate", "Intent", "OC", "Metadata", "Name"]) {
      const v = d.get(PDFName.of(k));
      if (v) keep[k] = v;
    }
    const next = ctx.stream(out.bytes, {
      Type: "XObject",
      Subtype: "Image",
      Width: out.width,
      Height: out.height,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
      Filter: "DCTDecode",
      ...keep,
    });
    ctx.assign(ref, next);
    recompressed++;
  }
  onProgress?.(images.length, images.length);

  await doc.flush();
  pruneUnreachable(doc);
  const warnings = usage.warnings;
  if (transparent)
    warnings.push(`${transparent} imagens/máscaras com transparência foram preservadas.`);
  if (unsupported)
    warnings.push(
      `${unsupported} imagens foram preservadas por formato, perfil de cor, tamanho pequeno ou geometria não suportados.`,
    );
  return {
    bytes: await doc.save({ useObjectStreams: true }),
    images: images.length,
    recompressed,
    warnings,
    pages: doc.getPageCount(),
  };
}

export interface TargetCompression {
  pages: number;
  bytes: Uint8Array;
  target?: number;
  targetMet: boolean;
  profile: CompressProfile | null;
  attempts: number;
  warnings: string[];
}

/** Every attempt starts from the same original; JPEG losses never accumulate across attempts. */
export async function compressToTarget(
  bytes: Uint8Array,
  target: number,
  minimum: CompressLevel,
  reencode: Reencode,
  progress?: (attempt: number, total: number, done: number, images: number) => void,
): Promise<TargetCompression> {
  if (!Number.isInteger(target) || target < 1024 || target > 512 * 1024 * 1024)
    throw new Error("A meta deve ficar entre 1 KB e 512 MB.");
  let best = bytes;
  const { bytes: packed, pages } = await packedDocument(bytes);
  if (packed.length < best.length) best = packed;
  if (best.length <= target)
    return {
      bytes: best,
      pages,
      target,
      targetMet: true,
      profile: null,
      attempts: 0,
      warnings: [],
    };
  const floor = COMPRESS_LEVELS[minimum];
  const profiles = [
    { dpi: 200, quality: 0.85 },
    { dpi: 175, quality: 0.8 },
    { dpi: 150, quality: 0.72 },
    { dpi: 125, quality: 0.65 },
    { dpi: 100, quality: 0.55 },
  ].filter((profile) => profile.dpi >= floor.dpi && profile.quality >= floor.quality);
  let chosen: CompressProfile | null = null;
  let warnings: string[] = [];
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const result = await compressPdf(bytes, profile, reencode, (done, images) =>
      progress?.(i + 1, profiles.length, done, images),
    );
    warnings = result.warnings;
    if (result.bytes.length < best.length) {
      best = result.bytes;
      chosen = profile;
    }
    if (best.length <= target)
      return {
        bytes: best,
        pages,
        target,
        targetMet: true,
        profile: chosen,
        attempts: i + 1,
        warnings,
      };
  }
  return {
    bytes: best,
    target,
    targetMet: false,
    profile: chosen,
    attempts: profiles.length,
    warnings,
    pages,
  };
}

/** Shrinks a PDF without touching image quality: drops orphaned objects and repacks with object streams. */
export async function repack(bytes: Uint8Array): Promise<Uint8Array> {
  return (await packedDocument(bytes)).bytes;
}
async function packedDocument(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await loadPdf(bytes);
  if (!doc.getPageCount()) throw new Error("O PDF não contém páginas para compactar.");
  await doc.flush();
  pruneUnreachable(doc);
  return { bytes: await doc.save({ useObjectStreams: true }), pages: doc.getPageCount() };
}

export function formatSize(n: number): string {
  if (n >= 1024 * 1024)
    return `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
