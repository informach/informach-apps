import { imageToPdf } from "@shared/build";
import { executeDocumentTransaction } from "@shared/document-commands";
import {
  type Annot,
  cssFontForText,
  type DocContent,
  LINE_HEIGHT,
  type PageRef,
  rotateAnnot,
  type TextAnnot,
  textLines,
  uid,
  viewSize,
} from "@shared/model";
import { validateRasterImage } from "@shared/raster-image";
import type { OpenedFile } from "@shared/types";
import { usePreferences } from "../state/preferences";
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
import { buildDoc } from "./document-output";
import { releaseDocumentPreview } from "./document-preview";
import { releaseDocumentText } from "./document-text";
import { finishDraft } from "./editing";
import { chooseFiles } from "./file-picker";
import { recoverySnapshot, stopRecoveryAutosave } from "./recovery";
import { flushSession } from "./session";
import { releaseWorkspaceView } from "./workspace-view";

export { buildDoc } from "./document-output";

import {
  getSource,
  loadSource,
  PasswordCancelled,
  pageInfo,
  releaseSource,
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
      passwordPrompt: {
        kind: "password",
        name,
        retry,
        resolve: (pw) => {
          useApp.setState({ passwordPrompt: null });
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
      const source = await loadSource(
        await imageToPdf(f.bytes),
        f.name.replace(/\.\w+$/, ".pdf"),
        () => Promise.resolve(null),
      );
      source.originPath = f.path;
      return source;
    }
    const source = await loadSource(f.bytes, f.name, (retry) => askPassword(f.name, retry));
    source.originPath = f.path;
    return source;
  } catch (err) {
    if (err instanceof PasswordCancelled) return null;
    toast(
      `Não foi possível abrir "${f.name}": ${err instanceof Error ? err.message : "arquivo inválido"}`,
      { tone: "error" },
    );
    console.error(err);
    return null;
  }
}

/** Multi-file document mutations are integral: any failure/cancel leaves the document unchanged. */
async function loadAllSources(files: OpenedFile[]): Promise<Source[] | null> {
  const loaded: Source[] = [];
  try {
    for (const file of files) {
      const source = await sourceFromFile(file);
      if (!source) {
        for (const previous of loaded) releaseSource(previous.id);
        toast(
          "Operação cancelada: nenhum arquivo foi inserido. Confira todos os arquivos e tente novamente.",
          { tone: "error", ms: 7000 },
        );
        return null;
      }
      if (source.readOnly) {
        releaseSource(source.id);
        for (const previous of loaded) releaseSource(previous.id);
        toast("Para inserir ou juntar um PDF protegido, abra-o com a senha de administração.", {
          tone: "error",
        });
        return null;
      }
      loaded.push(source);
    }
    return loaded;
  } finally {
    busy(null);
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
  content.annots = content.pages.flatMap((page) =>
    (srcs.find((source) => source.id === page.src)?.annotations.get(page.index) ?? []).map(
      (annot) => ({ ...annot, id: uid("a"), page: page.id }),
    ),
  );
  return {
    readOnly: srcs.some((source) => source.readOnly),
    reading: srcs.some((source) => source.readOnly),
    readOnlyReason: srcs.find((source) => source.readOnly)?.readOnlyReason,
    canCopy: srcs.every((source) => source.canCopy),
    id: uid("doc"),
    name,
    path,
    originalPath: path,
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

/** User-reviewed local conversion is a new unsaved PDF; the Office source remains protected. */
export async function openConvertedPdf(
  bytes: Uint8Array,
  name: string,
  origin: string | readonly string[],
  options: { signal?: AbortSignal; beforeCommit?: () => Promise<void> } = {},
): Promise<DocState> {
  options.signal?.throwIfAborted();
  const originPaths = typeof origin === "string" ? [origin] : [...origin];
  const source = await loadSource(bytes, name, () => Promise.resolve(null));
  try {
    await options.beforeCommit?.();
    options.signal?.throwIfAborted();
  } catch (error) {
    releaseSource(source.id);
    throw error;
  }
  source.originPath = originPaths[0];
  const doc = makeDoc(name, null, [source], source.id);
  doc.content = { ...doc.content, requiresCopy: true };
  doc.originPaths = originPaths;
  addDoc(doc);
  return doc;
}

async function detectForms(doc: DocState): Promise<void> {
  for (const id of doc.sourceIds) {
    const src = getSource(id);
    if (!src) continue;
    try {
      const fields = await src.pdf.getFieldObjects();
      if (fields && (fields instanceof Map ? fields.size : Object.keys(fields).length))
        patchDoc(doc.id, { hasForms: true });
    } catch {
      // No AcroForm.
    }
  }
}

async function rememberRecent(path: string, name: string, src: Source): Promise<void> {
  const preferences = usePreferences.getState().value;
  if (!preferences.rememberRecents) return;
  let thumb: string | undefined;
  try {
    if (preferences.recentThumbnails)
      thumb = await renderToDataUrl(
        { id: "thumb", src: src.id, index: 0, rotation: 0 },
        180,
        "image/jpeg",
        0.7,
      );
  } catch {
    thumb = undefined;
  }
  try {
    const recents = await api.recent.add({
      path,
      name,
      openedAt: Date.now(),
      pages: src.info.length,
      thumb,
    });
    useApp.setState({ recents });
  } catch (error) {
    toast(
      `Recentes não atualizados: ${error instanceof Error ? error.message : "falha de gravação local"}`,
      { tone: "error" },
    );
  }
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
  const results = await Promise.allSettled(paths.map((path) => api.readFile(path)));
  const files = results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  if (files.length < paths.length) toast("Algum arquivo não pôde ser lido.", { tone: "error" });
  await openFiles(files);
}

export async function openDialog(): Promise<void> {
  await openFiles(await chooseFiles({ images: true }));
}

/** Creates a new unsaved document from several PDFs and images, in order. */
export async function combineFiles(files: OpenedFile[], name = "Combinado.pdf"): Promise<void> {
  if (!files.length) return;
  busy("Combinando arquivos…");
  const srcs = await loadAllSources(files);
  if (!srcs?.length) return;
  addDoc(makeDoc(name, null, srcs, srcs[0].id));
}

export function newBlankDocument(): void {
  addDoc(
    makeDoc("Sem título.pdf", null, [], null, [
      { id: uid("p"), src: "", index: 0, rotation: 0, blank: { ...A4 } },
    ]),
  );
}

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export async function saveDoc(docId: string, saveAs = false): Promise<boolean> {
  if (!finishDraft(docId)) return false;
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return false;
  if (doc.readOnly) {
    toast("Documento em leitura. Reabra com a senha de administração para salvar alterações.", {
      tone: "error",
    });
    return false;
  }
  const originalDestination = !doc.path || doc.path === doc.originalPath;
  const signedSource = originalDestination && doc.sourceIds.some((id) => getSource(id)?.signed);
  if (signedSource) {
    const choice = await api.message({
      type: "warning",
      title: "PDF com assinatura existente",
      message: "Salvar alterações pode invalidar assinaturas existentes.",
      detail:
        "O EdiPDF não verifica certificados. O original será preservado; escolha um destino para a cópia.",
      buttons: ["Salvar cópia…", "Cancelar"],
    });
    if (choice !== 0) return false;
  }
  let path = doc.path;
  const protectedSource =
    originalDestination && doc.sourceIds.some((id) => getSource(id)?.encrypted);
  const requiredCopy = !!doc.content.requiresCopy && (!doc.path || doc.path === doc.originalPath);
  if (!path || saveAs || protectedSource || signedSource || requiredCopy) {
    path = await api.saveDialog(
      protectedSource || signedSource || requiredCopy
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
    const bytes = await buildDoc(doc, content);
    if (protectedSource || signedSource || requiredCopy || saveAs || path !== doc.path)
      await api.writeCopy(path, bytes);
    else await api.writeFile(path, bytes);
    patchDoc(docId, { path, name: baseName(path), saved: content });
    try {
      await api.versions.save(recoverySnapshot({ ...doc, path, content, draft: null }));
    } catch (error) {
      toast(
        `PDF salvo; histórico local indisponível: ${error instanceof Error ? error.message : "falha local"}`,
        { tone: "error", ms: 8000 },
      );
    }
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

export async function printDoc(docId: string): Promise<void> {
  if (!finishDraft(docId)) return;
  if (!useApp.getState().docs.some((doc) => doc.id === docId)) return;
  useApp.setState({ activeId: docId, dialog: { kind: "printing" } });
}

/** Content restricted to some pages, keeping their annotations. */
const subset = (c: DocContent, ids: Set<string>): DocContent => ({
  ...c,
  pages: c.pages.filter((p) => ids.has(p.id)),
  annots: c.annots.filter((a) => ids.has(a.page)),
});

/** Opens the selected pages as a new, unsaved document. */
export function extractPages(docId: string, pageIds: string[]): void {
  if (!finishDraft(docId)) return;
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
  releaseDocumentText(docId);
  releaseDocumentPreview(docId);
  releaseWorkspaceView(docId);
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
  let discard = false;
  if (dirty.length) {
    const choice = await api.confirmUnsaved(dirty.map((d) => d.name));
    if (choice === "cancel") return;
    if (choice === "save") for (const d of dirty) if (!(await saveDoc(d.id))) return;
    discard = choice === "discard";
  }
  try {
    await flushSession();
  } catch (error) {
    toast(`Sessão não salva: ${error instanceof Error ? error.message : "falha local"}`, {
      tone: "error",
    });
  }
  await stopRecoveryAutosave();
  if (discard) {
    try {
      for (const doc of dirty) await api.recovery.remove(doc.id);
    } catch (failure) {
      await api.message({
        type: "warning",
        message:
          "O trabalho foi descartado, mas uma cópia de recuperação local não pôde ser removida.",
        detail:
          failure instanceof Error
            ? failure.message
            : "Remova a cópia pela tela inicial na próxima abertura.",
      });
    }
  }
  api.closeNow();
}

// ---- Text measurement ---------------------------------------------------------------------

const measureCtx = document.createElement("canvas").getContext("2d")!;

export function measureText(a: Pick<TextAnnot, "text" | "font" | "size" | "bold" | "italic">): {
  w: number;
  h: number;
} {
  measureCtx.font = `${a.italic ? "italic " : ""}${a.bold ? "bold " : ""}${a.size}px ${cssFontForText(a.font, a.text)}`;
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
  commit(docId, (c) => executeDocumentTransaction(c, [{ type: "pages.delete", ids }]), {
    selection: [],
  });
  toast(`${ids.length} ${ids.length === 1 ? "página excluída" : "páginas excluídas"}`, {
    action: { label: "Desfazer", run: () => undo(docId) },
  });
}

export function duplicatePages(docId: string, ids: string[]): void {
  commit(docId, (c) => executeDocumentTransaction(c, [{ type: "pages.duplicate", ids }]));
}

/** Moves the given pages so they start at `to` (an index in the current order). */
export function movePages(docId: string, ids: string[], to: number): void {
  commit(docId, (c) => executeDocumentTransaction(c, [{ type: "pages.move", ids, to }]));
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
  const srcs = await loadAllSources(files);
  if (!srcs?.length) return;
  const pages = srcs.flatMap(pagesOf);
  const annotations = pages.flatMap((page) =>
    (srcs.find((source) => source.id === page.src)?.annotations.get(page.index) ?? []).map(
      (annot) => ({ ...annot, id: uid("a"), page: page.id }),
    ),
  );
  patchDoc(docId, (d) => ({
    sourceIds: [...d.sourceIds, ...srcs.map((s) => s.id)],
    primary: d.primary ?? srcs[0].id,
  }));
  commit(
    docId,
    (c) => ({
      ...c,
      annots: [...c.annots, ...annotations],
      pages: [...c.pages.slice(0, at), ...pages, ...c.pages.slice(at)],
    }),
    { selection: pages.map((p) => p.id) },
  );
  const inserted = useApp.getState().docs.find((d) => d.id === docId);
  if (inserted) void detectForms(inserted);
  toast(`${pages.length} ${pages.length === 1 ? "página inserida" : "páginas inseridas"}`, {
    tone: "ok",
  });
}

export async function insertFromFiles(docId: string, at: number): Promise<void> {
  await insertFilesAt(docId, at, await chooseFiles({ images: true, title: "Inserir páginas de…" }));
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
  validateRasterImage(bytes, bytes[0] === 0x89 ? "png" : "jpg");
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
  opts: { signature?: boolean; maxWidth?: number; document?: DocState } = {},
): Promise<void> {
  const doc = opts.document ?? activeDoc();
  if (!doc) return;
  const page = doc.content.pages[doc.currentPage] ?? doc.content.pages[0];
  const { w: W, h: H } = viewSize(page, pageInfo(page));
  const nat = await imageSize(src);
  const state = useApp.getState(), current = state.docs.find((item) => item.id === doc.id);
  if (!current || state.activeId !== doc.id || current.content !== doc.content || current.currentPage !== doc.currentPage)
    throw new Error("O documento mudou durante a leitura da imagem. Insira novamente.");
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
  const [file] = await chooseFiles({ images: true, multi: false, title: "Escolher imagem" });
  if (!file) return;
  if (!isImageName(file.name)) {
    toast("Escolha uma imagem PNG ou JPG.", { tone: "error" });
    return;
  }
  try {
    await placeImage(bytesToDataUrl(file.bytes));
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : "Não foi possível inserir a imagem.", {
      tone: "error",
    });
  }
}

export const dirtyCount = (): number => useApp.getState().docs.filter(isDirty).length;

export async function restoreRecovery(id: string, version = false): Promise<void> {
  if (useApp.getState().busy) return;
  busy("Recuperando trabalho local…");
  const loaded: Source[] = [];
  try {
    const snapshot = await (version ? api.versions.load(id) : api.recovery.load(id));
    if (version || useApp.getState().docs.some((document) => document.id === snapshot.id))
      snapshot.id = uid("doc");
    const remap = new Map<string, string>();
    for (const source of snapshot.sources) {
      const bytes = Uint8Array.from(atob(source.data), (ch) => ch.charCodeAt(0));
      const value = await loadSource(bytes, source.name, (retry) =>
        askPassword(source.name, retry),
      );
      loaded.push(value);
      remap.set(source.id, value.id);
    }
    const content: DocContent = {
      ...snapshot.content,
      baseSource: snapshot.content.baseSource ? remap.get(snapshot.content.baseSource) : undefined,
      pages: snapshot.content.pages.map((page) => ({
        ...page,
        src: remap.get(page.src) ?? page.src,
      })),
      forms: Object.fromEntries(
        Object.entries(snapshot.content.forms).map(([key, value]) => {
          const at = key.indexOf("\u001f");
          return [
            at < 0 ? key : `${remap.get(key.slice(0, at)) ?? key.slice(0, at)}${key.slice(at)}`,
            value,
          ];
        }),
      ),
    };
    for (const page of content.pages)
      if (!page.blank) {
        const source = loaded.find((item) => item.id === page.src);
        if (!source || page.index >= source.info.length)
          throw new Error("Página inexistente na recuperação.");
      }
    const doc = makeDoc(
      snapshot.name,
      null,
      loaded,
      snapshot.primary ? (remap.get(snapshot.primary) ?? null) : null,
      content.pages,
    );
    doc.originPaths = snapshot.originPaths;
    const draft = snapshot.draft;
    if (
      draft &&
      (draft.annot.kind !== "text" ||
        (draft.before && draft.before.kind !== "text") ||
        (draft.cover && draft.cover.kind !== "rect"))
    )
      throw new Error("Rascunho inválido na recuperação.");
    if (draft && draft.annot.kind === "text")
      addDoc({
        ...doc,
        id: snapshot.id,
        content,
        draft: {
          annot: draft.annot,
          before: draft.before?.kind === "text" ? draft.before : undefined,
          cover: draft.cover?.kind === "rect" ? draft.cover : undefined,
          existing: draft.existing,
        },
      });
    else addDoc({ ...doc, id: snapshot.id, content });
    useApp.setState((s) => ({
      dialog: null,
      recoveries: s.recoveries.filter((item) => item.id !== id),
    }));
    toast("Trabalho recuperado. Salve uma cópia para escolher o destino.", {
      tone: "ok",
      ms: 7000,
    });
  } catch (error) {
    for (const source of loaded) releaseSource(source.id);
    toast(
      error instanceof Error
        ? `Não foi possível recuperar: ${error.message}`
        : "Não foi possível recuperar o trabalho.",
      { tone: "error", ms: 7000 },
    );
  } finally {
    busy(null);
  }
}
