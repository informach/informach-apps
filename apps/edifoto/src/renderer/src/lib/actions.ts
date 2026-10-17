import { compositor } from "@/engine/compositor";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { analyzeDoc, autoAdjustFor } from "./analyze";
import { copyComposite, exportTo, openPath, placePaths, saveDocument } from "./files";
import {
  addLayer,
  blankDoc,
  deleteLayer,
  duplicateLayer,
  mergeDown,
  OpError,
  requireDoc,
  rotateImage,
} from "./ops";

/** User-facing actions shared by menus, shortcuts, the quick dock and the AI tools. */

export function autoAdjust(strength = 1): string {
  const doc = requireDoc();
  const adjust = autoAdjustFor(analyzeDoc(doc), strength);
  const top = doc.layers[doc.layers.length - 1]?.id;
  return addLayer({ kind: "adjust", name: "Ajuste automático", adjust, above: top });
}

/** "Luz" and "Cor" in the quick dock: a named adjustment layer on top, opened in Propriedades. */
export function quickAdjust(kind: "light" | "color"): void {
  const doc = requireDoc();
  const id = addLayer({
    kind: "adjust",
    name: kind === "light" ? "Luz" : "Cor",
    above: doc.layers[doc.layers.length - 1]?.id,
  });
  useDoc.getState().setActive(id);
  useUi.setState({ tab: "props" });
}

export function addText(): void {
  const doc = requireDoc();
  addLayer({ kind: "text", above: doc.layers[doc.layers.length - 1]?.id });
  useUi.setState((s) => ({ tab: "props", focusText: s.focusText + 1, tool: "move" }));
}

/** Runs an action and turns errors into a toast. */
export function attempt(fn: () => unknown | Promise<unknown>): void {
  void (async () => {
    try {
      await fn();
    } catch (err) {
      useUi
        .getState()
        .toast(err instanceof OpError || err instanceof Error ? err.message : String(err), "error");
    }
  })();
}

/** Leaves the open document only after the user agrees to drop unsaved changes. */
async function canDiscard(): Promise<boolean> {
  const s = useDoc.getState();
  if (!s.doc || !s.dirty) return true;
  return useUi
    .getState()
    .ask("Descartar alterações?", `"${s.doc.name}" tem alterações não salvas.`, "Descartar");
}

export const actions = {
  newDocument: (): void => {
    useUi.setState({ newDocumentOpen: true });
  },
  async createDocument(
    name: string,
    width: number,
    height: number,
    background: string | null,
  ): Promise<boolean> {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 32000000
    ) {
      throw new OpError(
        "Use dimensões inteiras de 1 a 8192 px, com até 32 milhões de pixels no total.",
      );
    }
    if (!(await canDiscard())) return false;
    const doc = blankDoc(width, height, name.trim() || "Sem título", background);
    useDoc.getState().load(doc);
    useDoc.setState({ dirty: true });
    useUi.setState((s) => ({
      newDocumentOpen: false,
      tool: "move",
      springTool: null,
      paintTarget: "layer",
      beforeAfter: false,
      previewMode: null,
      tab: "layers",
      fitRequest: s.fitRequest + 1,
    }));
    return true;
  },
  async open(): Promise<void> {
    const path = await window.api.pickDocument();
    if (path && (await canDiscard())) await openPath(path);
  },
  async openPath(path: string): Promise<void> {
    if (await canDiscard()) await openPath(path);
  },
  async place(): Promise<void> {
    requireDoc();
    const paths = await window.api.pickImages(true);
    if (paths.length) await placePaths(paths);
  },
  async close(): Promise<void> {
    if (await canDiscard()) useDoc.getState().close();
  },
  save: () => saveDocument(false),
  saveAs: () => saveDocument(true),
  exportDialog: () => {
    requireDoc();
    useUi.setState({ exportOpen: true });
  },
  async quickExport(): Promise<void> {
    const doc = requireDoc();
    const path = await window.api.pickSavePath(`${doc.name}.jpg`, "jpeg");
    if (!path) return;
    const out = await exportTo(path, { format: "jpeg", quality: 90, scale: 1 });
    useUi.getState().toast(`Exportado: ${out.split(/[\\/]/).pop()}`, "ok", {
      label: "Mostrar na pasta",
      run: () => void window.api.showInFolder(out),
    });
  },
  copy: () => copyComposite(),
  undo: () => useDoc.getState().undo(),
  redo: () => useDoc.getState().redo(),
  newLayer: () => addLayer({ kind: "empty" }),
  duplicate: () => {
    const id = useDoc.getState().activeId;
    if (id) duplicateLayer(id);
  },
  remove: () => {
    const id = useDoc.getState().activeId;
    if (id) deleteLayer(id);
  },
  mergeDown: () => {
    const id = useDoc.getState().activeId;
    if (!id) return;
    mergeDown(id, (doc, ids) => {
      const only = { ...doc, layers: doc.layers.filter((l) => ids.includes(l.id)) };
      const c = compositor().renderToCanvas(only);
      return c;
    });
  },
  rotate: () => rotateImage(1),
  autoAdjust: () => autoAdjust(),
  fit: () => useUi.setState((s) => ({ fitRequest: s.fitRequest + 1 })),
};
