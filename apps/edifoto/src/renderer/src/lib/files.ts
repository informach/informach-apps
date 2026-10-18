import type { Doc } from "@shared/doc";
import {
  decodeArchive,
  encodeArchive,
  referencedBitmaps,
  validateDimensions,
  validateDocument,
} from "@shared/documentFormat";
import type { SaveKind } from "@shared/types";
import { getBitmap, withBitmapReplacement } from "@/engine/bitmaps";
import { compositor } from "@/engine/compositor";
import { collectDocumentBitmaps, useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { docFromImage, placeImage } from "./ops";
import { isPainting } from "./paint";

/**
 * Files: images in and out, the .edifoto document format and the clipboard.
 *
 * .edifoto layout: "EDIFOTO2" (legado: "EDIFOTO1") + uint32 JSON length + JSON ({ doc, bitmaps: { id: [offset, length] } })
 * followed by the PNG of every bitmap the document uses.
 */

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Não foi possível preparar a imagem. Salve seu trabalho e tente novamente.");
  return context;
}
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

const baseName = (p: string): string =>
  p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1).replace(/\.[^.]+$/, "");
const mimeOf = (p: string): string => {
  const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
  return ext === "jpg" ? "image/jpeg" : `image/${ext}`;
};

export const isImagePath = (p: string): boolean => IMAGE_EXT.test(p);
export const isDocPath = (p: string): boolean => /\.edifoto$/i.test(p);

/** Decodes image bytes (EXIF rotation applied) into a canvas, rejecting dimensions beyond the editor/GPU limits. */
export async function decodeImage(
  bytes: Uint8Array | Blob,
  mime = "image/png",
): Promise<HTMLCanvasElement> {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const max = compositor().maxTexture;
  try {
    validateDimensions(bmp.width, bmp.height, max);
  } catch (error) {
    bmp.close();
    throw error;
  }
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  context2d(c).drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
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
export async function openPath(path: string, check: () => void = () => {}): Promise<void> {
  if (isPainting()) throw new Error("Termine o traço antes de abrir outra imagem.");
  const previous = useDoc.getState();
  const assertUnchanged = (): void => {
    const current = useDoc.getState();
    if (
      current.doc?.id !== previous.doc?.id ||
      current.stateId !== previous.stateId ||
      current.revision !== previous.revision
    )
      throw new Error(
        "A edição mudou durante a abertura. Tente abrir novamente; seu trabalho foi preservado.",
      );
  };
  if (isDocPath(path)) {
    const { doc, bitmaps } = await parseDocument(await window.api.readFile(path));
    assertUnchanged();
    check();
    withBitmapReplacement(bitmaps, () => useDoc.getState().load(doc, { filePath: path }));
  } else {
    const canvas = await readImageFile(path);
    assertUnchanged();
    check();
    withBitmapReplacement(new Map(), () =>
      useDoc.getState().load(docFromImage(canvas, canvas.width, canvas.height, baseName(path)), {
        sourcePath: path,
      }),
    );
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
  const previous = useDoc.getState();
  if (!previous.doc) throw new Error("Abra ou crie uma imagem primeiro.");
  const images: { path: string; canvas: HTMLCanvasElement }[] = [];
  for (const path of paths) {
    if (!isImagePath(path))
      throw new Error(
        "Para inserir como camada, escolha uma imagem PNG, JPEG, WebP, GIF, BMP ou AVIF.",
      );
    images.push({ path, canvas: await readImageFile(path) });
  }
  if (
    useDoc.getState().doc?.id !== previous.doc.id ||
    useDoc.getState().initialStateId !== previous.initialStateId
  )
    throw new Error("A imagem aberta mudou. Insira os arquivos novamente.");
  const ids: string[] = [];
  for (const { path: p, canvas: c } of images) {
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
        void b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject);
      },
      type,
      quality,
    ),
  );

/** Snapshot every mutable canvas synchronously before the first async encoder. */
export function documentSnapshot(doc: Doc): { doc: Doc; canvases: Map<string, HTMLCanvasElement> } {
  if (isPainting()) throw new Error("Termine o traço antes de salvar ou trocar de imagem.");
  const model = validateDocument(structuredClone(doc));
  const canvases = new Map<string, HTMLCanvasElement>();
  for (const id of referencedBitmaps(model)) {
    const bitmap = getBitmap(id);
    if (!bitmap)
      throw new Error("Uma imagem ou máscara está ausente. O arquivo anterior foi preservado.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.canvas.width;
    canvas.height = bitmap.canvas.height;
    context2d(canvas).drawImage(bitmap.canvas, 0, 0);
    canvases.set(id, canvas);
  }
  return { doc: model, canvases };
}
export async function encodeSnapshot(
  snapshot: ReturnType<typeof documentSnapshot>,
): Promise<Uint8Array> {
  const bitmaps = new Map<string, Uint8Array>();
  for (const [id, canvas] of snapshot.canvases) bitmaps.set(id, await canvasToBytes(canvas));
  return encodeArchive(snapshot.doc, bitmaps);
}
export async function serializeDocument(doc: Doc): Promise<Uint8Array> {
  return encodeSnapshot(documentSnapshot(doc));
}
export async function parseDocument(
  bytes: Uint8Array,
): Promise<{ doc: Doc; bitmaps: Map<string, HTMLCanvasElement> }> {
  const archive = decodeArchive(bytes);
  validateDimensions(archive.doc.width, archive.doc.height, compositor().maxTexture);
  const bitmaps = new Map<string, HTMLCanvasElement>();
  const dimensions = new Map<string, [number, number]>();
  for (const layer of archive.doc.layers) {
    if (layer.kind === "raster") dimensions.set(layer.bitmap, [layer.width, layer.height]);
    if (layer.mask) dimensions.set(layer.mask.bitmap, [archive.doc.width, archive.doc.height]);
  }
  for (const [id, chunk] of archive.bitmaps) {
    // Inspect PNG dimensions before allocating/decompressing the image.
    if (
      chunk.length < 33 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => chunk[i] === byte) ||
      new TextDecoder().decode(chunk.subarray(12, 16)) !== "IHDR"
    )
      throw new Error("O projeto contém uma imagem inválida.");
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const width = view.getUint32(16),
      height = view.getUint32(20),
      expected = dimensions.get(id);
    validateDimensions(width, height, compositor().maxTexture);
    if (view.getUint32(8) !== 13 || !expected || width !== expected[0] || height !== expected[1])
      throw new Error("As dimensões de uma imagem não correspondem ao projeto.");
    const bmp = await createImageBitmap(new Blob([new Uint8Array(chunk)], { type: "image/png" }));
    try {
      validateDimensions(bmp.width, bmp.height, compositor().maxTexture);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      context2d(canvas).drawImage(bmp, 0, 0);
      bitmaps.set(id, canvas);
    } finally {
      bmp.close();
    }
  }
  for (const layer of archive.doc.layers) {
    if (layer.kind === "raster") {
      const c = bitmaps.get(layer.bitmap);
      if (!c || c.width !== layer.width || c.height !== layer.height)
        throw new Error("As dimensões de uma imagem não correspondem ao projeto.");
    }
    if (layer.mask) {
      const c = bitmaps.get(layer.mask.bitmap);
      if (!c || c.width !== archive.doc.width || c.height !== archive.doc.height)
        throw new Error("As dimensões de uma máscara não correspondem ao projeto.");
    }
  }
  return { doc: archive.doc, bitmaps };
}
let saveQueue: Promise<void> = Promise.resolve();
export async function saveDocument(saveAs = false): Promise<boolean> {
  const s = useDoc.getState();
  if (!s.doc) return false;
  let path = saveAs ? null : s.filePath;
  if (!path) path = await window.api.pickSavePath(`${s.doc.name}.edifoto`, "doc");
  if (!path) return false;
  if (
    useDoc.getState().doc?.id !== s.doc.id ||
    useDoc.getState().initialStateId !== s.initialStateId
  )
    throw new Error("A imagem mudou enquanto o diálogo estava aberto. Salve novamente.");
  await writeDocument(path);
  return true;
}

export async function writeDocument(path: string): Promise<void> {
  const state = useDoc.getState();
  if (!state.doc) throw new Error("Nenhuma imagem aberta.");
  const snapshot = documentSnapshot(state.doc),
    docId = state.doc.id,
    stateId = state.stateId,
    workspaceId = state.initialStateId;
  const operation = async (): Promise<void> => {
    useUi.getState().toast("Salvando…");
    await window.api.writeFile(path, await encodeSnapshot(snapshot));
    useDoc.getState().markSaved(path, docId, stateId, workspaceId);
    if (useDoc.getState().initialStateId === workspaceId && useDoc.getState().stateId === stateId)
      remember(path);
    else await window.api.addRecent({ path, name: snapshot.doc.name, openedAt: Date.now() });
    useUi.getState().toast("Projeto salvo.", "ok");
    collectDocumentBitmaps();
  };
  const pending = saveQueue.then(operation, operation);
  saveQueue = pending.then(
    () => {},
    () => {},
  );
  return pending;
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
  validateDimensions(
    Math.round(doc.width * spec.scale),
    Math.round(doc.height * spec.scale),
    compositor().maxTexture,
  );
  let c = compositor().renderToCanvas(doc, { scale: spec.scale });
  if (spec.format === "jpeg") {
    const flat = document.createElement("canvas");
    flat.width = c.width;
    flat.height = c.height;
    const ctx = context2d(flat);
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

export async function exportTo(
  path: string,
  spec: ExportSpec,
  check: () => void = () => {},
): Promise<string> {
  const ext = spec.format === "jpeg" ? "jpg" : spec.format;
  const extension = path.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase();
  const compatible = extension === ext || (spec.format === "jpeg" && extension === "jpeg");
  if (extension && !compatible)
    throw new Error(
      "A extensão do arquivo não corresponde ao formato. Escolha o formato e o destino novamente.",
    );
  const out = extension ? path : `${path}.${ext}`;
  const bytes = await renderExport(spec);
  check();
  await window.api.writeFile(out, bytes);
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
  const previous = useDoc.getState();
  const c = await decodeImage(file);
  if (
    useDoc.getState().initialStateId !== previous.initialStateId ||
    useDoc.getState().doc?.id !== previous.doc?.id
  )
    throw new Error("A imagem mudou durante a colagem. Cole novamente.");
  if (useDoc.getState().doc) placeImage(c, c.width, c.height, "Colado");
  else {
    withBitmapReplacement(new Map(), () =>
      useDoc.getState().load(docFromImage(c, c.width, c.height, "Imagem colada")),
    );
    useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 }));
  }
  return true;
}
