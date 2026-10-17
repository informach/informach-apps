import { buildPdf, imageToPdf, ProtectedPdfError } from "@shared/build";
import {
  type Annot,
  CSS_FONT,
  type DocContent,
  LINE_HEIGHT,
  type PageRef,
  rotateAnnot,
  type TextAnnot,
  textLines,
  uid,
  viewSize,
} from "@shared/model";
import type { OpenedFile } from "@shared/types";
import { PDFDocument } from "pdf-lib";
import {
  activeDoc,
  commit,
  type DocState,
  isDirty,
  patchDoc,
  toast,
  undo,
  useApp,
} from "../state/store";
import { finishDraft } from "./editing";
import {
  getSource,
  loadSource,
  PasswordCancelled,
  pageInfo,
  releaseSource,
  renderPage,
  renderToDataUrl,
  type Source,
} from "./pdf";

const api = window.api;

export const A4 = { w: 595.28, h: 841.89 };
export const LETTER = { w: 612, h: 792 };

const emptyContent = (pages: PageRef[]): DocContent => ({
  pages,
  annots: [],
  watermark: null,
  pageNumbers: null,
  meta: {},
  forms: {},
});

const pagesOf = (src: Source): PageRef[] =>
  src.info.map((_, index) => ({ id: uid("p"), src: src.id, index, rotation: 0 }));

const isImageName = (name: string): boolean => /\.(png|jpe?g)$/i.test(name);

const busy = (msg: string | null): void => {
  useApp.setState({ busy: msg });
};

function askPassword(name: string, retry: boolean): Promise<string | null> {
  return new Promise((resolve) =>
    useApp.setState({
      dialog: {
        kind: "password",
        name,
        retry,
        resolve: (pw) => {
          useApp.setState({ dialog: null });
          resolve(pw);
        },
      },
    }),
  );
}

/** Loads a PDF or image file as a source. Returns null when the user cancels a password prompt. */
async function sourceFromFile(f: OpenedFile): Promise<Source | null> {
  try {
    if (isImageName(f.name)) {
      return await loadSource(await imageToPdf(f.bytes), f.name.replace(/\.\w+$/, ".pdf"), () =>
        Promise.resolve(null),
      );
    }
    return await loadSource(f.bytes, f.name, (retry) => askPassword(f.name, retry));
  } catch (err) {
    if (err instanceof PasswordCancelled) return null;
    toast(
      `Não foi possível abrir "${f.name}". O arquivo pode estar corrompido ou não ser um PDF.`,
      { tone: "error" },
    );
    console.error(err);
    return null;
  }
}

function makeDoc(
  name: string,
  path: string | null,
  srcs: Source[],
  primary: string | null,
  pages?: PageRef[],
): DocState {
  const content = emptyContent(pages ?? srcs.flatMap(pagesOf));
  return {
    id: uid("doc"),
    name,
    path,
    primary,
    sourceIds: srcs.map((s) => s.id),
    content,
    saved: path ? content : emptyContent([]),
    past: [],
    future: [],
    selection: [],
    selectedAnnot: null,
    openNote: null,
    draft: null,
    zoom: 1,
    fit: "width",
    currentPage: 0,
    view: "pages",
    search: null,
    scrollRequest: null,
    hasForms: false,
  };
}

function addDoc(doc: DocState): void {
  useApp.setState((s) => ({ docs: [...s.docs, doc], activeId: doc.id }));
  void detectForms(doc);
}

async function detectForms(doc: DocState): Promise<void> {
  const src = doc.primary ? getSource(doc.primary) : undefined;
  if (!src) return;
  try {
    const fields = await src.pdf.getFieldObjects();
    if (fields && (fields instanceof Map ? fields.size : Object.keys(fields).length))
      patchDoc(doc.id, { hasForms: true });
  } catch {
    // No AcroForm.
  }
}

async function rememberRecent(path: string, name: string, src: Source): Promise<void> {
  let thumb: string | undefined;
  try {
    thumb = await renderToDataUrl(
      { id: "thumb", src: src.id, index: 0, rotation: 0 },
      180,
      "image/jpeg",
      0.7,
    );
  } catch {
    thumb = undefined;
  }
  const recents = await api.recent.add({
    path,
    name,
    openedAt: Date.now(),
    pages: src.info.length,
    thumb,
  });
  useApp.setState({ recents });
}

/** Opens PDFs as tabs; images are gathered into a single new document. */
export async function openFiles(files: OpenedFile[]): Promise<void> {
  const pdfs = files.filter((f) => !isImageName(f.name));
  const images = files.filter((f) => isImageName(f.name));
  for (const f of pdfs) {
    const existing = useApp
      .getState()
      .docs.find((d) => d.path && d.path.toLowerCase() === f.path.toLowerCase());
    if (existing) {
      useApp.setState({ activeId: existing.id });
      continue;
    }
    busy(`Abrindo ${f.name}…`);
    const src = await sourceFromFile(f);
    busy(null);
    if (!src) continue;
    addDoc(makeDoc(f.name, f.path, [src], src.id));
    void rememberRecent(f.path, f.name, src);
  }
  if (images.length)
    await combineFiles(
      images,
      images.length === 1 ? images[0].name.replace(/\.\w+$/, ".pdf") : "Imagens.pdf",
    );
}

export async function openPaths(paths: string[]): Promise<void> {
  const files = (await Promise.all(paths.map((p) => api.readFile(p)))).filter(
    (f): f is OpenedFile => !!f,
  );
  if (files.length < paths.length) toast("Algum arquivo não pôde ser lido.", { tone: "error" });
  await openFiles(files);
}

export async function openDialog(): Promise<void> {
  await openFiles(await api.openDialog({ images: true }));
}

/** Creates a new unsaved document from several PDFs and images, in order. */
export async function combineFiles(files: OpenedFile[], name = "Combinado.pdf"): Promise<void> {
  if (!files.length) return;
  busy("Combinando arquivos…");
  const srcs: Source[] = [];
  for (const f of files) {
    const s = await sourceFromFile(f);
    if (s) srcs.push(s);
  }
  busy(null);
  if (!srcs.length) return;
  addDoc(makeDoc(name, null, srcs, srcs[0].id));
}

export function newBlankDocument(): void {
  addDoc(
    makeDoc("Sem título.pdf", null, [], null, [
      { id: uid("p"), src: "", index: 0, rotation: 0, blank: { ...A4 } },
    ]),
  );
}

const sourceBytes = (doc: DocState): Record<string, Uint8Array> =>
  Object.fromEntries(
    doc.sourceIds.map((id) => [id, getSource(id)?.bytes]).filter(([, b]) => b),
  ) as Record<string, Uint8Array>;

/** Renders every page of a protected source into a plain image PDF with the same page geometry. */
async function rasterizeSource(src: Source): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (let index = 0; index < src.info.length; index++) {
    const ref: PageRef = { id: "r", src: src.id, index, rotation: 0 };
    const { w, h } = viewSize(ref, src.info[index]);
    const canvas = document.createElement("canvas");
    await renderPage(ref, canvas, 2.5, { dpr: 1 }).done;
    const jpg = await out.embedJpg(
      await (await fetch(canvas.toDataURL("image/jpeg", 0.9))).arrayBuffer(),
    );
    out.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  return out.save();
}

/** Builds the output bytes. Protected files can be flattened to images after confirmation. */
export async function buildDoc(
  doc: DocState,
  content: DocContent = doc.content,
  onFlatten?: () => void,
): Promise<Uint8Array | null> {
  const sources = sourceBytes(doc);
  try {
    if (doc.primary && getSource(doc.primary)?.encrypted) throw new ProtectedPdfError();
    return await buildPdf({ content, sources, primary: doc.primary });
  } catch (err) {
    if (!(err instanceof ProtectedPdfError)) throw err;
    const choice = await api.message({
      type: "warning",
      title: "PDF protegido",
      message: "Este PDF é protegido e não pode ser regravado como está.",
      detail:
        "O EdiPDF pode salvar uma cópia com as páginas convertidas em imagem (o texto deixa de ser selecionável), sem a proteção.",
      buttons: ["Salvar cópia em imagem", "Cancelar"],
    });
    if (choice !== 0) return null;
    onFlatten?.();
    busy("Convertendo páginas…");
    const flat: Record<string, Uint8Array> = {};
    for (const id of doc.sourceIds) {
      const s = getSource(id);
      if (s) flat[id] = await rasterizeSource(s);
    }
    return await buildPdf({
      content: { ...content, forms: {} },
      sources: flat,
      primary: doc.primary,
    });
  }
}

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export async function saveDoc(docId: string, saveAs = false): Promise<boolean> {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return false;
  let path = doc.path;
  const protectedSource = doc.sourceIds.some((id) => getSource(id)?.encrypted);
  if (!path || saveAs || protectedSource) {
    path = await api.saveDialog(
      protectedSource
        ? `${doc.name.replace(/\.pdf$/i, "")} (cópia).pdf`
        : doc.name.toLowerCase().endsWith(".pdf")
          ? doc.name
          : `${doc.name}.pdf`,
    );
    if (!path) return false;
    if (protectedSource && doc.path?.toLowerCase() === path.toLowerCase()) {
      toast("Escolha outro nome para preservar o PDF protegido original.", { tone: "error" });
      return false;
    }
  }
  const content = doc.content;
  busy("Salvando…");
  try {
    let flattened = false;
    const bytes = await buildDoc(doc, content, () => {
      flattened = true;
    });
    if (!bytes) return false;
    if (flattened && doc.path?.toLowerCase() === path.toLowerCase()) {
      path = await api.saveDialog(`${doc.name.replace(/\.pdf$/i, "")} (cópia).pdf`);
      if (!path) return false;
      if (doc.path.toLowerCase() === path.toLowerCase()) {
        toast("Escolha outro nome para preservar o PDF protegido original.", { tone: "error" });
        return false;
      }
    }
    await api.writeFile(path, bytes);
    patchDoc(docId, { path, name: baseName(path), saved: content });
    const src = doc.primary ? getSource(doc.primary) : getSource(doc.sourceIds[0]);
    if (src) void rememberRecent(path, baseName(path), src);
    const savedPath = path;
    toast(`Salvo em ${baseName(savedPath)}`, {
      tone: "ok",
      action: { label: "Mostrar na pasta", run: () => void api.showInFolder(savedPath) },
    });
    return true;
  } catch (err) {
    console.error(err);
    toast(`Não foi possível salvar: ${(err as Error).message}`, { tone: "error" });
    return false;
  } finally {
    busy(null);
  }
}

/** Renders a finished PDF page by page; used by print and image export. */
async function renderBytes(
  bytes: Uint8Array,
  name: string,
  width: (pt: number) => number,
  each: (url: string, wPt: number, hPt: number, i: number) => Promise<void> | void,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  pick?: number[],
): Promise<void> {
  const src = await loadSource(bytes, name, () => Promise.resolve(null));
  try {
    const indices = pick ?? src.info.map((_, i) => i);
    for (const index of indices) {
      busy(`Preparando página ${index + 1} de ${src.info.length}…`);
      const ref: PageRef = { id: "x", src: src.id, index, rotation: 0 };
      const { w, h } = viewSize(ref, src.info[index]);
      await each(await renderToDataUrl(ref, width(w), type, 0.92), w, h, index);
    }
  } finally {
    releaseSource(src.id);
  }
}

export async function printDoc(docId: string): Promise<void> {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return;
  busy("Preparando impressão…");
  try {
    const bytes = await buildDoc(doc);
    if (!bytes) return;
    const pages: { src: string; width: number; height: number }[] = [];
    // 200 dpi is sharp on paper and keeps memory reasonable for long documents.
    await renderBytes(
      bytes,
      doc.name,
      (w) => Math.round((w / 72) * 200),
      (src, width, height) => void pages.push({ src, width, height }),
    );
    busy(null);
    await api.print(pages, doc.name);
  } catch (err) {
    console.error(err);
    toast("Não foi possível imprimir.", { tone: "error" });
  } finally {
    busy(null);
  }
}

export async function exportImages(
  docId: string,
  pageIds: string[],
  format: "png" | "jpg",
  dpi: number,
): Promise<void> {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return;
  const folder = await api.pickFolder("Pasta para as imagens");
  if (!folder) return;
  busy("Exportando imagens…");
  try {
    const bytes = await buildDoc(doc);
    if (!bytes) return;
    const indices = doc.content.pages
      .map((p, i) => (pageIds.includes(p.id) ? i : -1))
      .filter((i) => i >= 0);
    const base = doc.name.replace(/\.pdf$/i, "");
    const files: { name: string; bytes: Uint8Array }[] = [];
    await renderBytes(
      bytes,
      doc.name,
      (w) => Math.round((w / 72) * dpi),
      async (url, _w, _h, i) => {
        files.push({
          name: `${base} - página ${i + 1}.${format}`,
          bytes: new Uint8Array(await (await fetch(url)).arrayBuffer()),
        });
      },
      format === "png" ? "image/png" : "image/jpeg",
      indices,
    );
    const written = await api.writeFiles(folder, files);
    toast(`${written.length} ${written.length === 1 ? "imagem exportada" : "imagens exportadas"}`, {
      tone: "ok",
      action: { label: "Mostrar na pasta", run: () => void api.showInFolder(written[0]) },
    });
  } catch (err) {
    console.error(err);
    toast("Não foi possível exportar as imagens.", { tone: "error" });
  } finally {
    busy(null);
  }
}

/** Content restricted to some pages, keeping their annotations. */
const subset = (c: DocContent, ids: Set<string>): DocContent => ({
  ...c,
  pages: c.pages.filter((p) => ids.has(p.id)),
  annots: c.annots.filter((a) => ids.has(a.page)),
});

/** Opens the selected pages as a new, unsaved document. */
export function extractPages(docId: string, pageIds: string[]): void {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc || !pageIds.length) return;
  const ids = new Set(pageIds);
  const part = subset(doc.content, ids);
  // New page ids so the two documents never share annotation targets.
  const remap = new Map(part.pages.map((p) => [p.id, uid("p")]));
  const content: DocContent = {
    ...part,
    pages: part.pages.map((p) => ({ ...p, id: remap.get(p.id)! })),
    annots: part.annots.map((a) => ({ ...a, id: uid("a"), page: remap.get(a.page)! })),
  };
  const srcs = doc.sourceIds.map(getSource).filter((s): s is Source => !!s);
  const base = makeDoc(
    `${doc.name.replace(/\.pdf$/i, "")} (extraído).pdf`,
    null,
    srcs,
    doc.primary,
    content.pages,
  );
  addDoc({ ...base, content, saved: emptyContent([]) });
  toast(
    `${pageIds.length} ${pageIds.length === 1 ? "página extraída" : "páginas extraídas"} para um novo documento`,
    { tone: "ok" },
  );
}

/** Saves the document in parts of `size` pages (or one file per selected range). */
export async function splitDoc(docId: string, size: number): Promise<void> {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc || !Number.isInteger(size) || size < 1) return;
  const folder = await api.pickFolder("Pasta para as partes");
  if (!folder) return;
  busy("Dividindo…");
  try {
    const base = doc.name.replace(/\.pdf$/i, "");
    const files: { name: string; bytes: Uint8Array }[] = [];
    const pages = doc.content.pages;
    for (let i = 0, part = 1; i < pages.length; i += size, part++) {
      busy(`Gerando parte ${part}…`);
      const bytes = await buildDoc(
        doc,
        subset(doc.content, new Set(pages.slice(i, i + size).map((p) => p.id))),
      );
      if (!bytes) return;
      files.push({ name: `${base} - parte ${part}.pdf`, bytes });
    }
    const written = await api.writeFiles(folder, files);
    toast(`${written.length} arquivos criados`, {
      tone: "ok",
      action: { label: "Mostrar na pasta", run: () => void api.showInFolder(written[0]) },
    });
  } catch (err) {
    console.error(err);
    toast("Não foi possível dividir o documento.", { tone: "error" });
  } finally {
    busy(null);
  }
}

export async function closeDoc(docId: string): Promise<boolean> {
  finishDraft(docId);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return true;
  if (isDirty(doc)) {
    useApp.setState({ activeId: docId });
    const choice = await api.confirmUnsaved([doc.name]);
    if (choice === "cancel") return false;
    if (choice === "save" && !(await saveDoc(docId))) return false;
  }
  useApp.setState((s) => {
    const idx = s.docs.findIndex((d) => d.id === docId);
    const docs = s.docs.filter((d) => d.id !== docId);
    const activeId =
      s.activeId === docId ? (docs[Math.min(idx, docs.length - 1)]?.id ?? null) : s.activeId;
    return { docs, activeId };
  });
  const stillUsed = new Set(useApp.getState().docs.flatMap((d) => d.sourceIds));
  for (const id of doc.sourceIds) if (!stillUsed.has(id)) releaseSource(id);
  return true;
}

/** Called when the window is about to close. */
export async function requestQuit(): Promise<void> {
  if (useApp.getState().busy) {
    toast("Aguarde a operação terminar antes de fechar.");
    return;
  }
  for (const doc of useApp.getState().docs) finishDraft(doc.id);
  const dirty = useApp.getState().docs.filter(isDirty);
  if (dirty.length) {
    const choice = await api.confirmUnsaved(dirty.map((d) => d.name));
    if (choice === "cancel") return;
    if (choice === "save") for (const d of dirty) if (!(await saveDoc(d.id))) return;
  }
  api.closeNow();
}

// ---- Text measurement ---------------------------------------------------------------------

const measureCtx = document.createElement("canvas").getContext("2d")!;

export function measureText(a: Pick<TextAnnot, "text" | "font" | "size" | "bold" | "italic">): {
  w: number;
  h: number;
} {
  measureCtx.font = `${a.italic ? "italic " : ""}${a.bold ? "bold " : ""}${a.size}px ${CSS_FONT[a.font]}`;
  const lines = textLines(a.text);
  const w = Math.max(a.size * 0.5, ...lines.map((l) => measureCtx.measureText(l).width));
  return { w, h: lines.length * a.size * LINE_HEIGHT };
}

// ---- Page operations ----------------------------------------------------------------------

export function rotatePages(docId: string, ids: string[], delta: 90 | -90 | 180): void {
  const set = new Set(ids);
  commit(docId, (c) => {
    const sizes = new Map(
      c.pages.filter((p) => set.has(p.id)).map((p) => [p.id, viewSize(p, pageInfo(p))]),
    );
    return {
      ...c,
      pages: c.pages.map((p) =>
        set.has(p.id)
          ? { ...p, rotation: ((((p.rotation + delta) % 360) + 360) % 360) as PageRef["rotation"] }
          : p,
      ),
      annots: c.annots.map((a) => {
        const s = sizes.get(a.page);
        if (!s) return a;
        return rotateAnnot(a, s.w, s.h, delta, a.kind === "text" ? measureText(a) : undefined);
      }),
    };
  });
}

export function deletePages(docId: string, ids: string[]): void {
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return;
  const set = new Set(ids);
  if (doc.content.pages.every((p) => set.has(p.id))) {
    toast("Um documento precisa ter pelo menos uma página.", { tone: "error" });
    return;
  }
  commit(
    docId,
    (c) => ({
      ...c,
      pages: c.pages.filter((p) => !set.has(p.id)),
      annots: c.annots.filter((a) => !set.has(a.page)),
    }),
    { selection: [] },
  );
  toast(`${ids.length} ${ids.length === 1 ? "página excluída" : "páginas excluídas"}`, {
    action: { label: "Desfazer", run: () => undo(docId) },
  });
}

export function duplicatePages(docId: string, ids: string[]): void {
  const set = new Set(ids);
  commit(docId, (c) => {
    const pages: PageRef[] = [];
    const extra: Annot[] = [];
    for (const p of c.pages) {
      pages.push(p);
      if (!set.has(p.id)) continue;
      const copy = { ...p, id: uid("p") };
      pages.push(copy);
      for (const a of c.annots)
        if (a.page === p.id) extra.push({ ...a, id: uid("a"), page: copy.id });
    }
    return { ...c, pages, annots: [...c.annots, ...extra] };
  });
}

/** Moves the given pages so they start at `to` (an index in the current order). */
export function movePages(docId: string, ids: string[], to: number): void {
  commit(docId, (c) => {
    const set = new Set(ids);
    const moving = c.pages.filter((p) => set.has(p.id));
    const before = c.pages.slice(0, to).filter((p) => !set.has(p.id));
    const after = c.pages.slice(to).filter((p) => !set.has(p.id));
    const pages = [...before, ...moving, ...after];
    return pages.every((p, i) => p === c.pages[i]) ? c : { ...c, pages };
  });
}

export function insertBlank(
  docId: string,
  at: number,
  size: { w: number; h: number },
  count = 1,
): void {
  const pages: PageRef[] = Array.from({ length: count }, () => ({
    id: uid("p"),
    src: "",
    index: 0,
    rotation: 0,
    blank: { ...size },
  }));
  commit(
    docId,
    (c) => ({ ...c, pages: [...c.pages.slice(0, at), ...pages, ...c.pages.slice(at)] }),
    { selection: pages.map((p) => p.id) },
  );
}

export async function insertFilesAt(docId: string, at: number, files: OpenedFile[]): Promise<void> {
  if (!files.length) return;
  busy("Inserindo páginas…");
  const srcs: Source[] = [];
  for (const f of files) {
    const s = await sourceFromFile(f);
    if (s) srcs.push(s);
  }
  busy(null);
  if (!srcs.length) return;
  const pages = srcs.flatMap(pagesOf);
  patchDoc(docId, (d) => ({
    sourceIds: [...d.sourceIds, ...srcs.map((s) => s.id)],
    primary: d.primary ?? srcs[0].id,
  }));
  commit(
    docId,
    (c) => ({ ...c, pages: [...c.pages.slice(0, at), ...pages, ...c.pages.slice(at)] }),
    { selection: pages.map((p) => p.id) },
  );
  toast(`${pages.length} ${pages.length === 1 ? "página inserida" : "páginas inseridas"}`, {
    tone: "ok",
  });
}

export async function insertFromFiles(docId: string, at: number): Promise<void> {
  await insertFilesAt(
    docId,
    at,
    await api.openDialog({ images: true, title: "Inserir páginas de…" }),
  );
}

/** Reads files dropped from Explorer. */
export async function droppedFiles(list: FileList): Promise<OpenedFile[]> {
  const paths = [...list]
    .map((f) => api.pathForFile(f))
    .filter((p) => /\.(pdf|png|jpe?g)$/i.test(p));
  return (await Promise.all(paths.map((p) => api.readFile(p)))).filter((f): f is OpenedFile => !!f);
}

// ---- Images and signatures -----------------------------------------------------------------

export function bytesToDataUrl(bytes: Uint8Array): string {
  const mime = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

const imageSize = (src: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });

/** Places an image centred on the current page, scaled to a sensible size. */
export async function placeImage(
  src: string,
  opts: { signature?: boolean; maxWidth?: number } = {},
): Promise<void> {
  const doc = activeDoc();
  if (!doc) return;
  const page = doc.content.pages[doc.currentPage] ?? doc.content.pages[0];
  const { w: W, h: H } = viewSize(page, pageInfo(page));
  const nat = await imageSize(src);
  const maxW = Math.min(opts.maxWidth ?? W * 0.5, W * 0.9);
  const k = Math.min(1, maxW / (nat.w * 0.75), (H * 0.6) / (nat.h * 0.75));
  const w = nat.w * 0.75 * k;
  const h = nat.h * 0.75 * k;
  const a: Annot = {
    id: uid("a"),
    page: page.id,
    kind: "image",
    src,
    x: (W - w) / 2,
    y: (H - h) / 2,
    w,
    h,
    signature: opts.signature,
  };
  commit(doc.id, (c) => ({ ...c, annots: [...c.annots, a] }), { selectedAnnot: a.id });
  useApp.setState({ tool: "select" });
}

export async function pickAndPlaceImage(): Promise<void> {
  const [file] = await api.openDialog({ images: true, multi: false, title: "Escolher imagem" });
  if (!file) return;
  if (!isImageName(file.name)) {
    toast("Escolha uma imagem PNG ou JPG.", { tone: "error" });
    return;
  }
  await placeImage(bytesToDataUrl(file.bytes));
}

export const dirtyCount = (): number => useApp.getState().docs.filter(isDirty).length;
