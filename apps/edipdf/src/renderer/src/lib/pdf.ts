import { PdfEngineError } from "@shared/engine-contracts";
import { type FieldMask, fieldMask } from "@shared/form-authoring";
import {
  type Annot,
  type Box,
  type FontKey,
  type PageRef,
  type SourcePageInfo,
  totalRotation,
  uid,
} from "@shared/model";
import { takeEditableAnnotations } from "@shared/pdf-annotations";
import { renderBudget } from "@shared/render-budget";
import { type WidgetFont, widgetFonts } from "@shared/widget-font";
import { widgetControlGeometry } from "@shared/widget-geometry";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { z } from "zod";
import { runEngine } from "./local-engine";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (dir: string): string => new URL(`./pdfjs/${dir}/`, location.href).href;

/** A loaded source PDF. Kept outside React state: it holds the bytes and the pdf.js proxy. */
export interface Source {
  id: string;
  name: string;
  originPath?: string;
  fieldMasks?: Record<string, FieldMask>;
  fieldLabels?: Record<string, string>;
  fieldFonts?: Map<string, WidgetFont>;
  tabOrders?: ("rows" | "columns" | undefined)[];
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  info: SourcePageInfo[];
  /** Original was encrypted; edits use decrypted local bytes and saving requires a copy. */
  encrypted: boolean;
  readOnly: boolean;
  canPrint: boolean;
  canCopy: boolean;
  readOnlyReason?: string;
  signed: boolean;
  /** Only in memory for restricted reading; never serialized to recovery/preferences. */
  password?: string;
  annotations: Map<number, Annot[]>;
}

const sources = new Map<string, Source>();
const sourceHolds = new Map<string, number>();
const sourceReleasePending = new Set<string>();
export const getSource = (id: string): Source | undefined => sources.get(id);

/** A task owns live rendering sources until it finishes, even if their last workspace tab closes. */
export function holdSourcesForTask(ids: string[]): () => void {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !sources.has(id)))
    throw new Error("Uma fonte da tarefa está indisponível.");
  for (const id of unique) sourceHolds.set(id, (sourceHolds.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const id of unique) {
      const count = sourceHolds.get(id);
      if (count === undefined || count < 1) throw new Error("Retenção de fonte inconsistente.");
      if (count > 1) sourceHolds.set(id, count - 1);
      else {
        sourceHolds.delete(id);
        if (sourceReleasePending.delete(id)) releaseSource(id);
      }
    }
  };
}

export class PasswordCancelled extends Error {}

/**
 * Loads a PDF. `askPassword` is called (repeatedly, with `retry` true after a wrong one) when
 * the file is protected; returning null cancels.
 */
export async function loadSource(
  bytes: Uint8Array,
  name: string,
  askPassword: (retry: boolean) => Promise<string | null>,
  options: { output?: boolean } = {},
): Promise<Source> {
  let encrypted = false;
  let readOnly = false;
  let signed = false;
  let formatReadOnlyReason: string | undefined;
  const inspectFormat = (document: PDFDocument) => {
    if (document.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict)?.has(PDFName.of("XFA")))
      return "Formulário XFA disponível somente para leitura.";
    if (
      document
        .getPages()
        .some(
          (page) =>
            (page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1) !== 1,
        )
    )
      return "PDF com unidade de página personalizada disponível somente para leitura.";
    return undefined;
  };
  let viewingPassword: string | undefined;
  let viewingBytes = bytes;
  let annotations = new Map<number, Annot[]>();
  const candidate = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });
  if (!candidate.isEncrypted) {
    const editable = candidate;
    formatReadOnlyReason = inspectFormat(editable);
    readOnly = !!formatReadOnlyReason;
    signed = editable.context
      .enumerateIndirectObjects()
      .some(
        ([, object]) =>
          object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Sig"),
      );
    annotations = options.output || readOnly ? new Map() : takeEditableAnnotations(editable);
    if (annotations.size) viewingBytes = await editable.save({ updateFieldAppearances: false });
  } else {
    encrypted = true;
    let retry = false;
    while (true) {
      const password = await askPassword(retry);
      if (password === null) throw new PasswordCancelled();
      try {
        bytes = await runEngine({ kind: "decrypt", bytes, password });
        break;
      } catch (failure) {
        if (failure instanceof PdfEngineError && failure.code === "permission") {
          readOnly = true;
          viewingPassword = password;
          break;
        }
        if (failure instanceof PdfEngineError && failure.code === "password") retry = true;
        else throw failure;
      }
    }
    if (!readOnly) {
      const editable = await PDFDocument.load(bytes, { updateMetadata: false });
      formatReadOnlyReason = inspectFormat(editable);
      readOnly = !!formatReadOnlyReason;
      signed = editable.context
        .enumerateIndirectObjects()
        .some(
          ([, object]) =>
            object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Sig"),
        );
      annotations = options.output || readOnly ? new Map() : takeEditableAnnotations(editable);
      viewingBytes = annotations.size
        ? await editable.save({ updateFieldAppearances: false })
        : bytes;
    }
  }
  const task = pdfjs.getDocument({
    data: viewingBytes.slice(),
    password: viewingPassword,
    cMapUrl: asset("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts"),
    wasmUrl: asset("wasm"),
  });
  let cancelled = false;
  task.onPassword = (update: (pw: string) => void, reason: number) => {
    encrypted = true;
    void askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD).then((pw) => {
      if (pw === null) {
        cancelled = true;
        void task.destroy();
      } else update(pw);
    });
  };
  let pdf: PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (err) {
    if (cancelled) throw new PasswordCancelled();
    throw err;
  }
  const info: SourcePageInfo[] = [];
  let nextPage = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, pdf.numPages) }, async () => {
        while (nextPage < pdf.numPages) {
          const index = nextPage++,
            page = await pdf.getPage(index + 1),
            viewport = page.getViewport({ scale: 1, rotation: 0 });
          const rotation = ((page.rotate % 360) + 360) % 360;
          if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
            throw new Error("Rotação de página inválida.");
          info[index] = { w: viewport.width, h: viewport.height, rotate: rotation };
        }
      }),
    );
  } catch (failure) {
    await task.destroy();
    throw failure;
  }
  const permissions = readOnly ? await pdf.getPermissions() : null;
  const canPrint = !readOnly || permissions === null || permissions.has(pdfjs.PermissionFlag.PRINT);
  const canCopy = !readOnly || permissions === null || permissions.has(pdfjs.PermissionFlag.COPY);
  const readOnlyReason = readOnly
    ? viewingPassword !== undefined
      ? "Reabra com a senha de administração para editar."
      : formatReadOnlyReason
    : undefined;
  const src: Source = {
    id: uid("src"),
    name,
    bytes,
    pdf,
    info,
    encrypted,
    readOnly,
    canPrint,
    canCopy,
    readOnlyReason,
    signed,
    password: viewingPassword,
    annotations,
  };
  if (!readOnly) {
    const fieldDocument = encrypted
      ? await PDFDocument.load(bytes, { updateMetadata: false })
      : candidate;
    src.fieldFonts = widgetFonts(fieldDocument);
    src.fieldMasks = Object.fromEntries(
      fieldDocument
        .getForm()
        .getFields()
        .map((field) => [field.getName(), fieldMask(field)]),
    );
    src.fieldLabels = Object.fromEntries(
      fieldDocument
        .getForm()
        .getFields()
        .map((field) => {
          const label = field.acroField.dict.lookup(PDFName.of("TU"));
          return [
            field.getName(),
            label instanceof PDFString || label instanceof PDFHexString
              ? label.decodeText()
              : field.getName(),
          ];
        }),
    );
    src.tabOrders = fieldDocument
      .getPages()
      .map((page) =>
        page.node.get(PDFName.of("Tabs")) === PDFName.of("R")
          ? "rows"
          : page.node.get(PDFName.of("Tabs")) === PDFName.of("C")
            ? "columns"
            : undefined,
      );
  }
  sources.set(src.id, src);
  return src;
}

export function releaseSource(id: string): void {
  if (sourceHolds.has(id)) {
    sourceReleasePending.add(id);
    return;
  }
  const s = sources.get(id);
  if (!s) return;
  sources.delete(id);
  for (const cache of [thumbCache, textCache, formCache]) {
    for (const key of cache.keys()) if (key.startsWith(`${id}:`)) cache.delete(key);
  }
  void s.pdf.loadingTask.destroy();
}

export const pageInfo = (ref: PageRef): SourcePageInfo | undefined =>
  ref.blank ? undefined : sources.get(ref.src)?.info[ref.index];

async function proxy(ref: PageRef): Promise<PDFPageProxy | null> {
  const s = sources.get(ref.src);
  if (!s || ref.blank) return null;
  return s.pdf.getPage(ref.index + 1);
}

/**
 * Renders a page into a canvas at `scale` CSS pixels per point. Blank pages are painted white.
 * Returns a cancel function.
 */
export function renderPage(
  ref: PageRef,
  canvas: HTMLCanvasElement,
  scale: number,
  opts: { forms?: boolean; dpr?: number; quality?: "preview" | "export" } = {},
): { done: Promise<void>; cancel: () => void } {
  let task: RenderTask | null = null;
  let cancelled = false;
  const requestedDpr = opts.dpr ?? window.devicePixelRatio ?? 1;
  const done = (async () => {
    const page = await proxy(ref);
    if (cancelled) return;
    const info = pageInfo(ref);
    if (!page) {
      const w = ref.blank?.w ?? 595;
      const h = ref.blank?.h ?? 842;
      const swap = ref.rotation % 180 !== 0;
      const budget = renderBudget(
        (swap ? h : w) * scale,
        (swap ? w : h) * scale,
        requestedDpr,
        opts.quality,
      );
      canvas.width = budget.width;
      canvas.height = budget.height;
      canvas.dataset.quality = budget.limited ? "limited" : "full";
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível para a página.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const viewport = page.getViewport({ scale, rotation: totalRotation(ref, info) });
    const budget = renderBudget(viewport.width, viewport.height, requestedDpr, opts.quality),
      dpr = budget.ratio;
    const tmp = document.createElement("canvas");
    tmp.width = budget.width;
    tmp.height = budget.height;
    task = page.render({
      canvas: tmp,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      annotationMode: opts.forms ? pdfjs.AnnotationMode.ENABLE_FORMS : pdfjs.AnnotationMode.ENABLE,
    });
    try {
      await task.promise;
    } catch (err) {
      if (err instanceof pdfjs.RenderingCancelledException) return;
      throw err;
    }
    if (cancelled) return;
    // Swap in the finished frame at once so a re-render at a new zoom never flashes blank.
    canvas.width = tmp.width;
    canvas.height = tmp.height;
    canvas.dataset.quality = budget.limited ? "limited" : "full";
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível para a página.");
    context.drawImage(tmp, 0, 0);
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** Renders a page to a JPEG/PNG data URL `width` pixels wide. */
export async function renderReviewPage(
  ref: PageRef,
  width = 1200,
  signal?: AbortSignal,
): Promise<{ url: string; limited: boolean }> {
  signal?.throwIfAborted();
  const info = pageInfo(ref),
    rotation = totalRotation(ref, info),
    originalWidth = ref.blank?.w ?? info?.w ?? 612,
    originalHeight = ref.blank?.h ?? info?.h ?? 792;
  const canvas = document.createElement("canvas"),
    rendering = renderPage(ref, canvas, width / (rotation % 180 ? originalHeight : originalWidth), {
      dpr: 1,
      quality: "preview",
    });
  const cancel = () => rendering.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await rendering.done;
    signal?.throwIfAborted();
    return {
      url: canvas.toDataURL("image/jpeg", 0.92),
      limited: canvas.dataset.quality === "limited",
    };
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** Export uses the requested resolution and fails when it cannot honor the resource budget. */
export async function renderToDataUrl(
  ref: PageRef,
  width: number,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.85,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const info = pageInfo(ref);
  const r = totalRotation(ref, info);
  const w0 = ref.blank?.w ?? info?.w ?? 612;
  const h0 = ref.blank?.h ?? info?.h ?? 792;
  const vw = r % 180 === 0 ? w0 : h0;
  const canvas = document.createElement("canvas");
  const rendering = renderPage(ref, canvas, width / vw, { dpr: 1, quality: "export" });
  const cancel = () => rendering.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await rendering.done;
    signal?.throwIfAborted();
    return canvas.toDataURL(type, quality);
  } finally {
    signal?.removeEventListener("abort", cancel);
    canvas.width = 0;
    canvas.height = 0;
  }
}

const thumbCache = new Map<string, Promise<string>>();
let thumbChain: Promise<unknown> = Promise.resolve();

/** Cached, serialized thumbnail rendering so a long document does not stall the UI. */
export function thumbnail(ref: PageRef, width: number): Promise<string> {
  const key = `${ref.src}:${ref.index}:${ref.rotation}:${ref.blank ? `${ref.blank.w}x${ref.blank.h}` : ""}:${width}`;
  let p = thumbCache.get(key);
  if (!p) {
    p = thumbChain.then(() =>
      renderToDataUrl(ref, width * Math.min(2, window.devicePixelRatio || 1)),
    );
    thumbChain = p.catch(() => undefined);
    thumbCache.set(key, p);
  }
  return p;
}

export interface TextItem {
  str: string;
  /** View-space box at scale 1. */
  box: Box;
  baseline: number;
  size: number;
  font: FontKey;
  bold: boolean;
  italic: boolean;
}

const textCache = new Map<string, Promise<TextItem[]>>();

/** Horizontal text runs of a page in view space, used by search and "Editar texto". */
export function textItems(ref: PageRef): Promise<TextItem[]> {
  const key = `${ref.src}:${ref.index}:${ref.rotation}`;
  let p = textCache.get(key);
  if (!p) {
    p = (async () => {
      const page = await proxy(ref);
      if (!page) return [];
      const viewport = page.getViewport({ scale: 1, rotation: totalRotation(ref, pageInfo(ref)) });
      const tc = await page.getTextContent();
      // Real font names (e.g. "ABCDEF+Arial-BoldMT") are only known once the page has been parsed.
      await page.getOperatorList().catch(() => undefined);
      const out: TextItem[] = [];
      for (const it of tc.items) {
        if (!("str" in it) || !it.str) continue;
        const tx = pdfjs.Util.transform(viewport.transform, it.transform);
        if (Math.abs(tx[1]) > 0.01 || tx[0] <= 0) continue;
        const size = Math.hypot(tx[2], tx[3]);
        if (size < 1) continue;
        const style = tc.styles[it.fontName];
        const ascent = style?.ascent || 0.8;
        const descent = Math.abs(style?.descent || -0.2);
        // Resolved font object: pdf.js 6 exposes bold/italic flags and a fallback family.
        let f: {
          name?: string;
          bold?: boolean;
          black?: boolean;
          italic?: boolean;
          fallbackName?: string;
          cssFontInfo?: { fontFamily?: string };
        } = {};
        try {
          if (page.commonObjs.has(it.fontName)) f = page.commonObjs.get(it.fontName) as typeof f;
        } catch {
          // Font not resolved; fall back to the generic family.
        }
        const realName = `${f.name ?? ""} ${f.cssFontInfo?.fontFamily ?? ""}`;
        const family =
          `${realName} ${f.fallbackName ?? ""} ${style?.fontFamily ?? ""}`.toLowerCase();
        const font: FontKey = /courier|mono/.test(family)
          ? "courier"
          : /times|serif|georgia|garamond|roman|cambria|minion/.test(family) && !/sans/.test(family)
            ? "times"
            : "helvetica";
        out.push({
          str: it.str,
          box: {
            x: tx[4],
            y: tx[5] - size * ascent,
            w: it.width * (viewport.scale || 1),
            h: size * (ascent + descent),
          },
          baseline: tx[5],
          size,
          font,
          bold:
            !!(f.bold || f.black) || /bold|black|heavy|semibold|demi/.test(realName.toLowerCase()),
          italic: !!f.italic || /italic|oblique/.test(realName.toLowerCase()),
        });
      }
      return out;
    })();
    textCache.set(key, p);
  }
  return p;
}

/** Groups adjacent runs on the same baseline into whole lines of text. */
export function joinRuns(items: TextItem[]): TextItem[] {
  const sorted = [...items].sort((a, b) => a.baseline - b.baseline || a.box.x - b.box.x);
  const lines: TextItem[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const gap = last ? it.box.x - (last.box.x + last.box.w) : Infinity;
    if (
      last &&
      Math.abs(last.baseline - it.baseline) < last.size * 0.25 &&
      Math.abs(last.size - it.size) < last.size * 0.2 &&
      gap < last.size * 1.2 &&
      gap > -last.size
    ) {
      const needsSpace =
        gap > last.size * 0.15 && !last.str.endsWith(" ") && !it.str.startsWith(" ");
      const right = Math.max(last.box.x + last.box.w, it.box.x + it.box.w);
      last.str += (needsSpace ? " " : "") + it.str;
      last.box = { ...last.box, w: right - last.box.x };
    } else lines.push({ ...it, box: { ...it.box } });
  }
  return lines;
}

export interface FormWidget {
  name: string;
  font?: WidgetFont;
  type: "text" | "checkbox" | "radio" | "choice";
  /** View-space rect at scale 1. */
  box: Box;
  control: ReturnType<typeof widgetControlGeometry>;
  alignment?: "left" | "center" | "right";
  value: string | boolean | string[];
  exportValue?: string;
  options?: { id: string; exportValue: string; displayValue: string }[];
  multiline?: boolean;
  readOnly?: boolean;
  fontSize?: number;
  label?: string;
  required?: boolean;
  maxLength?: number;
  mask?: FieldMask;
  multiselect?: boolean;
}

const formCache = new Map<string, Promise<FormWidget[]>>();
const widgetSchema = z.object({
  subtype: z.string(),
  fieldName: z.string().optional(),
  hidden: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  required: z.boolean().optional(),
  alternativeText: z.string().optional(),
  rect: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]),
  fieldType: z.string().optional(),
  fieldValue: z
    .union([z.string(), z.boolean(), z.array(z.string())])
    .nullable()
    .optional(),
  defaultAppearanceData: z.object({ fontSize: z.number().finite().optional() }).optional(),
  multiLine: z.boolean().optional(),
  maxLen: z.number().int().nonnegative().nullable().optional(),
  multiSelect: z.boolean().optional(),
  checkBox: z.boolean().optional(),
  radioButton: z.boolean().optional(),
  exportValue: z.string().optional(),
  buttonValue: z.string().optional(),
  rotation: z.number().int().multipleOf(90).optional(),
  textAlignment: z.number().int().min(0).max(2).nullable().optional(),
  options: z.array(z.object({ exportValue: z.string(), displayValue: z.string() })).optional(),
});

export function formWidgets(ref: PageRef): Promise<FormWidget[]> {
  const key = `${ref.src}:${ref.index}:${ref.rotation}`;
  let p = formCache.get(key);
  if (!p) {
    p = (async () => {
      const page = await proxy(ref);
      if (!page) return [];
      const viewport = page.getViewport({ scale: 1, rotation: totalRotation(ref, pageInfo(ref)) });
      const annots: unknown[] = await page.getAnnotations();
      const out: FormWidget[] = [];
      for (const raw of annots) {
        if (!raw || typeof raw !== "object" || !("subtype" in raw) || raw.subtype !== "Widget")
          continue;
        const a = widgetSchema.parse(raw);
        if (a.subtype !== "Widget" || !a.fieldName || a.hidden) continue;
        const r = a.rect;
        const [x1, y1] = viewport.convertToViewportPoint(r[0], r[1]);
        const [x2, y2] = viewport.convertToViewportPoint(r[2], r[3]);
        const box = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
        };
        const base = {
          name: a.fieldName,
          font: getSource(ref.src)?.fieldFonts?.get(a.fieldName),
          label: a.alternativeText || getSource(ref.src)?.fieldLabels?.[a.fieldName] || a.fieldName,
          box,
          control: widgetControlGeometry(box, viewport.rotation, a.rotation),
          alignment: a.textAlignment === 1 ? "center" : a.textAlignment === 2 ? "right" : "left",
          readOnly: !!a.readOnly,
          required: !!a.required,
          mask: getSource(ref.src)?.fieldMasks?.[a.fieldName] ?? "none",
        } satisfies Omit<FormWidget, "type" | "value">;
        const fieldValue = a.fieldValue;
        if (a.fieldType === "Tx") {
          const da = a.defaultAppearanceData?.fontSize;
          out.push({
            ...base,
            type: "text",
            value: String(fieldValue ?? ""),
            multiline: Boolean(a.multiLine),
            fontSize: da || undefined,
            maxLength: a.maxLen || undefined,
          });
        } else if (a.fieldType === "Btn" && a.checkBox) {
          out.push({
            ...base,
            type: "checkbox",
            value: fieldValue != null && fieldValue !== "Off" && fieldValue === a.exportValue,
            exportValue: String(a.exportValue ?? "Yes"),
          });
        } else if (a.fieldType === "Btn" && a.radioButton) {
          out.push({
            ...base,
            type: "radio",
            value: String(fieldValue ?? ""),
            exportValue: String(a.buttonValue ?? ""),
          });
        } else if (a.fieldType === "Ch") {
          const options = (a.options ?? []).map((option) => ({
            ...option,
            id: crypto.randomUUID(),
          }));
          const v = a.multiSelect
            ? Array.isArray(fieldValue)
              ? fieldValue
              : fieldValue
                ? [String(fieldValue)]
                : []
            : Array.isArray(fieldValue)
              ? fieldValue[0]
              : fieldValue;
          out.push({
            ...base,
            type: "choice",
            value: Array.isArray(v) ? v : String(v ?? ""),
            options,
            multiselect: a.multiSelect,
          });
        }
      }
      const order = getSource(ref.src)?.tabOrders?.[ref.index];
      if (order === "rows") out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
      if (order === "columns") out.sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
      return out;
    })();
    formCache.set(key, p);
  }
  return p;
}

/** Text layer for selecting/copying text and for text markup tools. */
export async function renderTextLayer(
  ref: PageRef,
  container: HTMLElement,
  scale: number,
): Promise<() => void> {
  const page = await proxy(ref);
  if (!page) return () => undefined;
  const viewport = page.getViewport({ scale, rotation: totalRotation(ref, pageInfo(ref)) });
  const layer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport,
  });
  await layer.render();
  return () => layer.cancel();
}

export { pdfjs };
