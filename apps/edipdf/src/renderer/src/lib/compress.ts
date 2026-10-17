import { imageToPdf, mergePdfs, ProtectedPdfError } from "@shared/build";
import { type CompressLevel, compressPdf, type Reencode } from "@shared/compress";
import type { OpenedFile } from "@shared/types";
import { toast, useApp } from "../state/store";
import { buildDoc } from "./actions";
import { finishDraft } from "./editing";
import { getSource } from "./pdf";

const api = window.api;
const busy = (msg: string | null): void => {
  useApp.setState({ busy: msg });
};

/** Downscales and JPEG-encodes an image with the browser's codecs. */
export const canvasReencode: Reencode = async (img, maxSide, quality) => {
  let bitmap: ImageBitmap;
  if (img.kind === "jpeg") {
    bitmap = await createImageBitmap(new Blob([img.bytes as BlobPart], { type: "image/jpeg" }));
  } else {
    const { data, width, height, channels } = img;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += channels) {
      const o = i * 4;
      rgba[o] = data[j];
      rgba[o + 1] = data[j + (channels === 3 ? 1 : 0)];
      rgba[o + 2] = data[j + (channels === 3 ? 2 : 0)];
      rgba[o + 3] = 255;
    }
    bitmap = await createImageBitmap(new ImageData(rgba, width, height));
  }
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // JPEG has no alpha; paint white first so any transparency does not turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
};

export type Level = CompressLevel | "none";

/** Compresses when asked, and never returns something bigger than what came in. */
async function shrink(bytes: Uint8Array, level: Level, label: string): Promise<Uint8Array> {
  if (level === "none") return bytes;
  busy(`Compactando ${label}…`);
  const res = await compressPdf(
    bytes,
    level,
    canvasReencode,
    (i, n) => n > 1 && busy(`Compactando ${label}: imagem ${Math.min(i + 1, n)} de ${n}…`),
  );
  return res.bytes.length < bytes.length ? res.bytes : bytes;
}

export interface Outcome {
  name: string;
  path?: string;
  before: number;
  after: number;
  error?: string;
}

const fileName = (p: string): string => p.split(/[\\/]/).pop() ?? p;
const reason = (err: unknown): string =>
  err instanceof ProtectedPdfError ? "PDF protegido por senha" : "Não foi possível ler o arquivo";

/** Compresses each file and saves "<nome> (compactado).pdf" next to it. */
export async function compressFiles(
  files: OpenedFile[],
  level: CompressLevel,
  onEach?: (o: Outcome) => void,
): Promise<Outcome[]> {
  const out: Outcome[] = [];
  try {
    for (const f of files) {
      let o: Outcome;
      try {
        const bytes = await shrink(f.bytes, level, f.name);
        const path = await api.writeUnique(
          f.path.replace(/\.pdf$/i, "") + " (compactado).pdf",
          bytes,
        );
        o = { name: f.name, path, before: f.bytes.length, after: bytes.length };
      } catch (err) {
        console.error(err);
        o = { name: f.name, before: f.bytes.length, after: f.bytes.length, error: reason(err) };
      }
      out.push(o);
      onEach?.(o);
    }
  } finally {
    busy(null);
  }
  return out;
}

/** Saves a compressed copy of an open document (with its edits); the document itself is untouched. */
export async function compressDoc(docId: string, level: CompressLevel): Promise<Outcome | null> {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return null;
  const base = doc.name.replace(/\.pdf$/i, "");
  const path = await api.saveDialog(`${base} (compactado).pdf`);
  if (!path) return null;
  try {
    busy("Preparando…");
    const built = await buildDoc(doc);
    if (!built) return null;
    const original =
      doc.path && doc.primary
        ? (getSource(doc.primary)?.bytes.length ?? built.length)
        : built.length;
    const bytes = await shrink(built, level, doc.name);
    await api.writeFile(path, bytes);
    return { name: fileName(path), path, before: original, after: bytes.length };
  } catch (err) {
    console.error(err);
    toast(`Não foi possível compactar: ${reason(err)}`, { tone: "error" });
    return null;
  } finally {
    busy(null);
  }
}

/** Joins PDFs and images straight into a new file, optionally compressed, without opening it. */
export async function mergeAndSave(files: OpenedFile[], level: Level): Promise<Outcome | null> {
  if (!files.length) return null;
  const path = await api.saveDialog("Combinado.pdf");
  if (!path) return null;
  try {
    busy("Juntando arquivos…");
    const pdfs: Uint8Array[] = [];
    for (const f of files)
      pdfs.push(/\.(png|jpe?g)$/i.test(f.name) ? await imageToPdf(f.bytes) : f.bytes);
    let merged: Uint8Array;
    try {
      merged = await mergePdfs(pdfs);
    } catch (err) {
      // Find which input failed so the message can name it.
      for (let i = 0; i < pdfs.length; i++) {
        try {
          await mergePdfs([pdfs[i]]);
        } catch {
          throw new Error(`"${files[i].name}": ${reason(err)}`);
        }
      }
      throw err;
    }
    const bytes = await shrink(merged, level, "o resultado");
    await api.writeFile(path, bytes);
    return {
      name: fileName(path),
      path,
      before: files.reduce((n, f) => n + f.bytes.length, 0),
      after: bytes.length,
    };
  } catch (err) {
    console.error(err);
    toast(`Não foi possível juntar: ${(err as Error).message}`, { tone: "error" });
    return null;
  } finally {
    busy(null);
  }
}
