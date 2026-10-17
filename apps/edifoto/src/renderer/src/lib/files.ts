import type { Doc } from "@shared/doc";
import type { SaveKind } from "@shared/types";
import { adoptCanvas, clearBitmaps, getBitmap } from "@/engine/bitmaps";
import { compositor } from "@/engine/compositor";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { docFromImage, placeImage } from "./ops";

/**
 * Files: images in and out, the .edifoto document format and the clipboard.
 *
 * .edifoto layout: "EDIFOTO1" + uint32 JSON length + JSON ({ doc, bitmaps: { id: [offset, length] } })
 * followed by the PNG of every bitmap the document uses.
 */

const MAGIC = "EDIFOTO1";
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

const baseName = (p: string): string =>
  p
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, "");
const mimeOf = (p: string): string => {
  const ext = p.split(".").pop()!.toLowerCase();
  return ext === "jpg" ? "image/jpeg" : `image/${ext}`;
};

export const isImagePath = (p: string): boolean => IMAGE_EXT.test(p);
export const isDocPath = (p: string): boolean => /\.edifoto$/i.test(p);

/** Decodes image bytes (EXIF rotation applied) into a canvas, shrinking anything the GPU can't hold. */
export async function decodeImage(
  bytes: Uint8Array | Blob,
  mime = "image/png",
): Promise<HTMLCanvasElement> {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const max = compositor().maxTexture;
  const fit = Math.min(1, max / bmp.width, max / bmp.height);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * fit);
  c.height = Math.round(bmp.height * fit);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  if (fit < 1)
    useUi
      .getState()
      .toast(`Imagem reduzida para ${c.width}×${c.height} (limite da placa de vídeo).`);
  return c;
}

export async function readImageFile(path: string): Promise<HTMLCanvasElement> {
  return decodeImage(await window.api.readFile(path), mimeOf(path));
}

function remember(path: string): void {
  const doc = useDoc.getState().doc;
  if (!doc) return;
  let thumb: string | undefined;
  try {
    const c = compositor().renderToCanvas(doc, {
      scale: Math.min(1, 240 / Math.max(doc.width, doc.height)),
    });
    thumb = c.toDataURL("image/jpeg", 0.75);
  } catch {
    /* thumbnails are optional */
  }
  void window.api.addRecent({ path, name: doc.name, openedAt: Date.now(), thumb });
}

/** Opens an image or .edifoto file as the current document. */
export async function openPath(path: string): Promise<void> {
  if (isDocPath(path)) {
    const { doc, bitmaps } = await parseDocument(await window.api.readFile(path));
    clearBitmaps();
    for (const [id, canvas] of bitmaps) adoptCanvas(canvas, id);
    useDoc.getState().load(doc, { filePath: path });
  } else {
    const canvas = await readImageFile(path);
    clearBitmaps();
    useDoc.getState().load(docFromImage(canvas, canvas.width, canvas.height, baseName(path)), {
      sourcePath: path,
    });
  }
  useUi.setState((s) => ({
    fitRequest: s.fitRequest + 1,
    crop: null,
    previewMode: null,
    beforeAfter: false,
    penPoints: [],
    selection: null,
    selectionPreview: null,
    cloneSource: null,
  }));
  remember(path);
}

/** Adds image files as layers of the open document. */
export async function placePaths(paths: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const p of paths) {
    const c = await readImageFile(p);
    ids.push(placeImage(c, c.width, c.height, baseName(p)));
  }
  return ids;
}

/* ----- .edifoto ----- */

const canvasToBytes = (
  c: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    c.toBlob(
      (b) => {
        if (!b) return reject(new Error("Falha ao gerar a imagem."));
        void b.arrayBuffer().then((a) => resolve(new Uint8Array(a)));
      },
      type,
      quality,
    ),
  );

function usedBitmaps(doc: Doc): string[] {
  const ids = new Set<string>();
  for (const l of doc.layers) {
    if (l.kind === "raster") ids.add(l.bitmap);
    if (l.mask) ids.add(l.mask.bitmap);
  }
  return [...ids];
}

export async function serializeDocument(doc: Doc): Promise<Uint8Array> {
  const blobs: Uint8Array[] = [];
  const index: Record<string, [number, number]> = {};
  let offset = 0;
  for (const id of usedBitmaps(doc)) {
    const b = getBitmap(id);
    if (!b) continue;
    const bytes = await canvasToBytes(b.canvas);
    index[id] = [offset, bytes.length];
    blobs.push(bytes);
    offset += bytes.length;
  }
  const json = new TextEncoder().encode(
    JSON.stringify({ format: "edifoto", version: 1, doc, bitmaps: index }),
  );
  const out = new Uint8Array(8 + 4 + json.length + offset);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(8, json.length, true);
  out.set(json, 12);
  let at = 12 + json.length;
  for (const b of blobs) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

export async function parseDocument(
  bytes: Uint8Array,
): Promise<{ doc: Doc; bitmaps: Map<string, HTMLCanvasElement> }> {
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC)
    throw new Error("Este arquivo não é um documento do EdiFoto.");
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len))) as {
    doc: Doc;
    bitmaps: Record<string, [number, number]>;
  };
  const base = 12 + len;
  const bitmaps = new Map<string, HTMLCanvasElement>();
  for (const [id, [off, size]] of Object.entries(meta.bitmaps)) {
    const blob = new Blob([bytes.subarray(base + off, base + off + size) as BlobPart], {
      type: "image/png",
    });
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    bitmaps.set(id, c);
  }
  return { doc: meta.doc, bitmaps };
}

export async function saveDocument(saveAs = false): Promise<boolean> {
  const s = useDoc.getState();
  if (!s.doc) return false;
  let path = saveAs ? null : s.filePath;
  if (!path) path = await window.api.pickSavePath(`${s.doc.name}.edifoto`, "doc");
  if (!path) return false;
  await writeDocument(path);
  return true;
}

export async function writeDocument(path: string): Promise<void> {
  const doc = useDoc.getState().doc;
  if (!doc) throw new Error("Nenhuma imagem aberta.");
  const ui = useUi.getState();
  ui.toast("Salvando…");
  await window.api.writeFile(path, await serializeDocument(doc));
  useDoc.getState().markSaved(path);
  remember(path);
  ui.toast("Documento salvo.", "ok");
}

/* ----- Export ----- */

export interface ExportSpec {
  format: Exclude<SaveKind, "doc">;
  quality: number;
  scale: number;
}

export async function renderExport(spec: ExportSpec): Promise<Uint8Array> {
  const doc = useDoc.getState().doc;
  if (!doc) throw new Error("Nenhuma imagem aberta.");
  let c = compositor().renderToCanvas(doc, { scale: spec.scale });
  if (spec.format === "jpeg") {
    const flat = document.createElement("canvas");
    flat.width = c.width;
    flat.height = c.height;
    const ctx = flat.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(c, 0, 0);
    c = flat;
  }
  const type =
    spec.format === "png" ? "image/png" : spec.format === "jpeg" ? "image/jpeg" : "image/webp";
  const bytes = await canvasToBytes(
    c,
    type,
    spec.format === "png" ? undefined : spec.quality / 100,
  );
  return bytes;
}

export async function exportTo(path: string, spec: ExportSpec): Promise<string> {
  const ext = spec.format === "jpeg" ? "jpg" : spec.format;
  const out = path.replace(/\.[^.\\/]+$/, "") + `.${ext}`;
  await window.api.writeFile(out, await renderExport(spec));
  return out;
}

/* ----- Clipboard ----- */

export async function copyComposite(): Promise<void> {
  const doc = useDoc.getState().doc;
  if (!doc) return;
  const c = compositor().renderToCanvas(doc);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) return;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  useUi.getState().toast("Imagem copiada. Cole onde quiser (Ctrl+V).", "ok");
}

/** Ctrl+V: an image on the clipboard becomes a layer (or a new document when none is open). */
export async function pasteImage(e: ClipboardEvent): Promise<boolean> {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (!file) return false;
  const c = await decodeImage(file);
  if (useDoc.getState().doc) placeImage(c, c.width, c.height, "Colado");
  else {
    clearBitmaps();
    useDoc.getState().load(docFromImage(c, c.width, c.height, "Imagem colada"));
    useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));
  }
  return true;
}
