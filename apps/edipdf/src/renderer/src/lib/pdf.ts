import {
  type Box,
  type FontKey,
  type PageRef,
  type SourcePageInfo,
  totalRotation,
  uid,
} from "@shared/model";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const asset = (dir: string): string => new URL(`./pdfjs/${dir}/`, location.href).href;

/** A loaded source PDF. Kept outside React state: it holds the bytes and the pdf.js proxy. */
export interface Source {
  id: string;
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  info: SourcePageInfo[];
  /** Opened with a password; pdf-lib cannot rewrite it. */
  encrypted: boolean;
}

const sources = new Map<string, Source>();
export const getSource = (id: string): Source | undefined => sources.get(id);

export class PasswordCancelled extends Error {}

/**
 * Loads a PDF. `askPassword` is called (repeatedly, with `retry` true after a wrong one) when
 * the file is protected; returning null cancels.
 */
export async function loadSource(
  bytes: Uint8Array,
  name: string,
  askPassword: (retry: boolean) => Promise<string | null>,
): Promise<Source> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: asset("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts"),
    wasmUrl: asset("wasm"),
  });
  let encrypted = false;
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
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
  );
  const info = pages.map((p) => {
    const [x0, y0, x1, y1] = p.view;
    return {
      w: x1 - x0,
      h: y1 - y0,
      rotate: (((p.rotate % 360) + 360) % 360) as SourcePageInfo["rotate"],
    };
  });
  const src: Source = { id: uid("src"), name, bytes, pdf, info, encrypted };
  sources.set(src.id, src);
  return src;
}

export function releaseSource(id: string): void {
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
  opts: { forms?: boolean; dpr?: number } = {},
): { done: Promise<void>; cancel: () => void } {
  let task: RenderTask | null = null;
  let cancelled = false;
  const dpr = opts.dpr ?? window.devicePixelRatio ?? 1;
  const done = (async () => {
    const page = await proxy(ref);
    if (cancelled) return;
    const info = pageInfo(ref);
    if (!page) {
      const w = ref.blank?.w ?? 595;
      const h = ref.blank?.h ?? 842;
      const swap = ref.rotation % 180 !== 0;
      canvas.width = Math.floor((swap ? h : w) * scale * dpr);
      canvas.height = Math.floor((swap ? w : h) * scale * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const viewport = page.getViewport({ scale, rotation: totalRotation(ref, info) });
    const tmp = document.createElement("canvas");
    tmp.width = Math.floor(viewport.width * dpr);
    tmp.height = Math.floor(viewport.height * dpr);
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
    canvas.getContext("2d")!.drawImage(tmp, 0, 0);
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
export async function renderToDataUrl(
  ref: PageRef,
  width: number,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.85,
): Promise<string> {
  const info = pageInfo(ref);
  const r = totalRotation(ref, info);
  const w0 = ref.blank?.w ?? info?.w ?? 612;
  const h0 = ref.blank?.h ?? info?.h ?? 792;
  const vw = r % 180 === 0 ? w0 : h0;
  const canvas = document.createElement("canvas");
  await renderPage(ref, canvas, width / vw, { dpr: 1 }).done;
  return canvas.toDataURL(type, quality);
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

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Finds `query` in a page and returns one rectangle per matched run fragment. */
export async function findInPage(ref: PageRef, query: string): Promise<Box[][]> {
  const q = normalize(query.trim());
  if (!q) return [];
  const items = await textItems(ref);
  const matches: Box[][] = [];
  // Each item is searched on its own and across joined lines so phrases split into runs still match.
  for (const line of joinRuns(items)) {
    const text = normalize(line.str);
    let from = 0;
    for (;;) {
      const i = text.indexOf(q, from);
      if (i < 0) break;
      const cw = line.box.w / Math.max(1, line.str.length);
      matches.push([{ x: line.box.x + i * cw, y: line.box.y, w: q.length * cw, h: line.box.h }]);
      from = i + q.length;
    }
  }
  return matches;
}

export interface FormWidget {
  name: string;
  type: "text" | "checkbox" | "radio" | "choice";
  /** View-space rect at scale 1. */
  box: Box;
  value: string | boolean;
  exportValue?: string;
  options?: string[];
  multiline?: boolean;
  readOnly?: boolean;
  fontSize?: number;
}

const formCache = new Map<string, Promise<FormWidget[]>>();

export function formWidgets(ref: PageRef): Promise<FormWidget[]> {
  const key = `${ref.src}:${ref.index}:${ref.rotation}`;
  let p = formCache.get(key);
  if (!p) {
    p = (async () => {
      const page = await proxy(ref);
      if (!page) return [];
      const viewport = page.getViewport({ scale: 1, rotation: totalRotation(ref, pageInfo(ref)) });
      const annots = (await page.getAnnotations()) as Record<string, unknown>[];
      const out: FormWidget[] = [];
      for (const a of annots) {
        if (a.subtype !== "Widget" || !a.fieldName || a.hidden) continue;
        const r = a.rect as number[];
        const [x1, y1] = viewport.convertToViewportPoint(r[0], r[1]) as number[];
        const [x2, y2] = viewport.convertToViewportPoint(r[2], r[3]) as number[];
        const box = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
        };
        const base = { name: String(a.fieldName), box, readOnly: Boolean(a.readOnly) };
        const fieldValue = a.fieldValue;
        if (a.fieldType === "Tx") {
          const da = (a.defaultAppearanceData as { fontSize?: number } | undefined)?.fontSize;
          out.push({
            ...base,
            type: "text",
            value: String(fieldValue ?? ""),
            multiline: Boolean(a.multiLine),
            fontSize: da || undefined,
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
          const options = (
            (a.options as { exportValue: string; displayValue: string }[]) ?? []
          ).map((o) => o.exportValue ?? o.displayValue);
          const v = Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
          out.push({ ...base, type: "choice", value: String(v ?? ""), options });
        }
      }
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
