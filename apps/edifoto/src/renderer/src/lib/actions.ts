import { validateDimensions } from "@shared/documentFormat";
import { createImageTemplate, type TemplateId } from "@shared/templates";
import { withBitmapReplacement } from "@/engine/bitmaps";
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
  editLayer,
  mergeDown,
  OpError,
  requireDoc,
  rotateImage,
} from "./ops";
import { assertNotPainting } from "./paint";
import { discardRecovery } from "./recovery";

/** User-facing actions shared by menus, shortcuts, the quick dock and the AI tools. */

export function autoAdjust(strength = 1): string {
  const doc = requireDoc();
  const existing = doc.layers.find(
    (layer) => layer.kind === "adjust" && layer.name === "Ajuste automático" && !layer.locked,
  );
  const adjust = autoAdjustFor(
    analyzeDoc(
      existing ? { ...doc, layers: doc.layers.filter((layer) => layer.id !== existing.id) } : doc,
    ),
    strength,
  );
  if (existing) {
    editLayer(existing.id, { adjust });
    useDoc.getState().setActive(existing.id);
    useUi.setState({ tab: "props" });
    return existing.id;
  }
  const top = doc.layers[doc.layers.length - 1]?.id;
  const id = addLayer({ kind: "adjust", name: "Ajuste automático", adjust, above: top });
  useUi.setState({ tab: "props" });
  return id;
}

/** "Luz" and "Cor" in the quick dock: a named adjustment layer on top, opened in Propriedades. */
export function quickAdjust(kind: "light" | "color"): void {
  const doc = requireDoc();
  const name = kind === "light" ? "Luz" : "Cor";
  const existing = doc.layers.find(
    (layer) => layer.kind === "adjust" && layer.name === name && !layer.locked,
  );
  if (existing) {
    useDoc.getState().setActive(existing.id);
    useUi.setState({ tab: "props" });
    return;
  }
  const id = addLayer({
    kind: "adjust",
    name,
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
  assertNotPainting();
  const s = useDoc.getState();
  if (!s.doc || !s.dirty) return true;
  const answer = await useUi
    .getState()
    .ask("Descartar alterações?", `"${s.doc.name}" tem alterações não salvas.`, "Descartar");
  assertNotPainting();
  const current = useDoc.getState();
  if (current.initialStateId !== s.initialStateId || current.revision !== s.revision)
    throw new Error("A edição mudou durante a confirmação. Tente novamente.");
  return answer;
}

export const actions = {
  async template(id: TemplateId): Promise<boolean> {
    if (!(await canDiscard())) return false;
    withBitmapReplacement(new Map(), () => useDoc.getState().load(createImageTemplate(id)));
    useUi.setState((s) => ({
      fitRequest: s.fitRequest + 1,
      tab: "props",
      tool: "move",
      newDocumentOpen: false,
    }));
    return true;
  },
  newDocument: (): void => {
    useUi.setState({ newDocumentOpen: true });
  },
  async createDocument(
    name: string,
    width: number,
    height: number,
    background: string | null,
  ): Promise<boolean> {
    validateDimensions(width, height, compositor().maxTexture);
    if (!(await canDiscard())) return false;
    withBitmapReplacement(new Map(), () =>
      useDoc.getState().load(blankDoc(width, height, name.trim() || "Sem título", background)),
    );
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
  async receiveFiles(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const project = paths.find((path) => /\.edifoto$/i.test(path));
    if (!useDoc.getState().doc || project) await actions.openPath(project ?? paths[0]);
    else await placePaths(paths);
  },
  async place(): Promise<void> {
    requireDoc();
    const paths = await window.api.pickImages(true);
    if (paths.length) await placePaths(paths);
  },
  async close(): Promise<void> {
    if (await canDiscard()) {
      useDoc.getState().close();
      await discardRecovery();
    }
  },
  save: () => saveDocument(false),
  saveAs: () => saveDocument(true),
  exportDialog: () => {
    requireDoc();
    useUi.setState({ exportOpen: true });
  },
  async quickExport(): Promise<void> {
    const doc = requireDoc(),
      workspaceId = useDoc.getState().initialStateId;
    const check = () => {
      assertNotPainting();
      if (useDoc.getState().doc?.id !== doc.id || useDoc.getState().initialStateId !== workspaceId)
        throw new Error("A imagem mudou. Exporte novamente.");
    };
    const path = await window.api.pickSavePath(`${doc.name}.jpg`, "jpeg");
    if (!path) return;
    check();
    const out = await exportTo(path, { format: "jpeg", quality: 90, scale: 1 }, check);
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
