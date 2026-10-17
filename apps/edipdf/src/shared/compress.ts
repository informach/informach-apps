import {
  decodePDFRawStream,
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
import { loadPdf } from "./build.ts";

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

/** dpi is applied to the long side of an A4 page: an image is never shown bigger than a page. */
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

const A4_LONG_INCHES = 11.69;

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
  if (v === PDFName.of("DeviceRGB") || v === PDFName.of("CalRGB")) return 3;
  if (v === PDFName.of("DeviceGray") || v === PDFName.of("CalGray")) return 1;
  if (v instanceof PDFArray && v.size() >= 2) {
    const kind = v.get(0);
    if (kind === PDFName.of("CalRGB")) return 3;
    if (kind === PDFName.of("CalGray")) return 1;
    if (kind === PDFName.of("ICCBased")) {
      const icc = doc.context.lookup(v.get(1));
      const n = icc instanceof PDFStream ? num(icc.dict.get(PDFName.of("N"))) : undefined;
      return n === 3 ? 3 : n === 1 ? 1 : null;
    }
  }
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
    data = decodePDFRawStream(stream).decode();
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
  bytes: Uint8Array;
  images: number;
  recompressed: number;
}

export async function compressPdf(
  bytes: Uint8Array,
  level: CompressLevel,
  reencode: Reencode,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressResult> {
  const doc = await loadPdf(bytes);
  const ctx = doc.context;
  const { dpi, quality } = COMPRESS_LEVELS[level];
  const maxSide = Math.round(dpi * A4_LONG_INCHES);

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

  let recompressed = 0;
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i, images.length);
    const [ref, stream] = images[i];
    // Soft masks must stay single-channel; the JPEG encoder only writes RGB.
    if (softMasks.has(ref)) continue;
    const src = extract(doc, stream);
    if (!src) continue;
    const needsResize = Math.max(src.width, src.height) > maxSide;
    // A JPEG already within the size limit is only redone if it is generously encoded.
    if (
      src.kind === "jpeg" &&
      !needsResize &&
      stream.contents.length < src.width * src.height * 0.35
    )
      continue;
    const out = await reencode(src, maxSide, quality).catch(() => null);
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
  return { bytes: await doc.save({ useObjectStreams: true }), images: images.length, recompressed };
}

/** Shrinks a PDF without touching image quality: drops orphaned objects and repacks with object streams. */
export async function repack(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  await doc.flush();
  pruneUnreachable(doc);
  return doc.save({ useObjectStreams: true });
}

export function formatSize(n: number): string {
  if (n >= 1024 * 1024)
    return `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
